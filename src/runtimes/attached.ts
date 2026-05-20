import { randomUUID } from "node:crypto";
import { createAgentProxyError, isAgentProxyError, type ProviderMetadata } from "../core/index.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/constants.js";
import type { AgentProxyStorage, StoredRuntimeRecord } from "../storage/index.js";
import { OPENCODE_MANAGED_RUNTIME_HEALTH_PATH } from "./managed.js";
import { RuntimeRegistry } from "./registry.js";

export const OPENCODE_ATTACHED_RUNTIME_METADATA_KEY = "agentproxyOpenCodeAttachedRuntime";
export const OPENCODE_ATTACHED_RUNTIME_HEALTH_PATH = OPENCODE_MANAGED_RUNTIME_HEALTH_PATH;

export interface OpenCodeAttachedRuntimeManagerOptions {
  storage?: AgentProxyStorage;
  registry?: RuntimeRegistry;
  now?: () => Date;
  healthRequestTimeoutMs?: number;
  runtimeIdFactory?: () => string;
  onWarning?: (warning: OpenCodeAttachedRuntimeWarning) => void;
}

export interface AttachOpenCodeRuntimeInput {
  id?: string;
  serverUrl: string;
  workspacePath?: string;
  metadata?: ProviderMetadata;
  signal?: AbortSignal;
}

export interface AttachOpenCodeRuntimeFromRegistryInput {
  workspacePath?: string;
  metadata?: ProviderMetadata;
  signal?: AbortSignal;
}

export interface StopOpenCodeAttachedRuntimeInput {
  runtimeId: string;
  reason?: string;
  metadata?: ProviderMetadata;
}

export interface OpenCodeAttachedRuntimeMetadata {
  source: "server-url" | "registry";
  serverUrl: string;
  healthPath: string;
  attachedAt: string;
  healthCheckedAt?: string;
  health?: OpenCodeAttachedRuntimeHealthMetadata;
  warnings: OpenCodeAttachedRuntimeWarning[];
  failureReason?: string;
  stopAction?: "detach_only";
  stopRequested?: boolean;
  stopRequestedAt?: string;
  detachedAt?: string;
  detachReason?: string;
}

export interface OpenCodeAttachedRuntimeHealthMetadata {
  healthy: boolean;
  version: string;
}

export interface OpenCodeAttachedRuntimeWarning {
  code: "NON_LOCALHOST_ATTACHED_RUNTIME";
  message: string;
  hostname: string;
  serverUrl: string;
}

interface NormalizedServerUrl {
  baseUrl: string;
  hostname: string;
  port: number;
}

interface AttachRuntimeInternalInput extends AttachOpenCodeRuntimeInput {
  source: OpenCodeAttachedRuntimeMetadata["source"];
}

const ATTACHABLE_REGISTRY_STATUSES = [
  "discovered",
  "attached",
  "healthy",
  "degraded",
  "reconnecting",
] as const;

const ACTIVE_RUNTIME_STATUSES = new Set<StoredRuntimeRecord["status"]>([
  "discovered",
  "starting",
  "attached",
  "healthy",
  "degraded",
  "reconnecting",
  "stopping",
]);

export class OpenCodeAttachedRuntimeManager {
  readonly registry: RuntimeRegistry;

  private readonly now: () => Date;
  private readonly healthRequestTimeoutMs: number;
  private readonly runtimeIdFactory: () => string;
  private readonly onWarning: ((warning: OpenCodeAttachedRuntimeWarning) => void) | undefined;
  private readonly attachingRuntimeIds = new Set<string>();

  constructor(options: OpenCodeAttachedRuntimeManagerOptions) {
    this.registry = buildRuntimeRegistry(options, options.now ?? (() => new Date()));
    this.now = options.now ?? (() => new Date());
    this.healthRequestTimeoutMs = options.healthRequestTimeoutMs ?? 1_000;
    this.runtimeIdFactory = options.runtimeIdFactory ?? defaultRuntimeIdFactory;
    this.onWarning = options.onWarning;
  }

  async attachRuntime(input: AttachOpenCodeRuntimeInput): Promise<StoredRuntimeRecord> {
    return this.attachRuntimeInternal({
      ...input,
      source: "server-url",
    });
  }

  async attachFromRegistry(
    input: AttachOpenCodeRuntimeFromRegistryInput = {},
  ): Promise<StoredRuntimeRecord> {
    const listOptions: Parameters<RuntimeRegistry["list"]>[0] = {
      providerId: OPENCODE_PROVIDER_ID,
      mode: "attached",
      status: ATTACHABLE_REGISTRY_STATUSES,
    };
    if (input.workspacePath !== undefined) {
      listOptions.workspacePath = input.workspacePath;
    }

    const candidates = this.registry.list(listOptions).filter(hasBaseUrl);

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        const attachInput: AttachRuntimeInternalInput = {
          id: candidate.id,
          serverUrl: candidate.baseUrl,
          source: "registry",
        };
        if (candidate.workspacePath !== undefined) {
          attachInput.workspacePath = candidate.workspacePath;
        }
        if (input.metadata !== undefined) {
          attachInput.metadata = input.metadata;
        }
        if (input.signal !== undefined) {
          attachInput.signal = input.signal;
        }

        return await this.attachRuntimeInternal(attachInput);
      } catch (error) {
        lastError = error;
      }
    }

    throw createHealthFailedError(
      "No healthy OpenCode attached runtime was found in the registry.",
      {
        checked: candidates.length,
        workspacePath: input.workspacePath,
        ...(isAgentProxyError(lastError) ? { lastErrorCode: lastError.code } : {}),
      },
      lastError,
    );
  }

  async stopAttachedRuntime(
    input: string | StopOpenCodeAttachedRuntimeInput,
  ): Promise<StoredRuntimeRecord> {
    const normalizedInput = typeof input === "string" ? { runtimeId: input } : input;
    const runtime = this.registry.get(normalizedInput.runtimeId);
    if (runtime?.mode !== "attached" || runtime.providerId !== OPENCODE_PROVIDER_ID) {
      throw createAgentProxyError({
        code: "CAPABILITY_UNSUPPORTED",
        message: "Only OpenCode attached runtimes can be detached by this operation.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.attachedRuntime.stop",
        details: {
          runtimeId: normalizedInput.runtimeId,
          providerId: runtime?.providerId,
          runtimeMode: runtime?.mode,
        },
      });
    }

    const timestamp = this.nowIso();
    return this.registry.register({
      id: runtime.id,
      providerId: runtime.providerId,
      mode: "attached",
      status: "detached",
      stoppedAt: timestamp,
      metadata: {
        ...(normalizedInput.metadata ?? {}),
        ...this.mergeAttachedMetadata(runtime.id, {
          stopAction: "detach_only",
          stopRequested: true,
          stopRequestedAt: timestamp,
          detachedAt: timestamp,
          ...(normalizedInput.reason !== undefined ? { detachReason: normalizedInput.reason } : {}),
        }),
      },
    });
  }

  private async attachRuntimeInternal(
    input: AttachRuntimeInternalInput,
  ): Promise<StoredRuntimeRecord> {
    const normalizedUrl = normalizeServerUrl(input.serverUrl);
    const runtimeId = input.id ?? this.runtimeIdFactory();
    assertSignalNotAborted(input.signal);
    this.reserveRuntimeId(runtimeId, {
      source: input.source,
      baseUrl: normalizedUrl.baseUrl,
    });

    try {
      return await this.registerAndHealthCheckAttachedRuntime(input, {
        runtimeId,
        normalizedUrl,
      });
    } finally {
      this.attachingRuntimeIds.delete(runtimeId);
    }
  }

  private async registerAndHealthCheckAttachedRuntime(
    input: AttachRuntimeInternalInput,
    options: { runtimeId: string; normalizedUrl: NormalizedServerUrl },
  ): Promise<StoredRuntimeRecord> {
    const { runtimeId, normalizedUrl } = options;
    const attachedAt = this.nowIso();
    const warnings = warningsForAttachedRuntime(normalizedUrl);
    for (const warning of warnings) {
      this.onWarning?.(warning);
    }

    this.registry.register({
      id: runtimeId,
      providerId: OPENCODE_PROVIDER_ID,
      mode: "attached",
      status: "attached",
      baseUrl: normalizedUrl.baseUrl,
      hostname: normalizedUrl.hostname,
      port: normalizedUrl.port,
      ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
      metadata: {
        ...(input.metadata ?? {}),
        [OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]: {
          source: input.source,
          serverUrl: normalizedUrl.baseUrl,
          healthPath: OPENCODE_ATTACHED_RUNTIME_HEALTH_PATH,
          attachedAt,
          warnings,
        },
      },
    });

    try {
      const health = await this.checkHealth(normalizedUrl.baseUrl, input.signal);
      return this.registry.register({
        id: runtimeId,
        providerId: OPENCODE_PROVIDER_ID,
        mode: "attached",
        status: "healthy",
        baseUrl: normalizedUrl.baseUrl,
        hostname: normalizedUrl.hostname,
        port: normalizedUrl.port,
        ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
        metadata: this.mergeAttachedMetadata(runtimeId, {
          healthCheckedAt: this.nowIso(),
          health,
          warnings,
        }),
      });
    } catch (error) {
      const failureReason = failureReasonFromHealthError(error);
      this.registry.register({
        id: runtimeId,
        providerId: OPENCODE_PROVIDER_ID,
        mode: "attached",
        status: "failed",
        baseUrl: normalizedUrl.baseUrl,
        hostname: normalizedUrl.hostname,
        port: normalizedUrl.port,
        ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
        metadata: this.mergeAttachedMetadata(runtimeId, {
          failureReason,
          warnings,
        }),
      });
      throw error;
    }
  }

  private reserveRuntimeId(
    runtimeId: string,
    options: { source: OpenCodeAttachedRuntimeMetadata["source"]; baseUrl: string },
  ): void {
    const alreadyAttaching = this.attachingRuntimeIds.has(runtimeId);
    const existingRuntime = this.registry.get(runtimeId);
    if (
      !alreadyAttaching &&
      canAttachWithRuntimeId(existingRuntime, {
        source: options.source,
        baseUrl: options.baseUrl,
      })
    ) {
      this.attachingRuntimeIds.add(runtimeId);
      return;
    }

    throw duplicateAttachedRuntimeIdError(runtimeId, {
      existingRuntime,
      alreadyAttaching,
    });
  }

  private async checkHealth(
    baseUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<OpenCodeAttachedRuntimeHealthMetadata> {
    assertSignalNotAborted(signal);

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
      const response = await fetch(`${baseUrl}${OPENCODE_ATTACHED_RUNTIME_HEALTH_PATH}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw createHealthFailedError("OpenCode attached runtime health endpoint was unhealthy.", {
          serverUrl: baseUrl,
          status: response.status,
          failureReason: "unhealthy_response",
        });
      }

      const body = await parseHealthJson(response, baseUrl);
      return validateOpenCodeHealthBody(body, baseUrl);
    } catch (error) {
      if (isAgentProxyError(error)) {
        throw error;
      }

      throw createHealthFailedError(
        "OpenCode attached runtime health check failed.",
        {
          serverUrl: baseUrl,
          failureReason: signal?.aborted === true ? "aborted" : "request_failed",
        },
        error,
      );
    } finally {
      clearTimeout(requestTimeout);
      signal?.removeEventListener("abort", abortExternalRequest);
    }
  }

  private mergeAttachedMetadata(
    runtimeId: string,
    patch: Partial<OpenCodeAttachedRuntimeMetadata>,
  ): ProviderMetadata {
    const existing = this.registry.get(runtimeId)?.metadata[OPENCODE_ATTACHED_RUNTIME_METADATA_KEY];
    const existingAttachedMetadata = isRecord(existing) ? existing : {};

    return {
      [OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]: {
        ...existingAttachedMetadata,
        ...patch,
      },
    };
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildRuntimeRegistry(
  options: OpenCodeAttachedRuntimeManagerOptions,
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
    message: "OpenCode attached runtime manager requires a storage or registry dependency.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.attachedRuntime.create",
  });
}

function normalizeServerUrl(serverUrl: string): NormalizedServerUrl {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode attached runtime server URL must be a valid URL.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.attachedRuntime.parseServerUrl",
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode attached runtime server URL must use http or https.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.attachedRuntime.parseServerUrl",
      details: {
        protocol: parsed.protocol,
      },
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    const sanitized = sanitizeParsedUrl(parsed);
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message:
        "OpenCode attached runtime server URL must not include credentials; configure authentication separately.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.attachedRuntime.parseServerUrl",
      details: {
        serverUrl: sanitized.baseUrl,
      },
    });
  }

  const sanitized = sanitizeParsedUrl(parsed);
  return {
    baseUrl: sanitized.baseUrl,
    hostname: sanitized.hostname,
    port: sanitized.port,
  };
}

function sanitizeParsedUrl(parsed: URL): NormalizedServerUrl {
  const sanitized = new URL(parsed.href);
  sanitized.username = "";
  sanitized.password = "";
  sanitized.search = "";
  sanitized.hash = "";

  const pathname = trimTrailingSlashes(sanitized.pathname);
  const baseUrl = `${sanitized.origin}${pathname === "" ? "" : pathname}`;
  const hostname = normalizeHostname(sanitized.hostname);

  return {
    baseUrl,
    hostname,
    port: portForUrl(sanitized),
  };
}

function trimTrailingSlashes(value: string): string {
  if (value === "/") {
    return "";
  }

  return value.replace(/\/+$/u, "");
}

function normalizeHostname(value: string): string {
  return value.replace(/^\[/u, "").replace(/\]$/u, "");
}

function portForUrl(url: URL): number {
  if (url.port !== "") {
    return Number(url.port);
  }

  return url.protocol === "https:" ? 443 : 80;
}

function warningsForAttachedRuntime(
  serverUrl: NormalizedServerUrl,
): OpenCodeAttachedRuntimeWarning[] {
  if (isLocalhost(serverUrl.hostname)) {
    return [];
  }

  return [
    {
      code: "NON_LOCALHOST_ATTACHED_RUNTIME",
      message:
        "Attached OpenCode runtime is not localhost; verify you trust the server before sending workspace data.",
      hostname: serverUrl.hostname,
      serverUrl: serverUrl.baseUrl,
    },
  ];
}

function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  );
}

async function parseHealthJson(response: Response, baseUrl: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw createHealthFailedError(
      "OpenCode attached runtime health endpoint did not return JSON.",
      {
        serverUrl: baseUrl,
        failureReason: "invalid_health_json",
      },
      error,
    );
  }
}

function validateOpenCodeHealthBody(
  value: unknown,
  baseUrl: string,
): OpenCodeAttachedRuntimeHealthMetadata {
  if (!isRecord(value)) {
    throw unexpectedHealthResponse(baseUrl);
  }

  const healthy = value.healthy;
  const version = value.version;
  if (healthy === true && typeof version === "string" && version.trim() !== "") {
    return {
      healthy: true,
      version,
    };
  }

  throw unexpectedHealthResponse(baseUrl);
}

function unexpectedHealthResponse(baseUrl: string): Error {
  return createHealthFailedError("OpenCode attached runtime health response was not recognized.", {
    serverUrl: baseUrl,
    failureReason: "unexpected_health_response",
  });
}

function failureReasonFromHealthError(error: unknown): string {
  if (isAgentProxyError(error)) {
    const reason = error.details?.failureReason;
    return typeof reason === "string" ? reason : "health_check_failed";
  }

  return "health_check_failed";
}

function createHealthFailedError(
  message: string,
  details: Record<string, unknown> = {},
  cause?: unknown,
): Error {
  return createAgentProxyError({
    code: "RUNTIME_HEALTH_FAILED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.attachedRuntime.healthCheck",
    cause,
    details: {
      healthPath: OPENCODE_ATTACHED_RUNTIME_HEALTH_PATH,
      ...details,
    },
  });
}

function duplicateAttachedRuntimeIdError(
  runtimeId: string,
  options: {
    existingRuntime: StoredRuntimeRecord | undefined;
    alreadyAttaching: boolean;
  },
): Error {
  return createAgentProxyError({
    code: "RUNTIME_START_FAILED",
    message: "OpenCode attached runtime id is already active.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.attachedRuntime.attach",
    details: {
      runtimeId,
      existingProviderId: options.existingRuntime?.providerId,
      existingMode: options.existingRuntime?.mode,
      existingStatus: options.existingRuntime?.status,
      alreadyAttaching: options.alreadyAttaching,
    },
  });
}

function assertSignalNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) {
    return;
  }

  throw createHealthFailedError("OpenCode attached runtime health wait was aborted.", {
    failureReason: "aborted",
  });
}

function canAttachWithRuntimeId(
  runtime: StoredRuntimeRecord | undefined,
  options: { source: OpenCodeAttachedRuntimeMetadata["source"]; baseUrl: string },
): boolean {
  if (runtime === undefined) {
    return true;
  }

  return (
    options.source === "registry" &&
    runtime.providerId === OPENCODE_PROVIDER_ID &&
    runtime.mode === "attached" &&
    runtime.baseUrl === options.baseUrl &&
    ACTIVE_RUNTIME_STATUSES.has(runtime.status)
  );
}

function defaultRuntimeIdFactory(): string {
  return `runtime_opencode_attached_${randomUUID()}`;
}

function hasBaseUrl(runtime: StoredRuntimeRecord): runtime is StoredRuntimeRecord & {
  baseUrl: string;
} {
  return runtime.baseUrl !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
