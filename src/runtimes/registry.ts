import {
  createAgentProxyError,
  type ProviderMetadata,
  type RuntimeMode,
  type RuntimeStatus,
} from "../core/index.js";
import type {
  AgentProxyStorage,
  RuntimeListOptions,
  StoredRuntimeRecord,
} from "../storage/index.js";

export const AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY = "agentproxyRuntimeRegistry";

export interface RuntimeRegistryMetadata {
  registeredAt: string;
  updatedAt: string;
  stale: boolean;
  staleMarkedAt?: string;
  staleReason?: string;
  previousStatus?: RuntimeStatus;
  staleAction?: "mark_failed_metadata_only" | "detach_metadata_only";
}

export interface RuntimeRegistryOptions {
  storage: AgentProxyStorage;
  now?: () => Date;
}

export interface RegisterRuntimeInput {
  id: string;
  providerId: string;
  mode: RuntimeMode;
  status: RuntimeStatus;
  baseUrl?: string;
  hostname?: string;
  port?: number;
  pid?: number;
  workspacePath?: string;
  startedAt?: string;
  stoppedAt?: string;
  metadata?: ProviderMetadata;
}

export interface RuntimeRegistryListOptions {
  providerId?: string;
  workspacePath?: string;
  mode?: RuntimeMode | readonly RuntimeMode[];
  status?: RuntimeStatus | readonly RuntimeStatus[];
}

export interface CleanupStaleRuntimesOptions {
  providerId?: string;
  workspacePath?: string;
  staleAfterMs: number;
  reason?: string;
}

export interface CleanupStaleRuntimesResult {
  checked: number;
  markedStale: StoredRuntimeRecord[];
}

const TERMINAL_RUNTIME_STATUSES = new Set<RuntimeStatus>(["stopped", "detached"]);

export class RuntimeRegistry {
  private readonly storage: AgentProxyStorage;
  private readonly now: () => Date;

  constructor(options: RuntimeRegistryOptions) {
    this.storage = options.storage;
    this.now = options.now ?? (() => new Date());
  }

  register(input: RegisterRuntimeInput): StoredRuntimeRecord {
    const timestamp = this.nowIso();
    const existing = this.storage.runtimes.get(input.id);
    const metadata = {
      ...(existing?.metadata ?? {}),
      ...(input.metadata ?? {}),
    };
    const registryMetadata = buildRuntimeRegistryMetadata({
      existing,
      timestamp,
      metadata,
    });
    const record = buildRuntimeRecord(input, {
      existing,
      timestamp,
      metadata: {
        ...metadata,
        [AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY]: registryMetadata,
      },
    });

    this.storage.runtimes.upsert(record);
    return record;
  }

  get(id: string): StoredRuntimeRecord | undefined {
    return this.storage.runtimes.get(id);
  }

  list(options: RuntimeRegistryListOptions = {}): StoredRuntimeRecord[] {
    return this.storage.runtimes
      .list(toStorageRuntimeListOptions(options))
      .filter((runtime) => matchesMode(runtime, options.mode));
  }

  cleanupStale(options: CleanupStaleRuntimesOptions): CleanupStaleRuntimesResult {
    assertValidStaleThreshold(options.staleAfterMs);

    const now = this.now();
    const checkedRuntimes = this.storage.runtimes.list(toStorageRuntimeListOptions(options));
    const markedStale: StoredRuntimeRecord[] = [];

    for (const runtime of checkedRuntimes) {
      if (!shouldMarkRuntimeStale(runtime, now, options.staleAfterMs)) {
        continue;
      }

      const updated = markRuntimeStale(runtime, {
        timestamp: now.toISOString(),
        reason: options.reason,
      });
      this.storage.runtimes.upsert(updated);
      markedStale.push(updated);
    }

    return {
      checked: checkedRuntimes.length,
      markedStale,
    };
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildRuntimeRecord(
  input: RegisterRuntimeInput,
  options: {
    existing: StoredRuntimeRecord | undefined;
    timestamp: string;
    metadata: ProviderMetadata;
  },
): StoredRuntimeRecord {
  const record: StoredRuntimeRecord = {
    id: input.id,
    providerId: input.providerId,
    mode: input.mode,
    status: input.status,
    startedAt: input.startedAt ?? options.existing?.startedAt ?? options.timestamp,
    metadata: options.metadata,
  };

  assignOptionalRuntimeField(record, "baseUrl", input.baseUrl ?? options.existing?.baseUrl);
  assignOptionalRuntimeField(record, "hostname", input.hostname ?? options.existing?.hostname);
  assignOptionalRuntimeField(record, "port", input.port ?? options.existing?.port);
  assignOptionalRuntimeField(record, "pid", input.pid ?? options.existing?.pid);
  assignOptionalRuntimeField(
    record,
    "workspacePath",
    input.workspacePath ?? options.existing?.workspacePath,
  );
  assignOptionalRuntimeField(record, "stoppedAt", stoppedAtForRuntime(input, options.existing));

  return record;
}

function buildRuntimeRegistryMetadata(input: {
  existing: StoredRuntimeRecord | undefined;
  timestamp: string;
  metadata: ProviderMetadata | undefined;
}): RuntimeRegistryMetadata {
  const existingRegistryMetadata =
    readRuntimeRegistryMetadata(input.metadata) ??
    readRuntimeRegistryMetadata(input.existing?.metadata);

  return {
    registeredAt: existingRegistryMetadata?.registeredAt ?? input.timestamp,
    updatedAt: input.timestamp,
    stale: false,
  };
}

function assignOptionalRuntimeField<TKey extends keyof StoredRuntimeRecord>(
  record: StoredRuntimeRecord,
  key: TKey,
  value: StoredRuntimeRecord[TKey] | undefined,
): void {
  if (value !== undefined) {
    record[key] = value;
  }
}

function matchesMode(
  runtime: StoredRuntimeRecord,
  mode: RuntimeMode | readonly RuntimeMode[] | undefined,
): boolean {
  if (mode === undefined) {
    return true;
  }

  const modes = Array.isArray(mode) ? mode : [mode];
  return modes.length === 0 || modes.includes(runtime.mode);
}

function toStorageRuntimeListOptions(
  options: RuntimeRegistryListOptions | CleanupStaleRuntimesOptions,
): RuntimeListOptions {
  const storageOptions: RuntimeListOptions = {};
  if (options.providerId !== undefined) {
    storageOptions.providerId = options.providerId;
  }
  if (options.workspacePath !== undefined) {
    storageOptions.workspacePath = options.workspacePath;
  }
  if ("status" in options && options.status !== undefined) {
    storageOptions.status = options.status;
  }

  return storageOptions;
}

function shouldMarkRuntimeStale(
  runtime: StoredRuntimeRecord,
  now: Date,
  staleAfterMs: number,
): boolean {
  if (TERMINAL_RUNTIME_STATUSES.has(runtime.status)) {
    return false;
  }

  const registryMetadata = readRuntimeRegistryMetadata(runtime.metadata);
  if (registryMetadata?.stale === true) {
    return false;
  }

  const activityAt = Date.parse(
    registryMetadata?.updatedAt ?? runtime.stoppedAt ?? runtime.startedAt,
  );
  if (Number.isNaN(activityAt)) {
    return false;
  }

  return now.getTime() - activityAt >= staleAfterMs;
}

function assertValidStaleThreshold(staleAfterMs: number): void {
  if (Number.isFinite(staleAfterMs) && staleAfterMs > 0) {
    return;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Runtime stale cleanup threshold must be a positive finite number.",
    operation: "runtimeRegistry.cleanupStale",
    details: {
      staleAfterMs,
    },
  });
}

function stoppedAtForRuntime(
  input: RegisterRuntimeInput,
  existing: StoredRuntimeRecord | undefined,
): string | undefined {
  if (input.stoppedAt !== undefined) {
    return input.stoppedAt;
  }

  return TERMINAL_RUNTIME_STATUSES.has(input.status) ? existing?.stoppedAt : undefined;
}

function markRuntimeStale(
  runtime: StoredRuntimeRecord,
  options: { timestamp: string; reason: string | undefined },
): StoredRuntimeRecord {
  const registryMetadata = readRuntimeRegistryMetadata(runtime.metadata);
  const staleAction =
    runtime.mode === "attached" ? "detach_metadata_only" : "mark_failed_metadata_only";
  const updatedStatus: RuntimeStatus = runtime.mode === "attached" ? "detached" : "failed";

  const updatedMetadata: RuntimeRegistryMetadata = {
    registeredAt: registryMetadata?.registeredAt ?? runtime.startedAt,
    updatedAt: options.timestamp,
    stale: true,
    staleMarkedAt: options.timestamp,
    previousStatus: runtime.status,
    staleAction,
  };
  if (options.reason !== undefined) {
    updatedMetadata.staleReason = options.reason;
  }

  return {
    ...runtime,
    status: updatedStatus,
    metadata: {
      ...runtime.metadata,
      [AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY]: updatedMetadata,
    },
  };
}

function readRuntimeRegistryMetadata(
  metadata: ProviderMetadata | undefined,
): RuntimeRegistryMetadata | undefined {
  const value = metadata?.[AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY];
  if (!isRecord(value)) {
    return undefined;
  }

  const registeredAt = value.registeredAt;
  const updatedAt = value.updatedAt;
  const stale = value.stale;
  if (
    typeof registeredAt !== "string" ||
    typeof updatedAt !== "string" ||
    typeof stale !== "boolean"
  ) {
    return undefined;
  }

  const registryMetadata: RuntimeRegistryMetadata = {
    registeredAt,
    updatedAt,
    stale,
  };

  if (typeof value.staleMarkedAt === "string") {
    registryMetadata.staleMarkedAt = value.staleMarkedAt;
  }
  if (typeof value.staleReason === "string") {
    registryMetadata.staleReason = value.staleReason;
  }
  if (isRuntimeStatus(value.previousStatus)) {
    registryMetadata.previousStatus = value.previousStatus;
  }
  if (isRuntimeStaleAction(value.staleAction)) {
    registryMetadata.staleAction = value.staleAction;
  }

  return registryMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  return (
    value === "discovered" ||
    value === "starting" ||
    value === "attached" ||
    value === "healthy" ||
    value === "degraded" ||
    value === "reconnecting" ||
    value === "failed" ||
    value === "stopping" ||
    value === "stopped" ||
    value === "detached"
  );
}

function isRuntimeStaleAction(
  value: unknown,
): value is NonNullable<RuntimeRegistryMetadata["staleAction"]> {
  return value === "mark_failed_metadata_only" || value === "detach_metadata_only";
}
