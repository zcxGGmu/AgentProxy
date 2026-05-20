import { randomUUID } from "node:crypto";
import {
  createAgentProxyError,
  isAgentProxyError,
  type AgentProxyErrorCode,
  type ProviderMetadata,
} from "../core/index.js";
import { redactString, redactValue } from "../logging/index.js";
import {
  probeOpenCodeBinary,
  type ProbeOpenCodeBinaryOptions,
} from "../providers/opencode/binary.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/constants.js";
import type { AgentProxyStorage, StoredRuntimeRecord } from "../storage/index.js";
import {
  OpenCodeManagedRuntimeManager,
  OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
  type OpenCodeManagedRuntimeManagerOptions,
  type StartOpenCodeManagedRuntimeInput,
} from "./managed.js";
import { OPENCODE_EVENT_STREAM_PATH } from "./events.js";
import { RuntimeRegistry } from "./registry.js";

export const OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS = {
  binary: "opencode.binary",
  registry: "opencode.runtime.registry",
  managedStart: "opencode.runtime.managed_start",
  health: "opencode.runtime.health",
  eventStream: "opencode.runtime.event_stream",
  managedStop: "opencode.runtime.managed_stop",
} as const;

export type OpenCodeRuntimeDiagnosticCheckId =
  (typeof OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS)[keyof typeof OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS];

export type OpenCodeRuntimeDiagnosticStatus = "passed" | "failed" | "skipped" | "warning";

export interface OpenCodeRuntimeDiagnosticsOptions {
  storage?: AgentProxyStorage;
  registry?: RuntimeRegistry;
  binary?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd?: string;
  now?: () => Date;
  requestTimeoutMs?: number;
  fetchImplementation?: typeof fetch;
  managedHealthTimeoutMs?: number;
  managedHealthPollIntervalMs?: number;
  managedStopTimeoutMs?: number;
}

export interface RunOpenCodeRuntimeDiagnosticsInput {
  runtimeId?: string;
  workspacePath?: string;
  includeManagedSmoke?: boolean;
  managedRuntimeId?: string;
  managedPort?: number;
  signal?: AbortSignal;
}

export interface OpenCodeRuntimeDiagnosticCheck {
  id: OpenCodeRuntimeDiagnosticCheckId;
  status: OpenCodeRuntimeDiagnosticStatus;
  message: string;
  providerId: typeof OPENCODE_PROVIDER_ID;
  runtimeId?: string;
  errorCode?: AgentProxyErrorCode;
  details: ProviderMetadata;
  durationMs: number;
}

export interface OpenCodeRuntimeDiagnosticCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  warning: number;
}

export interface OpenCodeGate3Capabilities {
  binary: boolean;
  registry: boolean;
  runtimeStart: boolean;
  runtimeConnect: boolean;
  eventStream: boolean;
  runtimeStop: boolean;
}

export interface OpenCodeGate3Summary {
  name: "Gate 3";
  passed: boolean;
  requiredCapabilities: readonly (keyof OpenCodeGate3Capabilities)[];
  capabilities: OpenCodeGate3Capabilities;
  missingCapabilities: (keyof OpenCodeGate3Capabilities)[];
}

export interface OpenCodeRuntimeDiagnosticReport {
  ok: boolean;
  providerId: typeof OPENCODE_PROVIDER_ID;
  generatedAt: string;
  counts: OpenCodeRuntimeDiagnosticCounts;
  gate3: OpenCodeGate3Summary;
  checks: OpenCodeRuntimeDiagnosticCheck[];
}

interface DiagnosticCheckResult {
  status?: OpenCodeRuntimeDiagnosticStatus;
  message: string;
  runtimeId?: string;
  details?: ProviderMetadata;
}

interface DiagnosticRuntimeUrl {
  baseUrl: string;
}

const GATE3_REQUIRED_CAPABILITIES: readonly (keyof OpenCodeGate3Capabilities)[] = [
  "binary",
  "registry",
  "runtimeStart",
  "runtimeConnect",
  "eventStream",
  "runtimeStop",
];

const ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES = [
  "healthy",
  "attached",
  "degraded",
  "reconnecting",
  "discovered",
  "starting",
] as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 1_000;

export class OpenCodeRuntimeDiagnostics {
  readonly registry: RuntimeRegistry;

  private readonly binary: string | undefined;
  private readonly env: Record<string, string | undefined>;
  private readonly cwd: string | undefined;
  private readonly now: () => Date;
  private readonly requestTimeoutMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly managedHealthTimeoutMs: number | undefined;
  private readonly managedHealthPollIntervalMs: number | undefined;
  private readonly managedStopTimeoutMs: number | undefined;

  constructor(options: OpenCodeRuntimeDiagnosticsOptions) {
    this.registry = buildRuntimeRegistry(options, options.now ?? (() => new Date()));
    this.binary = options.binary;
    this.env = createEffectiveEnvironment(options.env);
    this.cwd = options.cwd;
    this.now = options.now ?? (() => new Date());
    this.requestTimeoutMs = validatePositiveNumberOption(
      "requestTimeoutMs",
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.managedHealthTimeoutMs = options.managedHealthTimeoutMs;
    this.managedHealthPollIntervalMs = options.managedHealthPollIntervalMs;
    this.managedStopTimeoutMs = options.managedStopTimeoutMs;
  }

  async run(
    input: RunOpenCodeRuntimeDiagnosticsInput = {},
  ): Promise<OpenCodeRuntimeDiagnosticReport> {
    const checks: OpenCodeRuntimeDiagnosticCheck[] = [];
    let selectedRuntime: StoredRuntimeRecord | undefined;
    let managedManager: OpenCodeManagedRuntimeManager | undefined;
    let managedRuntimeId: string | undefined;
    let managedStopCompleted = false;

    try {
      checks.push(
        await this.runCheck(OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary, () =>
          this.checkBinary(input),
        ),
      );

      checks.push(
        await this.runCheck(OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.registry, () => {
          const result = this.checkRegistry(input);
          selectedRuntime = result.selectedRuntime;
          return result.check;
        }),
      );

      if (input.includeManagedSmoke === true) {
        const startCheck = await this.runCheck(
          OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStart,
          async () => {
            managedManager = this.createManagedRuntimeManager(input);
            const startInput: StartOpenCodeManagedRuntimeInput = {};
            if (input.managedRuntimeId !== undefined) {
              startInput.id = input.managedRuntimeId;
            }
            if (input.workspacePath !== undefined) {
              startInput.workspacePath = input.workspacePath;
            }
            if (input.managedPort !== undefined) {
              startInput.port = input.managedPort;
            }
            if (input.signal !== undefined) {
              startInput.signal = input.signal;
            }

            const runtime = await managedManager.startManagedRuntime(startInput);
            selectedRuntime = runtime;
            managedRuntimeId = runtime.id;

            return {
              message: "OpenCode managed runtime started successfully.",
              runtimeId: runtime.id,
              details: summarizeRuntime(runtime),
            };
          },
        );
        checks.push(startCheck);
      }

      checks.push(
        await this.runCheck(OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health, async () => {
          if (selectedRuntime === undefined) {
            return skippedCheck(
              "No OpenCode runtime with a base URL was available for health check.",
            );
          }

          return await this.checkRuntimeHealth(selectedRuntime, input.signal);
        }),
      );

      checks.push(
        await this.runCheck(OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream, async () => {
          if (selectedRuntime === undefined) {
            return skippedCheck(
              "No OpenCode runtime with a base URL was available for event stream check.",
            );
          }

          return await this.checkRuntimeEventStream(selectedRuntime, input.signal);
        }),
      );

      if (input.includeManagedSmoke === true) {
        const stopCheck = await this.runCheck(
          OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStop,
          async () => {
            if (managedManager === undefined || managedRuntimeId === undefined) {
              return skippedCheck(
                "Managed runtime did not start, so stop verification was skipped.",
              );
            }

            const stopped = await managedManager.stopManagedRuntime(managedRuntimeId);
            managedStopCompleted = true;
            return {
              message: "OpenCode managed runtime stopped successfully.",
              runtimeId: stopped.id,
              details: summarizeRuntime(stopped),
            };
          },
        );
        checks.push(stopCheck);
      }

      return buildReport({
        generatedAt: this.nowIso(),
        checks,
      });
    } finally {
      if (managedManager !== undefined && !managedStopCompleted) {
        await managedManager.dispose();
      }
    }
  }

  private checkBinary(input: RunOpenCodeRuntimeDiagnosticsInput): DiagnosticCheckResult {
    const probe = probeOpenCodeBinary(this.buildProbeOptions(input.workspacePath));
    return {
      message: "OpenCode binary is available and supported.",
      details: {
        binary: probe.binary,
        resolvedPath: probe.resolvedPath,
        source: probe.source,
        version: probe.version,
        minimumSupportedVersion: probe.minimumSupportedVersion,
      },
    };
  }

  private checkRegistry(input: RunOpenCodeRuntimeDiagnosticsInput): {
    selectedRuntime: StoredRuntimeRecord | undefined;
    check: DiagnosticCheckResult;
  } {
    const runtimes = this.registry.list({
      providerId: OPENCODE_PROVIDER_ID,
      ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
    });
    const selectedRuntime = selectRuntimeForDiagnostics({
      runtimes,
      registry: this.registry,
      runtimeId: input.runtimeId,
      workspacePath: input.workspacePath,
    });

    return {
      selectedRuntime,
      check: {
        message: "OpenCode runtime registry is readable.",
        details: {
          runtimeCount: runtimes.length,
          statusCounts: countBy(runtimes, (runtime) => runtime.status),
          modeCounts: countBy(runtimes, (runtime) => runtime.mode),
          ...(selectedRuntime !== undefined
            ? { selectedRuntime: summarizeRuntime(selectedRuntime) }
            : {}),
        },
      },
    };
  }

  private async checkRuntimeHealth(
    runtime: StoredRuntimeRecord,
    signal: AbortSignal | undefined,
  ): Promise<DiagnosticCheckResult> {
    const runtimeUrl = normalizeRuntimeDiagnosticUrl(runtime.baseUrl);
    let response: Response;
    let body: unknown;
    try {
      ({ response, body } = await this.withRequestTimeout(async (requestSignal) => {
        const healthResponse = await this.fetchImplementation(
          `${runtimeUrl.baseUrl}${OPENCODE_MANAGED_RUNTIME_HEALTH_PATH}`,
          {
            headers: {
              accept: "application/json",
            },
            signal: requestSignal,
          },
        );
        if (!healthResponse.ok) {
          await cancelResponseBody(healthResponse);
          return {
            response: healthResponse,
            body: undefined,
          };
        }

        return {
          response: healthResponse,
          body: await parseHealthJson(healthResponse, {
            runtimeId: runtime.id,
            serverUrl: runtimeUrl.baseUrl,
          }),
        };
      }, signal));
    } catch (error) {
      if (isAgentProxyError(error)) {
        throw error;
      }

      throw createRuntimeHealthDiagnosticError("OpenCode runtime health request failed.", {
        runtimeId: runtime.id,
        serverUrl: runtimeUrl.baseUrl,
        failureReason: "request_failed",
      });
    }

    if (!response.ok) {
      throw createRuntimeHealthDiagnosticError("OpenCode runtime health endpoint was unhealthy.", {
        runtimeId: runtime.id,
        serverUrl: runtimeUrl.baseUrl,
        status: response.status,
        failureReason: "unhealthy_response",
      });
    }

    const version = readOpenCodeHealthVersion(body);
    if (version === undefined) {
      throw createRuntimeHealthDiagnosticError(
        "OpenCode runtime health response was not recognized.",
        {
          runtimeId: runtime.id,
          serverUrl: runtimeUrl.baseUrl,
          failureReason: "unexpected_health_response",
        },
      );
    }

    return {
      message: "OpenCode runtime health endpoint is healthy.",
      runtimeId: runtime.id,
      details: {
        serverUrl: runtimeUrl.baseUrl,
        healthPath: OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
        version,
      },
    };
  }

  private async checkRuntimeEventStream(
    runtime: StoredRuntimeRecord,
    signal: AbortSignal | undefined,
  ): Promise<DiagnosticCheckResult> {
    const runtimeUrl = normalizeRuntimeDiagnosticUrl(runtime.baseUrl);
    let response: Response;
    try {
      response = await this.withRequestTimeout(
        async (requestSignal) =>
          await this.fetchImplementation(`${runtimeUrl.baseUrl}${OPENCODE_EVENT_STREAM_PATH}`, {
            headers: {
              accept: "text/event-stream",
            },
            signal: requestSignal,
          }),
        signal,
      );
    } catch (error) {
      if (isAgentProxyError(error)) {
        throw error;
      }

      throw createEventStreamDiagnosticError("OpenCode event stream request failed.", {
        runtimeId: runtime.id,
        serverUrl: runtimeUrl.baseUrl,
        eventPath: OPENCODE_EVENT_STREAM_PATH,
        failureReason: "request_failed",
      });
    }

    if (!response.ok) {
      await cancelResponseBody(response);
      throw createEventStreamDiagnosticError("OpenCode event stream endpoint was unhealthy.", {
        runtimeId: runtime.id,
        serverUrl: runtimeUrl.baseUrl,
        eventPath: OPENCODE_EVENT_STREAM_PATH,
        status: response.status,
        failureReason: "unhealthy_response",
      });
    }

    if (response.body === null) {
      throw createEventStreamDiagnosticError(
        "OpenCode event stream endpoint did not return a body.",
        {
          runtimeId: runtime.id,
          serverUrl: runtimeUrl.baseUrl,
          eventPath: OPENCODE_EVENT_STREAM_PATH,
          failureReason: "missing_response_body",
        },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (readMediaType(contentType) !== "text/event-stream") {
      await cancelResponseBody(response);
      throw createEventStreamDiagnosticError(
        "OpenCode event stream endpoint did not return text/event-stream.",
        {
          runtimeId: runtime.id,
          serverUrl: runtimeUrl.baseUrl,
          eventPath: OPENCODE_EVENT_STREAM_PATH,
          contentType,
          failureReason: "unexpected_content_type",
        },
      );
    }

    await cancelResponseBody(response);

    return {
      message: "OpenCode event stream endpoint is reachable.",
      runtimeId: runtime.id,
      details: {
        serverUrl: runtimeUrl.baseUrl,
        eventPath: OPENCODE_EVENT_STREAM_PATH,
        contentType,
      },
    };
  }

  private async runCheck(
    id: OpenCodeRuntimeDiagnosticCheckId,
    callback: () => DiagnosticCheckResult | Promise<DiagnosticCheckResult>,
  ): Promise<OpenCodeRuntimeDiagnosticCheck> {
    const startedAt = Date.now();
    try {
      const result = await callback();
      return {
        id,
        providerId: OPENCODE_PROVIDER_ID,
        status: result.status ?? "passed",
        message: sanitizeDiagnosticMessage(result.message),
        ...(result.runtimeId !== undefined ? { runtimeId: result.runtimeId } : {}),
        details: sanitizeDiagnosticDetails(result.details ?? {}),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return normalizeFailedCheck(id, error, Date.now() - startedAt);
    }
  }

  private createManagedRuntimeManager(
    input: RunOpenCodeRuntimeDiagnosticsInput,
  ): OpenCodeManagedRuntimeManager {
    const managerOptions: OpenCodeManagedRuntimeManagerOptions = {
      registry: this.registry,
      env: this.env,
      runtimeIdFactory: () => input.managedRuntimeId ?? `runtime_diagnostic_${randomUUID()}`,
    };
    const cwd = input.workspacePath ?? this.cwd;
    if (this.binary !== undefined) {
      managerOptions.binary = this.binary;
    }
    if (cwd !== undefined) {
      managerOptions.cwd = cwd;
    }
    if (this.managedHealthTimeoutMs !== undefined) {
      managerOptions.healthTimeoutMs = this.managedHealthTimeoutMs;
    }
    if (this.managedHealthPollIntervalMs !== undefined) {
      managerOptions.healthPollIntervalMs = this.managedHealthPollIntervalMs;
    }
    if (this.managedStopTimeoutMs !== undefined) {
      managerOptions.stopTimeoutMs = this.managedStopTimeoutMs;
    }

    return new OpenCodeManagedRuntimeManager(managerOptions);
  }

  private buildProbeOptions(workspacePath: string | undefined): ProbeOpenCodeBinaryOptions {
    const cwd = workspacePath ?? this.cwd;
    return {
      env: this.env,
      ...(this.binary !== undefined ? { binary: this.binary } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
    };
  }

  private async withRequestTimeout<T>(
    callback: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    if (signal?.aborted === true) {
      throw new Error("Diagnostic request was aborted.");
    }

    const controller = new AbortController();
    const requestTimeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);
    requestTimeout.unref();

    const abortExternalRequest = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", abortExternalRequest, { once: true });

    try {
      return await callback(controller.signal);
    } finally {
      clearTimeout(requestTimeout);
      signal?.removeEventListener("abort", abortExternalRequest);
    }
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildRuntimeRegistry(
  options: OpenCodeRuntimeDiagnosticsOptions,
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
    message: "OpenCode runtime diagnostics requires a storage or registry dependency.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.runtimeDiagnostics.create",
  });
}

function createEffectiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

function validatePositiveNumberOption(name: string, value: number): number {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: `OpenCode runtime diagnostics option ${name} must be a positive finite number.`,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.runtimeDiagnostics.create",
    details: {
      option: name,
      value: Number.isNaN(value) ? "NaN" : value,
    },
  });
}

function selectRuntimeForDiagnostics(input: {
  runtimes: readonly StoredRuntimeRecord[];
  registry: RuntimeRegistry;
  runtimeId: string | undefined;
  workspacePath: string | undefined;
}): StoredRuntimeRecord | undefined {
  if (input.runtimeId !== undefined) {
    const runtime = input.registry.get(input.runtimeId);
    if (runtime === undefined || runtime.providerId !== OPENCODE_PROVIDER_ID) {
      throw createAgentProxyError({
        code: "RUNTIME_HEALTH_FAILED",
        message: "Requested OpenCode runtime was not found in the registry.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.runtimeDiagnostics.registry",
        details: {
          runtimeId: input.runtimeId,
        },
      });
    }

    if (
      input.workspacePath !== undefined &&
      runtime.workspacePath !== undefined &&
      runtime.workspacePath !== input.workspacePath
    ) {
      throw createAgentProxyError({
        code: "RUNTIME_HEALTH_FAILED",
        message: "Requested OpenCode runtime belongs to a different workspace.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.runtimeDiagnostics.registry",
        details: {
          runtimeId: input.runtimeId,
          workspacePath: input.workspacePath,
          runtimeWorkspacePath: runtime.workspacePath,
        },
      });
    }

    if (runtime.baseUrl === undefined) {
      throw createAgentProxyError({
        code: "RUNTIME_HEALTH_FAILED",
        message: "Requested OpenCode runtime does not have a base URL.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.runtimeDiagnostics.registry",
        details: {
          runtimeId: input.runtimeId,
          failureReason: "missing_base_url",
        },
      });
    }

    return runtime;
  }

  return [...input.runtimes]
    .filter(
      (runtime) => runtime.baseUrl !== undefined && isActiveDiagnosticRuntimeStatus(runtime.status),
    )
    .sort((left, right) => runtimeDiagnosticPriority(left) - runtimeDiagnosticPriority(right))[0];
}

function runtimeDiagnosticPriority(runtime: StoredRuntimeRecord): number {
  const index = ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES.indexOf(
    runtime.status as (typeof ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function isActiveDiagnosticRuntimeStatus(
  status: StoredRuntimeRecord["status"],
): status is (typeof ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES)[number] {
  return ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES.includes(
    status as (typeof ACTIVE_DIAGNOSTIC_RUNTIME_STATUSES)[number],
  );
}

function countBy<TItem>(
  items: readonly TItem[],
  readKey: (item: TItem) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = readKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function skippedCheck(message: string): DiagnosticCheckResult {
  return {
    status: "skipped",
    message,
  };
}

function summarizeRuntime(runtime: StoredRuntimeRecord): ProviderMetadata {
  return {
    id: runtime.id,
    providerId: runtime.providerId,
    mode: runtime.mode,
    status: runtime.status,
    ...(runtime.baseUrl !== undefined ? { baseUrl: sanitizeUrlLikeString(runtime.baseUrl) } : {}),
    ...(runtime.hostname !== undefined ? { hostname: runtime.hostname } : {}),
    ...(runtime.port !== undefined ? { port: runtime.port } : {}),
    ...(runtime.pid !== undefined ? { pid: runtime.pid } : {}),
    ...(runtime.workspacePath !== undefined ? { workspacePath: runtime.workspacePath } : {}),
    startedAt: runtime.startedAt,
    ...(runtime.stoppedAt !== undefined ? { stoppedAt: runtime.stoppedAt } : {}),
  };
}

function normalizeRuntimeDiagnosticUrl(baseUrl: string | undefined): DiagnosticRuntimeUrl {
  if (baseUrl === undefined) {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "OpenCode runtime diagnostics requires a runtime base URL.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.runtimeDiagnostics.parseRuntimeUrl",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL must be a valid URL.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.runtimeDiagnostics.parseRuntimeUrl",
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL must use http or https.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.runtimeDiagnostics.parseRuntimeUrl",
      details: {
        protocol: parsed.protocol,
      },
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL must not include credentials.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.runtimeDiagnostics.parseRuntimeUrl",
      details: {
        serverUrl: sanitizeUrlLikeString(baseUrl),
      },
    });
  }

  return {
    baseUrl: sanitizeUrlLikeString(baseUrl),
  };
}

async function parseHealthJson(
  response: Response,
  details: { runtimeId: string; serverUrl: string },
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw createRuntimeHealthDiagnosticError(
      "OpenCode runtime health endpoint did not return JSON.",
      {
        ...details,
        failureReason: "invalid_health_json",
      },
    );
  }
}

function readOpenCodeHealthVersion(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return value.healthy === true && typeof value.version === "string" && value.version.trim() !== ""
    ? value.version
    : undefined;
}

function createRuntimeHealthDiagnosticError(message: string, details: ProviderMetadata): Error {
  return createAgentProxyError({
    code: "RUNTIME_HEALTH_FAILED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.runtimeDiagnostics.health",
    details,
  });
}

function createEventStreamDiagnosticError(message: string, details: ProviderMetadata): Error {
  return createAgentProxyError({
    code: "EVENT_STREAM_INTERRUPTED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.runtimeDiagnostics.eventStream",
    details,
  });
}

function normalizeFailedCheck(
  id: OpenCodeRuntimeDiagnosticCheckId,
  error: unknown,
  durationMs: number,
): OpenCodeRuntimeDiagnosticCheck {
  if (isAgentProxyError(error)) {
    return {
      id,
      providerId: OPENCODE_PROVIDER_ID,
      status: "failed",
      message: sanitizeDiagnosticMessage(error.message),
      errorCode: error.code,
      ...(typeof error.details?.runtimeId === "string"
        ? { runtimeId: error.details.runtimeId }
        : {}),
      details: sanitizeDiagnosticDetails(error.details ?? {}),
      durationMs,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    id,
    providerId: OPENCODE_PROVIDER_ID,
    status: "failed",
    message: sanitizeDiagnosticMessage(message),
    details: sanitizeDiagnosticDetails({
      failureReason: "unexpected_error",
    }),
    durationMs,
  };
}

function sanitizeDiagnosticDetails(value: unknown): ProviderMetadata {
  const sanitized = redactValue(sanitizeDiagnosticValue(value));
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeDiagnosticMessage(value: string): string {
  return redactString(sanitizeUrlLikeSubstrings(value));
}

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeUrlLikeSubstrings(value);
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDiagnosticValue(entry));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeDiagnosticValue(entry)]),
  );
}

function sanitizeUrlLikeString(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return value;
  }

  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, "");
  return `${parsed.origin}${pathname}`;
}

function sanitizeUrlLikeSubstrings(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, (match) => sanitizeUrlLikeString(match));
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Diagnostic cleanup must not replace the stable error code being reported.
  }
}

function readMediaType(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

function buildReport(input: {
  generatedAt: string;
  checks: OpenCodeRuntimeDiagnosticCheck[];
}): OpenCodeRuntimeDiagnosticReport {
  const counts = countDiagnosticChecks(input.checks);
  const gate3 = summarizeGate3(input.checks);

  return {
    ok: counts.failed === 0,
    providerId: OPENCODE_PROVIDER_ID,
    generatedAt: input.generatedAt,
    counts,
    gate3,
    checks: input.checks,
  };
}

function countDiagnosticChecks(
  checks: readonly OpenCodeRuntimeDiagnosticCheck[],
): OpenCodeRuntimeDiagnosticCounts {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
    warning: checks.filter((check) => check.status === "warning").length,
  };
}

function summarizeGate3(checks: readonly OpenCodeRuntimeDiagnosticCheck[]): OpenCodeGate3Summary {
  const capabilities: OpenCodeGate3Capabilities = {
    binary: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary),
    registry: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.registry),
    runtimeStart: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStart),
    runtimeConnect: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health),
    eventStream: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream),
    runtimeStop: hasPassedCheck(checks, OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStop),
  };
  const missingCapabilities = GATE3_REQUIRED_CAPABILITIES.filter(
    (capability) => !capabilities[capability],
  );

  return {
    name: "Gate 3",
    passed: missingCapabilities.length === 0,
    requiredCapabilities: GATE3_REQUIRED_CAPABILITIES,
    capabilities,
    missingCapabilities,
  };
}

function hasPassedCheck(
  checks: readonly OpenCodeRuntimeDiagnosticCheck[],
  id: OpenCodeRuntimeDiagnosticCheckId,
): boolean {
  return checks.some((check) => check.id === id && check.status === "passed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
