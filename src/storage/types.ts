import type { ProviderMetadata, RuntimeHandle, RuntimeStatus } from "../core/index.js";
import type { SessionStatus } from "../sessions/index.js";

export interface AppliedMigration {
  id: string;
  name: string;
  appliedAt: string;
}

export interface OpenAgentProxyStorageOptions {
  databasePath: string;
  migrate?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeoutMs?: number;
}

export interface StoredProviderRecord {
  id: string;
  displayName: string;
  enabled: boolean;
  lastSeenVersion?: string;
  lastHealthStatus?: string;
  lastHealthCheckedAt?: string;
  metadata: ProviderMetadata;
}

export type StoredRuntimeRecord = RuntimeHandle;

export type SessionSourceOfTruth = "provider_content_agentproxy_index";

/**
 * Phase 2.5 stores the SQLite session index projection from the accepted schema,
 * not every field from the higher-level AgentProxySession contract.
 */
export interface StoredSessionRecord {
  id: string;
  providerId: string;
  providerSessionId: string;
  workspacePath: string;
  title?: string;
  status: SessionStatus;
  model?: string;
  runtimeId?: string;
  parentSessionId?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  deletedAt?: string;
  tombstoneReason?: string;
  sourceOfTruth?: SessionSourceOfTruth;
  metadata: ProviderMetadata;
}

export interface StoredSessionEventRecord {
  id: string;
  sessionId: string;
  providerId: string;
  eventType: string;
  createdAt: string;
  payload: unknown;
}

export interface RuntimeListOptions {
  providerId?: string;
  workspacePath?: string;
  status?: RuntimeStatus | readonly RuntimeStatus[];
}

export interface SessionListOptions {
  providerId?: string;
  workspacePath?: string;
  status?: SessionStatus | readonly SessionStatus[];
  includeTombstones?: boolean;
  limit?: number;
}

export interface ProviderRepository {
  upsert(record: StoredProviderRecord): void;
  get(id: string): StoredProviderRecord | undefined;
  list(): StoredProviderRecord[];
  delete(id: string): boolean;
}

export interface RuntimeRepository {
  upsert(record: StoredRuntimeRecord): void;
  get(id: string): StoredRuntimeRecord | undefined;
  list(options?: RuntimeListOptions): StoredRuntimeRecord[];
  delete(id: string): boolean;
}

export interface SessionRepository {
  upsert(record: StoredSessionRecord): void;
  getById(id: string): StoredSessionRecord | undefined;
  getByProviderSessionId(
    providerId: string,
    providerSessionId: string,
  ): StoredSessionRecord | undefined;
  list(options?: SessionListOptions): StoredSessionRecord[];
  markDeleted(input: { id: string; deletedAt: string; tombstoneReason?: string }): boolean;
}

export interface SessionEventRepository {
  append(record: StoredSessionEventRecord): void;
  listBySessionId(sessionId: string): StoredSessionEventRecord[];
  deleteBySessionId(sessionId: string): boolean;
}

export interface AgentProxyStorage {
  databasePath: string;
  providers: ProviderRepository;
  runtimes: RuntimeRepository;
  sessions: SessionRepository;
  sessionEvents: SessionEventRepository;
  runMigrations(): AppliedMigration[];
  getAppliedMigrations(): AppliedMigration[];
  close(): void;
}
