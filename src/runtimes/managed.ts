import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
  createAgentProxyError,
  isAgentProxyError,
  type ProviderMetadata,
  type RuntimeStatus,
} from "../core/index.js";
import {
  OPENCODE_MINIMUM_SUPPORTED_VERSION,
  probeOpenCodeBinary,
  type OpenCodeBinaryProbe,
  type ProbeOpenCodeBinaryOptions,
} from "../providers/opencode/binary.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/constants.js";
import type { AgentProxyStorage, StoredRuntimeRecord } from "../storage/index.js";
import { RuntimeRegistry } from "./registry.js";

export const OPENCODE_MANAGED_RUNTIME_METADATA_KEY = "agentproxyOpenCodeManagedRuntime";
export const OPENCODE_MANAGED_RUNTIME_DEFAULT_HOSTNAME = "127.0.0.1";
export const OPENCODE_MANAGED_RUNTIME_DEFAULT_PORT = 4096;
export const OPENCODE_MANAGED_RUNTIME_HEALTH_PATH = "/global/health";

export interface OpenCodeManagedRuntimeManagerOptions {
  storage?: AgentProxyStorage;
  registry?: RuntimeRegistry;
  binary?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  inheritParentEnv?: boolean;
  cwd?: string;
  now?: () => Date;
  healthTimeoutMs?: number;
  healthPollIntervalMs?: number;
  healthRequestTimeoutMs?: number;
  healthStabilityMs?: number;
  stopTimeoutMs?: number;
  runtimeIdFactory?: () => string;
}

export interface StartOpenCodeManagedRuntimeInput {
  id?: string;
  workspacePath?: string;
  hostname?: string;
  port?: number;
  metadata?: ProviderMetadata;
  signal?: AbortSignal;
}

export interface OpenCodeManagedRuntimeMetadata {
  ownedBy: "agentproxy";
  binary: {
    binary: string;
    resolvedPath: string;
    source: OpenCodeBinaryProbe["source"];
    version: string;
    minimumSupportedVersion: string;
  };
  healthPath: string;
  launchArgs: string[];
  requestedPort: number;
  selectedPort: number;
  portWasOccupied: boolean;
  startedAt: string;
  healthCheckedAt?: string;
  stopRequested?: boolean;
  stopRequestedAt?: string;
  failureReason?: string;
  exit?: OpenCodeManagedRuntimeExitMetadata;
}

export interface OpenCodeManagedRuntimeExitMetadata {
  observedAt: string;
  expected: boolean;
  code?: number;
  signal?: string;
  errorMessage?: string;
}

interface PortSelection {
  port: number;
  wasOccupied: boolean;
}

interface ManagedChildEntry {
  runtimeId: string;
  providerId: string;
  child: ChildProcess;
  ready: boolean;
  stopReason?: "requested" | "startup_timeout" | "dispose";
  exitResult?: ManagedChildExitResult;
  resolveExit: (result: ManagedChildExitResult) => void;
  exitPromise: Promise<ManagedChildExitResult>;
}

interface ManagedChildExitResult {
  observedAt: string;
  code?: number;
  signal?: string;
  error?: Error;
}

const ACTIVE_RUNTIME_STATUSES = new Set<RuntimeStatus>([
  "discovered",
  "starting",
  "attached",
  "healthy",
  "degraded",
  "reconnecting",
  "stopping",
]);

export class OpenCodeManagedRuntimeManager {
  readonly registry: RuntimeRegistry;

  private readonly binary: string | undefined;
  private readonly env: Record<string, string | undefined>;
  private readonly cwd: string | undefined;
  private readonly now: () => Date;
  private readonly healthTimeoutMs: number;
  private readonly healthPollIntervalMs: number;
  private readonly healthRequestTimeoutMs: number;
  private readonly healthStabilityMs: number;
  private readonly stopTimeoutMs: number;
  private readonly runtimeIdFactory: () => string;
  private readonly children = new Map<string, ManagedChildEntry>();
  private readonly startingRuntimeIds = new Set<string>();

  constructor(options: OpenCodeManagedRuntimeManagerOptions) {
    this.now = options.now ?? (() => new Date());
    this.registry = buildRuntimeRegistry(options, this.now);
    this.binary = options.binary;
    this.env = createEffectiveEnvironment(options.env, options.inheritParentEnv ?? true);
    this.cwd = options.cwd;
    this.healthTimeoutMs = options.healthTimeoutMs ?? 10_000;
    this.healthPollIntervalMs = options.healthPollIntervalMs ?? 100;
    this.healthRequestTimeoutMs = options.healthRequestTimeoutMs ?? 1_000;
    this.healthStabilityMs = options.healthStabilityMs ?? 50;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    this.runtimeIdFactory = options.runtimeIdFactory ?? defaultRuntimeIdFactory;
  }

  async startManagedRuntime(
    input: StartOpenCodeManagedRuntimeInput = {},
  ): Promise<StoredRuntimeRecord> {
    const providerId = OPENCODE_PROVIDER_ID;
    const runtimeId = input.id ?? this.runtimeIdFactory();
    const hostname = input.hostname ?? OPENCODE_MANAGED_RUNTIME_DEFAULT_HOSTNAME;
    const requestedPort = input.port ?? OPENCODE_MANAGED_RUNTIME_DEFAULT_PORT;
    assertValidPort(requestedPort, "opencode.managedRuntime.start");
    this.reserveRuntimeId(runtimeId);

    try {
      const binaryProbe = probeOpenCodeBinary(
        buildProbeOptions(this.binary, this.env, this.runtimeCwd(input.workspacePath)),
      );
      const portSelection = await chooseManagedPort(hostname, requestedPort);
      this.assertRegistryRuntimeIdAvailable(runtimeId);
      const baseUrl = buildBaseUrl(hostname, portSelection.port);
      const launchArgs = ["serve", "--hostname", hostname, "--port", String(portSelection.port)];
      const startedAt = this.nowIso();
      const managedMetadata = buildInitialManagedMetadata({
        binaryProbe,
        healthPath: OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
        launchArgs,
        requestedPort,
        selectedPort: portSelection.port,
        portWasOccupied: portSelection.wasOccupied,
        startedAt,
      });

      this.registry.register({
        id: runtimeId,
        providerId,
        mode: "managed",
        status: "starting",
        baseUrl,
        hostname,
        port: portSelection.port,
        startedAt,
        ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
        metadata: {
          ...(input.metadata ?? {}),
          [OPENCODE_MANAGED_RUNTIME_METADATA_KEY]: managedMetadata,
        },
      });

      let entry: ManagedChildEntry;
      try {
        const child = spawn(binaryProbe.resolvedPath, launchArgs, {
          cwd: this.runtimeCwd(input.workspacePath),
          env: this.env,
          stdio: "ignore",
        });
        entry = this.trackChild(runtimeId, providerId, child);
      } catch (error) {
        this.registerRuntimeFailure(runtimeId, {
          failureReason: "spawn_error",
          exit: buildExitMetadata(buildErrorExitResult(this.nowIso(), error), false),
        });
        throw createRuntimeStartFailedError(
          "OpenCode managed runtime could not be spawned.",
          error,
        );
      }

      this.registry.register({
        id: runtimeId,
        providerId,
        mode: "managed",
        status: "starting",
        ...(entry.child.pid !== undefined ? { pid: entry.child.pid } : {}),
        metadata: this.mergeManagedMetadata(runtimeId, {}),
      });

      try {
        await this.waitForHealth(entry, baseUrl, input.signal);
        if (entry.exitResult !== undefined) {
          throw createProcessExitBeforeHealthError(entry.exitResult);
        }
        entry.ready = true;
        return this.registry.register({
          id: runtimeId,
          providerId,
          mode: "managed",
          status: "healthy",
          metadata: this.mergeManagedMetadata(runtimeId, {
            healthCheckedAt: this.nowIso(),
          }),
        });
      } catch (error) {
        if (isAgentProxyError(error) && error.code === "RUNTIME_START_FAILED") {
          throw error;
        }

        entry.stopReason = "startup_timeout";
        this.registerRuntimeFailure(runtimeId, {
          failureReason: "health_timeout",
        });
        await this.terminateChild(entry);
        throw normalizeHealthError(error, baseUrl);
      }
    } finally {
      this.startingRuntimeIds.delete(runtimeId);
    }
  }

  async stopManagedRuntime(runtimeId: string): Promise<StoredRuntimeRecord> {
    const entry = this.children.get(runtimeId);
    if (entry === undefined) {
      throw createAgentProxyError({
        code: "CAPABILITY_UNSUPPORTED",
        message:
          "Only OpenCode managed runtimes started by this AgentProxy process can be stopped.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.managedRuntime.stop",
        details: {
          runtimeId,
          runtimeMode: this.registry.get(runtimeId)?.mode,
        },
      });
    }

    entry.stopReason = "requested";
    this.registry.register({
      id: entry.runtimeId,
      providerId: entry.providerId,
      mode: "managed",
      status: "stopping",
      metadata: this.mergeManagedMetadata(entry.runtimeId, {
        stopRequested: true,
        stopRequestedAt: this.nowIso(),
      }),
    });

    await this.terminateChild(entry);
    return (
      this.registry.get(runtimeId) ??
      this.registry.register({
        id: entry.runtimeId,
        providerId: entry.providerId,
        mode: "managed",
        status: "stopped",
        stoppedAt: this.nowIso(),
        metadata: this.mergeManagedMetadata(entry.runtimeId, {
          stopRequested: true,
        }),
      })
    );
  }

  async dispose(): Promise<void> {
    const entries = [...this.children.values()];
    await Promise.all(
      entries.map(async (entry) => {
        entry.stopReason = "dispose";
        try {
          await this.terminateChild(entry);
        } catch {
          // Best-effort cleanup for tests and interrupted callers.
        }
      }),
    );
  }

  private trackChild(
    runtimeId: string,
    providerId: string,
    child: ChildProcess,
  ): ManagedChildEntry {
    let resolveExit: (result: ManagedChildExitResult) => void = () => undefined;
    const exitPromise = new Promise<ManagedChildExitResult>((resolve) => {
      resolveExit = resolve;
    });
    const entry: ManagedChildEntry = {
      runtimeId,
      providerId,
      child,
      ready: false,
      resolveExit,
      exitPromise,
    };

    child.once("exit", (code, signal) => {
      this.handleChildExit(entry, {
        observedAt: this.nowIso(),
        ...(code !== null ? { code } : {}),
        ...(signal !== null ? { signal } : {}),
      });
    });
    child.once("error", (error) => {
      this.handleChildExit(entry, {
        observedAt: this.nowIso(),
        error,
      });
    });

    this.children.set(runtimeId, entry);
    return entry;
  }

  private handleChildExit(entry: ManagedChildEntry, result: ManagedChildExitResult): void {
    if (entry.exitResult !== undefined) {
      return;
    }

    entry.exitResult = result;
    this.children.delete(entry.runtimeId);

    const expected = entry.stopReason === "requested" || entry.stopReason === "startup_timeout";
    const status: RuntimeStatus = entry.stopReason === "requested" ? "stopped" : "failed";
    const failureReason = failureReasonForExit(entry);

    this.registry.register({
      id: entry.runtimeId,
      providerId: entry.providerId,
      mode: "managed",
      status,
      ...(status === "stopped" ? { stoppedAt: result.observedAt } : {}),
      metadata: this.mergeManagedMetadata(entry.runtimeId, {
        ...(failureReason !== undefined ? { failureReason } : {}),
        exit: buildExitMetadata(result, expected),
      }),
    });
    entry.resolveExit(result);
  }

  private async waitForHealth(
    entry: ManagedChildEntry,
    baseUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= this.healthTimeoutMs) {
      if (signal?.aborted === true) {
        throw createHealthFailedError(baseUrl, "OpenCode managed runtime health wait was aborted.");
      }
      if (entry.exitResult !== undefined) {
        throw createProcessExitBeforeHealthError(entry.exitResult);
      }
      if (await this.checkHealth(baseUrl, signal)) {
        await this.ensureChildDidNotExitBeforeHealthy(entry);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const remaining = this.healthTimeoutMs - elapsed;
      if (remaining <= 0) {
        break;
      }
      await delay(Math.min(this.healthPollIntervalMs, remaining));
    }

    if (entry.exitResult !== undefined) {
      throw createProcessExitBeforeHealthError(entry.exitResult);
    }

    throw createHealthFailedError(baseUrl, "OpenCode managed runtime did not become healthy.");
  }

  private reserveRuntimeId(runtimeId: string): void {
    const existingEntry = this.children.has(runtimeId);
    const alreadyStarting = this.startingRuntimeIds.has(runtimeId);
    if (!existingEntry && !alreadyStarting && !isActiveRuntime(this.registry.get(runtimeId))) {
      this.startingRuntimeIds.add(runtimeId);
      return;
    }

    throw duplicateRuntimeIdError(runtimeId, {
      existingRuntime: this.registry.get(runtimeId),
      ownedByCurrentProcess: existingEntry,
      alreadyStarting,
    });
  }

  private assertRegistryRuntimeIdAvailable(runtimeId: string): void {
    const existingRuntime = this.registry.get(runtimeId);
    if (!isActiveRuntime(existingRuntime)) {
      return;
    }

    throw duplicateRuntimeIdError(runtimeId, {
      existingRuntime,
      ownedByCurrentProcess: this.children.has(runtimeId),
      alreadyStarting: this.startingRuntimeIds.has(runtimeId),
    });
  }

  private async ensureChildDidNotExitBeforeHealthy(entry: ManagedChildEntry): Promise<void> {
    const observedExit = readObservedChildExit(entry);
    if (observedExit !== undefined) {
      this.handleChildExit(entry, observedExit);
      throw createProcessExitBeforeHealthError(observedExit);
    }

    const immediateExit = await observeExitWithin(entry.exitPromise, this.healthStabilityMs);
    if (immediateExit !== undefined) {
      throw createProcessExitBeforeHealthError(immediateExit);
    }
  }

  private async checkHealth(baseUrl: string, signal: AbortSignal | undefined): Promise<boolean> {
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => {
      controller.abort();
    }, this.healthRequestTimeoutMs);
    requestTimeout.unref();

    const abortExternalRequest = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", abortExternalRequest, { once: true });

    try {
      const response = await fetch(`${baseUrl}${OPENCODE_MANAGED_RUNTIME_HEALTH_PATH}`, {
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(requestTimeout);
      signal?.removeEventListener("abort", abortExternalRequest);
    }
  }

  private async terminateChild(entry: ManagedChildEntry): Promise<void> {
    if (entry.exitResult !== undefined) {
      return;
    }

    entry.child.kill("SIGTERM");
    const exited = await waitForExit(entry.exitPromise, this.stopTimeoutMs);
    if (exited) {
      return;
    }

    entry.child.kill("SIGKILL");
    await entry.exitPromise;
  }

  private registerRuntimeFailure(
    runtimeId: string,
    metadataPatch: Partial<OpenCodeManagedRuntimeMetadata>,
  ): StoredRuntimeRecord {
    return this.registry.register({
      id: runtimeId,
      providerId: OPENCODE_PROVIDER_ID,
      mode: "managed",
      status: "failed",
      metadata: this.mergeManagedMetadata(runtimeId, metadataPatch),
    });
  }

  private mergeManagedMetadata(
    runtimeId: string,
    patch: Partial<OpenCodeManagedRuntimeMetadata>,
  ): ProviderMetadata {
    const existing = this.registry.get(runtimeId)?.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY];
    const existingManagedMetadata = isRecord(existing) ? existing : {};

    return {
      [OPENCODE_MANAGED_RUNTIME_METADATA_KEY]: {
        ...existingManagedMetadata,
        ...patch,
      },
    };
  }

  private runtimeCwd(workspacePath: string | undefined): string | undefined {
    return workspacePath ?? this.cwd;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildRuntimeRegistry(
  options: OpenCodeManagedRuntimeManagerOptions,
  now: () => Date,
): RuntimeRegistry {
  if (options.registry !== undefined) {
    return options.registry;
  }
  if (options.storage !== undefined) {
    return new RuntimeRegistry({
      storage: options.storage,
      now,
    });
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "OpenCode managed runtime manager requires a storage or registry dependency.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.managedRuntime.create",
  });
}

function buildProbeOptions(
  binary: string | undefined,
  env: Record<string, string | undefined>,
  cwd: string | undefined,
): ProbeOpenCodeBinaryOptions {
  return {
    env,
    ...(binary !== undefined ? { binary } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
  };
}

function buildInitialManagedMetadata(input: {
  binaryProbe: OpenCodeBinaryProbe;
  healthPath: string;
  launchArgs: string[];
  requestedPort: number;
  selectedPort: number;
  portWasOccupied: boolean;
  startedAt: string;
}): OpenCodeManagedRuntimeMetadata {
  return {
    ownedBy: "agentproxy",
    binary: {
      binary: input.binaryProbe.binary,
      resolvedPath: input.binaryProbe.resolvedPath,
      source: input.binaryProbe.source,
      version: input.binaryProbe.version,
      minimumSupportedVersion:
        input.binaryProbe.minimumSupportedVersion ?? OPENCODE_MINIMUM_SUPPORTED_VERSION,
    },
    healthPath: input.healthPath,
    launchArgs: input.launchArgs,
    requestedPort: input.requestedPort,
    selectedPort: input.selectedPort,
    portWasOccupied: input.portWasOccupied,
    startedAt: input.startedAt,
  };
}

function buildErrorExitResult(observedAt: string, error: unknown): ManagedChildExitResult {
  return {
    observedAt,
    ...(error instanceof Error ? { error } : {}),
  };
}

async function chooseManagedPort(hostname: string, requestedPort: number): Promise<PortSelection> {
  if (await isPortAvailable(hostname, requestedPort)) {
    return {
      port: requestedPort,
      wasOccupied: false,
    };
  }

  return {
    port: await findEphemeralPort(hostname),
    wasOccupied: true,
  };
}

async function isPortAvailable(hostname: string, port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, hostname, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function findEphemeralPort(hostname: string): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => {
          reject(new Error("Unable to allocate an ephemeral TCP port."));
        });
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function buildBaseUrl(hostname: string, port: number): string {
  const host = hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
  return `http://${host}:${port}`;
}

function assertValidPort(port: number, operation: string): void {
  if (Number.isInteger(port) && port >= 1 && port <= 65_535) {
    return;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "OpenCode managed runtime port must be an integer from 1 to 65535.",
    providerId: OPENCODE_PROVIDER_ID,
    operation,
    details: {
      port,
    },
  });
}

async function waitForExit(
  exitPromise: Promise<ManagedChildExitResult>,
  timeoutMs: number,
): Promise<boolean> {
  const timeout = Symbol("timeout");
  const result = await Promise.race([exitPromise, delay(timeoutMs, timeout)]);
  return result !== timeout;
}

async function observeExitWithin(
  exitPromise: Promise<ManagedChildExitResult>,
  timeoutMs: number,
): Promise<ManagedChildExitResult | undefined> {
  const noExit = Symbol("no_exit");
  const result = await Promise.race([exitPromise, delay(timeoutMs, noExit)]);
  return result === noExit ? undefined : result;
}

function readObservedChildExit(entry: ManagedChildEntry): ManagedChildExitResult | undefined {
  if (entry.exitResult !== undefined) {
    return entry.exitResult;
  }

  const exitCode = entry.child.exitCode;
  const signalCode = entry.child.signalCode;
  if (exitCode === null && signalCode === null) {
    return undefined;
  }

  return {
    observedAt: new Date().toISOString(),
    ...(exitCode !== null ? { code: exitCode } : {}),
    ...(signalCode !== null ? { signal: signalCode } : {}),
  };
}

function buildExitMetadata(
  result: ManagedChildExitResult,
  expected: boolean,
): OpenCodeManagedRuntimeExitMetadata {
  const metadata: OpenCodeManagedRuntimeExitMetadata = {
    observedAt: result.observedAt,
    expected,
  };

  if (result.code !== undefined) {
    metadata.code = result.code;
  }
  if (result.signal !== undefined) {
    metadata.signal = result.signal;
  }
  if (result.error !== undefined) {
    metadata.errorMessage = result.error.message;
  }

  return metadata;
}

function failureReasonForExit(entry: ManagedChildEntry): string | undefined {
  if (entry.stopReason === "requested") {
    return undefined;
  }
  if (entry.stopReason === "startup_timeout") {
    return "health_timeout";
  }
  if (entry.exitResult?.error !== undefined) {
    return entry.ready ? "process_error" : "process_error_before_health";
  }

  return entry.ready ? "process_exit" : "process_exit_before_health";
}

function createProcessExitBeforeHealthError(result: ManagedChildExitResult): Error {
  return createRuntimeStartFailedError(
    "OpenCode managed runtime exited before health check succeeded.",
    result.error,
    {
      exitCode: result.code,
      exitSignal: result.signal,
    },
  );
}

function createRuntimeStartFailedError(
  message: string,
  cause?: unknown,
  details: Record<string, unknown> = {},
): Error {
  return createAgentProxyError({
    code: "RUNTIME_START_FAILED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.managedRuntime.start",
    cause,
    details,
  });
}

function duplicateRuntimeIdError(
  runtimeId: string,
  options: {
    existingRuntime: StoredRuntimeRecord | undefined;
    ownedByCurrentProcess: boolean;
    alreadyStarting: boolean;
  },
): Error {
  return createAgentProxyError({
    code: "RUNTIME_START_FAILED",
    message: "OpenCode managed runtime id is already active.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.managedRuntime.start",
    details: {
      runtimeId,
      existingMode: options.existingRuntime?.mode,
      existingStatus: options.existingRuntime?.status,
      ownedByCurrentProcess: options.ownedByCurrentProcess,
      alreadyStarting: options.alreadyStarting,
    },
  });
}

function createHealthFailedError(baseUrl: string, message: string): Error {
  return createAgentProxyError({
    code: "RUNTIME_HEALTH_FAILED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.managedRuntime.waitForHealth",
    details: {
      baseUrl,
      healthPath: OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
    },
  });
}

function normalizeHealthError(error: unknown, baseUrl: string): Error {
  if (isAgentProxyError(error)) {
    return error;
  }

  return createHealthFailedError(baseUrl, "OpenCode managed runtime health check failed.");
}

function createEffectiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
  inheritParentEnv: boolean,
): Record<string, string | undefined> {
  return {
    ...(inheritParentEnv ? process.env : {}),
    ...(env ?? {}),
  };
}

function defaultRuntimeIdFactory(): string {
  return `runtime_opencode_${randomUUID()}`;
}

function isActiveRuntime(runtime: StoredRuntimeRecord | undefined): boolean {
  return runtime !== undefined && ACTIVE_RUNTIME_STATUSES.has(runtime.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
