import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  createAgentProxyError,
  isAgentProxyError,
  isProviderMetadata,
  type ProviderMetadata,
} from "../core/index.js";
import { AGENTPROXY_SESSION_SOURCE_OF_TRUTH } from "./constants.js";
import {
  INITIAL_STORAGE_MIGRATIONS,
  listAppliedSqliteMigrations,
  runSqliteMigrations,
} from "./migrations.js";
import type {
  SqliteDatabase,
  SqliteDatabaseConstructor,
  SqliteDatabaseOptions,
} from "./sqlite-types.js";
import type {
  AgentProxyStorage,
  AppliedMigration,
  OpenAgentProxyStorageOptions,
  ProviderRepository,
  RuntimeListOptions,
  RuntimeRepository,
  SessionEventRepository,
  SessionListOptions,
  SessionRepository,
  SessionSourceOfTruth,
  StoredProviderRecord,
  StoredRuntimeRecord,
  StoredSessionEventRecord,
  StoredSessionRecord,
} from "./types.js";

const requireFromModule = createRequire(import.meta.url);

let sqliteConstructor: SqliteDatabaseConstructor | undefined;

interface ProviderRow {
  id: string;
  display_name: string;
  enabled: number;
  last_seen_version: string | null;
  last_health_status: string | null;
  last_health_checked_at: string | null;
  metadata_json: string;
}

interface RuntimeRow {
  id: string;
  provider_id: string;
  mode: StoredRuntimeRecord["mode"];
  base_url: string | null;
  hostname: string | null;
  port: number | null;
  pid: number | null;
  workspace_path: string | null;
  status: StoredRuntimeRecord["status"];
  started_at: string;
  stopped_at: string | null;
  metadata_json: string;
}

interface SessionRow {
  id: string;
  provider_id: string;
  provider_session_id: string;
  workspace_path: string;
  title: string | null;
  status: StoredSessionRecord["status"];
  model: string | null;
  runtime_id: string | null;
  parent_session_id: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  deleted_at: string | null;
  tombstone_reason: string | null;
  source_of_truth: SessionSourceOfTruth;
  metadata_json: string;
}

interface SessionEventRow {
  id: string;
  session_id: string;
  provider_id: string;
  event_type: string;
  created_at: string;
  payload_json: string;
}

export function openAgentProxyStorage(options: OpenAgentProxyStorageOptions): AgentProxyStorage {
  return runStorageOperation("storage.open", () => {
    ensureDatabaseDirectory(options.databasePath);

    const Database = loadSqliteConstructor();
    const databaseOptions: SqliteDatabaseOptions = {};
    if (options.timeoutMs !== undefined) {
      databaseOptions.timeout = options.timeoutMs;
    }
    const database = new Database(options.databasePath, databaseOptions);

    try {
      database.pragma("foreign_keys = ON");

      const storage = new AgentProxySqliteStorage(options.databasePath, database);
      if (options.migrate !== false) {
        storage.runMigrations();
      }

      return storage;
    } catch (error) {
      if (database.open) {
        database.close();
      }
      throw error;
    }
  });
}

class AgentProxySqliteStorage implements AgentProxyStorage {
  readonly providers: ProviderRepository;
  readonly runtimes: RuntimeRepository;
  readonly sessions: SessionRepository;
  readonly sessionEvents: SessionEventRepository;

  constructor(
    readonly databasePath: string,
    private readonly database: SqliteDatabase,
  ) {
    this.providers = createProviderRepository(database);
    this.runtimes = createRuntimeRepository(database);
    this.sessions = createSessionRepository(database);
    this.sessionEvents = createSessionEventRepository(database);
  }

  runMigrations(): AppliedMigration[] {
    return runSqliteMigrations({
      database: this.database,
      databasePath: this.databasePath,
      migrations: INITIAL_STORAGE_MIGRATIONS,
    });
  }

  getAppliedMigrations(): AppliedMigration[] {
    return runStorageOperation("storage.migrations.list", () =>
      listAppliedSqliteMigrations(this.database),
    );
  }

  close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }
}

function createProviderRepository(database: SqliteDatabase): ProviderRepository {
  return {
    upsert(record): void {
      runStorageOperation("storage.providers.upsert", () => {
        database
          .prepare(`
            INSERT INTO providers (
              id,
              display_name,
              enabled,
              last_seen_version,
              last_health_status,
              last_health_checked_at,
              metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              display_name = excluded.display_name,
              enabled = excluded.enabled,
              last_seen_version = excluded.last_seen_version,
              last_health_status = excluded.last_health_status,
              last_health_checked_at = excluded.last_health_checked_at,
              metadata_json = excluded.metadata_json
          `)
          .run(
            record.id,
            record.displayName,
            booleanToInteger(record.enabled),
            toNullable(record.lastSeenVersion),
            toNullable(record.lastHealthStatus),
            toNullable(record.lastHealthCheckedAt),
            serializeJson(record.metadata, "storage.json.serialize"),
          );
      });
    },

    get(id): StoredProviderRecord | undefined {
      return runStorageOperation("storage.providers.get", () => {
        const row = database
          .prepare<ProviderRow>(`
            SELECT id, display_name, enabled, last_seen_version, last_health_status,
              last_health_checked_at, metadata_json
            FROM providers
            WHERE id = ?
          `)
          .get(id);

        return row === undefined ? undefined : providerRowToRecord(row);
      });
    },

    list(): StoredProviderRecord[] {
      return runStorageOperation("storage.providers.list", () =>
        database
          .prepare<ProviderRow>(`
            SELECT id, display_name, enabled, last_seen_version, last_health_status,
              last_health_checked_at, metadata_json
            FROM providers
            ORDER BY id ASC
          `)
          .all()
          .map(providerRowToRecord),
      );
    },

    delete(id): boolean {
      return runStorageOperation(
        "storage.providers.delete",
        () => database.prepare("DELETE FROM providers WHERE id = ?").run(id).changes > 0,
      );
    },
  };
}

function createRuntimeRepository(database: SqliteDatabase): RuntimeRepository {
  return {
    upsert(record): void {
      runStorageOperation("storage.runtimes.upsert", () => {
        database
          .prepare(`
            INSERT INTO runtimes (
              id,
              provider_id,
              mode,
              base_url,
              hostname,
              port,
              pid,
              workspace_path,
              status,
              started_at,
              stopped_at,
              metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              provider_id = excluded.provider_id,
              mode = excluded.mode,
              base_url = excluded.base_url,
              hostname = excluded.hostname,
              port = excluded.port,
              pid = excluded.pid,
              workspace_path = excluded.workspace_path,
              status = excluded.status,
              started_at = excluded.started_at,
              stopped_at = excluded.stopped_at,
              metadata_json = excluded.metadata_json
          `)
          .run(
            record.id,
            record.providerId,
            record.mode,
            toNullable(record.baseUrl),
            toNullable(record.hostname),
            toNullable(record.port),
            toNullable(record.pid),
            toNullable(record.workspacePath),
            record.status,
            record.startedAt,
            toNullable(record.stoppedAt),
            serializeJson(record.metadata, "storage.json.serialize"),
          );
      });
    },

    get(id): StoredRuntimeRecord | undefined {
      return runStorageOperation("storage.runtimes.get", () => {
        const row = database
          .prepare<RuntimeRow>(`
            SELECT id, provider_id, mode, base_url, hostname, port, pid, workspace_path,
              status, started_at, stopped_at, metadata_json
            FROM runtimes
            WHERE id = ?
          `)
          .get(id);

        return row === undefined ? undefined : runtimeRowToRecord(row);
      });
    },

    list(options: RuntimeListOptions = {}): StoredRuntimeRecord[] {
      return runStorageOperation("storage.runtimes.list", () => {
        const { sql, params } = buildRuntimeListQuery(options);

        return database
          .prepare<RuntimeRow>(sql)
          .all(...params)
          .map(runtimeRowToRecord);
      });
    },

    delete(id): boolean {
      return runStorageOperation(
        "storage.runtimes.delete",
        () => database.prepare("DELETE FROM runtimes WHERE id = ?").run(id).changes > 0,
      );
    },
  };
}

function createSessionRepository(database: SqliteDatabase): SessionRepository {
  return {
    upsert(record): void {
      runStorageOperation("storage.sessions.upsert", () => {
        database
          .prepare(`
            INSERT INTO sessions (
              id,
              provider_id,
              provider_session_id,
              workspace_path,
              title,
              status,
              model,
              runtime_id,
              parent_session_id,
              created_at,
              updated_at,
              last_run_at,
              last_sync_at,
              last_error,
              deleted_at,
              tombstone_reason,
              source_of_truth,
              metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              provider_id = excluded.provider_id,
              provider_session_id = excluded.provider_session_id,
              workspace_path = excluded.workspace_path,
              title = excluded.title,
              status = excluded.status,
              model = excluded.model,
              runtime_id = excluded.runtime_id,
              parent_session_id = excluded.parent_session_id,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              last_run_at = excluded.last_run_at,
              last_sync_at = excluded.last_sync_at,
              last_error = excluded.last_error,
              deleted_at = COALESCE(excluded.deleted_at, sessions.deleted_at),
              tombstone_reason = CASE
                WHEN excluded.deleted_at IS NOT NULL THEN excluded.tombstone_reason
                ELSE sessions.tombstone_reason
              END,
              source_of_truth = excluded.source_of_truth,
              metadata_json = excluded.metadata_json
          `)
          .run(
            record.id,
            record.providerId,
            record.providerSessionId,
            record.workspacePath,
            toNullable(record.title),
            record.status,
            toNullable(record.model),
            toNullable(record.runtimeId),
            toNullable(record.parentSessionId),
            record.createdAt,
            record.updatedAt,
            toNullable(record.lastRunAt),
            toNullable(record.lastSyncAt),
            toNullable(record.lastError),
            toNullable(record.deletedAt),
            toNullable(record.tombstoneReason),
            record.sourceOfTruth ?? AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
            serializeJson(record.metadata, "storage.json.serialize"),
          );
      });
    },

    getById(id): StoredSessionRecord | undefined {
      return runStorageOperation("storage.sessions.getById", () => {
        const row = database.prepare<SessionRow>(SESSION_SELECT_SQL_WITH_WHERE("id = ?")).get(id);

        return row === undefined ? undefined : sessionRowToRecord(row);
      });
    },

    getByProviderSessionId(
      providerId: string,
      providerSessionId: string,
    ): StoredSessionRecord | undefined {
      return runStorageOperation("storage.sessions.getByProviderSessionId", () => {
        const row = database
          .prepare<SessionRow>(
            SESSION_SELECT_SQL_WITH_WHERE("provider_id = ? AND provider_session_id = ?"),
          )
          .get(providerId, providerSessionId);

        return row === undefined ? undefined : sessionRowToRecord(row);
      });
    },

    list(options: SessionListOptions = {}): StoredSessionRecord[] {
      return runStorageOperation("storage.sessions.list", () => {
        const { sql, params } = buildSessionListQuery(options);

        return database
          .prepare<SessionRow>(sql)
          .all(...params)
          .map(sessionRowToRecord);
      });
    },

    markDeleted(input): boolean {
      return runStorageOperation(
        "storage.sessions.markDeleted",
        () =>
          database
            .prepare(`
              UPDATE sessions
              SET deleted_at = ?, tombstone_reason = ?
              WHERE id = ?
            `)
            .run(input.deletedAt, toNullable(input.tombstoneReason), input.id).changes > 0,
      );
    },
  };
}

function createSessionEventRepository(database: SqliteDatabase): SessionEventRepository {
  return {
    append(record): void {
      runStorageOperation("storage.sessionEvents.append", () => {
        database
          .prepare(`
            INSERT INTO session_events (
              id,
              session_id,
              provider_id,
              event_type,
              created_at,
              payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            record.id,
            record.sessionId,
            record.providerId,
            record.eventType,
            record.createdAt,
            serializeJson(record.payload, "storage.json.serialize"),
          );
      });
    },

    listBySessionId(sessionId): StoredSessionEventRecord[] {
      return runStorageOperation("storage.sessionEvents.listBySessionId", () =>
        database
          .prepare<SessionEventRow>(`
            SELECT id, session_id, provider_id, event_type, created_at, payload_json
            FROM session_events
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
          `)
          .all(sessionId)
          .map(sessionEventRowToRecord),
      );
    },

    deleteBySessionId(sessionId): boolean {
      return runStorageOperation(
        "storage.sessionEvents.deleteBySessionId",
        () =>
          database.prepare("DELETE FROM session_events WHERE session_id = ?").run(sessionId)
            .changes > 0,
      );
    },
  };
}

function loadSqliteConstructor(): SqliteDatabaseConstructor {
  if (sqliteConstructor !== undefined) {
    return sqliteConstructor;
  }

  try {
    sqliteConstructor = requireFromModule("better-sqlite3") as SqliteDatabaseConstructor;
    return sqliteConstructor;
  } catch (error) {
    throw createStorageError(
      "Unable to load better-sqlite3. Reinstall dependencies or rebuild native modules.",
      "storage.open",
      error,
    );
  }
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:") {
    return;
  }

  mkdirSync(path.dirname(databasePath), { recursive: true });
}

function providerRowToRecord(row: ProviderRow): StoredProviderRecord {
  const record: StoredProviderRecord = {
    id: row.id,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    metadata: parseMetadataJson(row.metadata_json, "storage.providers.parse"),
  };

  if (row.last_seen_version !== null) {
    record.lastSeenVersion = row.last_seen_version;
  }
  if (row.last_health_status !== null) {
    record.lastHealthStatus = row.last_health_status;
  }
  if (row.last_health_checked_at !== null) {
    record.lastHealthCheckedAt = row.last_health_checked_at;
  }

  return record;
}

function runtimeRowToRecord(row: RuntimeRow): StoredRuntimeRecord {
  const record: StoredRuntimeRecord = {
    id: row.id,
    providerId: row.provider_id,
    mode: row.mode,
    status: row.status,
    startedAt: row.started_at,
    metadata: parseMetadataJson(row.metadata_json, "storage.runtimes.parse"),
  };

  if (row.base_url !== null) {
    record.baseUrl = row.base_url;
  }
  if (row.hostname !== null) {
    record.hostname = row.hostname;
  }
  if (row.port !== null) {
    record.port = row.port;
  }
  if (row.pid !== null) {
    record.pid = row.pid;
  }
  if (row.workspace_path !== null) {
    record.workspacePath = row.workspace_path;
  }
  if (row.stopped_at !== null) {
    record.stoppedAt = row.stopped_at;
  }

  return record;
}

function sessionRowToRecord(row: SessionRow): StoredSessionRecord {
  const record: StoredSessionRecord = {
    id: row.id,
    providerId: row.provider_id,
    providerSessionId: row.provider_session_id,
    workspacePath: row.workspace_path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceOfTruth: row.source_of_truth,
    metadata: parseMetadataJson(row.metadata_json, "storage.sessions.parse"),
  };

  if (row.title !== null) {
    record.title = row.title;
  }
  if (row.model !== null) {
    record.model = row.model;
  }
  if (row.runtime_id !== null) {
    record.runtimeId = row.runtime_id;
  }
  if (row.parent_session_id !== null) {
    record.parentSessionId = row.parent_session_id;
  }
  if (row.last_run_at !== null) {
    record.lastRunAt = row.last_run_at;
  }
  if (row.last_sync_at !== null) {
    record.lastSyncAt = row.last_sync_at;
  }
  if (row.last_error !== null) {
    record.lastError = row.last_error;
  }
  if (row.deleted_at !== null) {
    record.deletedAt = row.deleted_at;
  }
  if (row.tombstone_reason !== null) {
    record.tombstoneReason = row.tombstone_reason;
  }

  return record;
}

function sessionEventRowToRecord(row: SessionEventRow): StoredSessionEventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    providerId: row.provider_id,
    eventType: row.event_type,
    createdAt: row.created_at,
    payload: parseJson(row.payload_json, "storage.sessionEvents.parse"),
  };
}

function buildRuntimeListQuery(options: RuntimeListOptions): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  appendEqualityClause(clauses, params, "provider_id", options.providerId);
  appendEqualityClause(clauses, params, "workspace_path", options.workspacePath);
  appendStatusClause(clauses, params, "status", options.status);

  return {
    sql: `
      SELECT id, provider_id, mode, base_url, hostname, port, pid, workspace_path,
        status, started_at, stopped_at, metadata_json
      FROM runtimes
      ${whereSql(clauses)}
      ORDER BY started_at DESC, id ASC
    `,
    params,
  };
}

function buildSessionListQuery(options: SessionListOptions): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  appendEqualityClause(clauses, params, "provider_id", options.providerId);
  appendEqualityClause(clauses, params, "workspace_path", options.workspacePath);
  appendStatusClause(clauses, params, "status", options.status);

  if (options.includeTombstones === false) {
    clauses.push("deleted_at IS NULL");
  }

  const limitSql = options.limit === undefined ? "" : "LIMIT ?";
  if (options.limit !== undefined) {
    params.push(options.limit);
  }

  return {
    sql: `
      ${SESSION_SELECT_SQL}
      ${whereSql(clauses)}
      ORDER BY updated_at DESC, id ASC
      ${limitSql}
    `,
    params,
  };
}

function appendEqualityClause(
  clauses: string[],
  params: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }

  clauses.push(`${column} = ?`);
  params.push(value);
}

function appendStatusClause<TStatus extends string>(
  clauses: string[],
  params: unknown[],
  column: string,
  status: TStatus | readonly TStatus[] | undefined,
): void {
  if (status === undefined) {
    return;
  }

  const statuses = Array.isArray(status) ? [...status] : [status];
  if (statuses.length === 0) {
    return;
  }

  clauses.push(`${column} IN (${statuses.map(() => "?").join(", ")})`);
  params.push(...statuses);
}

function whereSql(clauses: readonly string[]): string {
  return clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
}

function serializeJson(value: unknown, operation: string): string {
  try {
    const serialized = JSON.stringify(value === undefined ? null : value);
    return serialized ?? "null";
  } catch (error) {
    throw createStorageError("Failed to serialize JSON for SQLite storage.", operation, error);
  }
}

function parseJson(json: string, operation: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw createStorageError("Failed to parse JSON from SQLite storage.", operation, error);
  }
}

function parseMetadataJson(json: string, operation: string): ProviderMetadata {
  const parsed = parseJson(json, operation);
  if (!isProviderMetadata(parsed)) {
    throw createStorageError("SQLite metadata_json must contain a JSON object.", operation);
  }

  return parsed;
}

function runStorageOperation<T>(operation: string, callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (isAgentProxyError(error)) {
      throw error;
    }

    throw createStorageError("SQLite storage operation failed.", operation, error);
  }
}

function createStorageError(message: string, operation: string, cause?: unknown): Error {
  return createAgentProxyError({
    code: "STORAGE_ERROR",
    message,
    operation,
    cause,
    ...(cause instanceof Error ? { rawMessage: cause.message } : {}),
  });
}

function toNullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

function booleanToInteger(value: boolean): number {
  return value ? 1 : 0;
}

const SESSION_SELECT_SQL = `
  SELECT id, provider_id, provider_session_id, workspace_path, title, status, model,
    runtime_id, parent_session_id, created_at, updated_at, last_run_at, last_sync_at,
    last_error, deleted_at, tombstone_reason, source_of_truth, metadata_json
  FROM sessions
`;

function SESSION_SELECT_SQL_WITH_WHERE(whereClause: string): string {
  return `${SESSION_SELECT_SQL} WHERE ${whereClause}`;
}
