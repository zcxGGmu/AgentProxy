import { copyFileSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createAgentProxyError, isAgentProxyError } from "../core/index.js";
import {
  AGENTPROXY_INITIAL_SCHEMA_MIGRATION_ID,
  AGENTPROXY_INITIAL_SCHEMA_MIGRATION_NAME,
  AGENTPROXY_STORAGE_SCHEMA_MIGRATION_TABLE,
} from "./constants.js";
import type { SqliteDatabase } from "./sqlite-types.js";
import type { AppliedMigration } from "./types.js";

export interface SqliteMigration {
  id: string;
  name: string;
  sql: string;
  destructive?: boolean;
}

export interface RunSqliteMigrationsOptions {
  database: SqliteDatabase;
  databasePath: string;
  migrations: readonly SqliteMigration[];
}

interface MigrationRow {
  id: string;
  name: string;
  applied_at: string;
}

interface SqliteBackupArtifact {
  sourcePath: string;
  backupPath: string;
}

interface SqliteBackup {
  databasePath: string;
  artifacts: readonly SqliteBackupArtifact[];
}

const SQLITE_BACKUP_SUFFIXES = ["", "-wal", "-shm", "-journal"] as const;

export function runSqliteMigrations(options: RunSqliteMigrationsOptions): AppliedMigration[] {
  try {
    ensureMigrationTable(options.database);

    const appliedMigrations = listAppliedSqliteMigrations(options.database);
    const appliedMigrationIds = new Set(appliedMigrations.map((migration) => migration.id));
    const pendingMigrations = options.migrations.filter(
      (migration) => !appliedMigrationIds.has(migration.id),
    );

    if (pendingMigrations.length === 0) {
      return appliedMigrations;
    }

    const backupArtifacts =
      options.databasePath === ":memory:" ||
      pendingMigrations.every((migration) => migration.destructive !== true)
        ? undefined
        : createSqliteBackup(options.database, options.databasePath);

    try {
      for (const migration of pendingMigrations) {
        applySqliteMigration(options.database, migration);
      }

      const migrated = listAppliedSqliteMigrations(options.database);
      cleanupSqliteBackup(backupArtifacts);
      return migrated;
    } catch (error) {
      if (backupArtifacts !== undefined) {
        try {
          restoreSqliteBackup(options.database, backupArtifacts);
          cleanupSqliteBackup(backupArtifacts);
        } catch (restoreError) {
          throw createAgentProxyError({
            code: "STORAGE_ERROR",
            message: "Failed to restore the SQLite backup after a migration failure.",
            operation: "storage.migrations.run",
            cause: restoreError,
            ...(restoreError instanceof Error ? { rawMessage: restoreError.message } : {}),
          });
        }
      }

      throw createAgentProxyError({
        code: "STORAGE_ERROR",
        message: "SQLite migration failed.",
        operation: "storage.migrations.run",
        cause: error,
        ...(error instanceof Error ? { rawMessage: error.message } : {}),
      });
    }
  } catch (error) {
    if (isAgentProxyError(error)) {
      throw error;
    }

    throw createAgentProxyError({
      code: "STORAGE_ERROR",
      message: "SQLite migration failed.",
      operation: "storage.migrations.run",
      cause: error,
      ...(error instanceof Error ? { rawMessage: error.message } : {}),
    });
  }
}

export function listAppliedSqliteMigrations(database: SqliteDatabase): AppliedMigration[] {
  ensureMigrationTable(database);

  return database
    .prepare<MigrationRow>(`
      SELECT id, name, applied_at
      FROM ${AGENTPROXY_STORAGE_SCHEMA_MIGRATION_TABLE}
      ORDER BY id ASC
    `)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      appliedAt: row.applied_at,
    }));
}

function ensureMigrationTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${AGENTPROXY_STORAGE_SCHEMA_MIGRATION_TABLE} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function applySqliteMigration(database: SqliteDatabase, migration: SqliteMigration): void {
  const applyMigration = database.transaction(() => {
    database.exec(migration.sql);
    database
      .prepare(`
        INSERT OR IGNORE INTO ${AGENTPROXY_STORAGE_SCHEMA_MIGRATION_TABLE}
          (id, name, applied_at)
        VALUES (?, ?, ?)
      `)
      .run(migration.id, migration.name, new Date().toISOString());
  });

  applyMigration();
}

function createSqliteBackup(database: SqliteDatabase, databasePath: string): SqliteBackup {
  checkpointSqliteWalMode(database);

  const backupBasePath = `${databasePath}.backup-${randomUUID()}`;
  const artifacts: SqliteBackupArtifact[] = [];

  for (const suffix of SQLITE_BACKUP_SUFFIXES) {
    const sourcePath = `${databasePath}${suffix}`;
    if (!existsSync(sourcePath)) {
      continue;
    }

    const backupPath = `${backupBasePath}${suffix}`;
    copyFileSync(sourcePath, backupPath);
    artifacts.push({ sourcePath, backupPath });
  }

  return { databasePath, artifacts };
}

function restoreSqliteBackup(database: SqliteDatabase, backup: SqliteBackup): void {
  if (database.open) {
    database.close();
  }

  const backupPathsBySource = new Map(
    backup.artifacts.map((artifact) => [artifact.sourcePath, artifact.backupPath]),
  );

  for (const suffix of SQLITE_BACKUP_SUFFIXES) {
    const sourcePath = `${backup.databasePath}${suffix}`;
    const backupPath = backupPathsBySource.get(sourcePath);

    if (backupPath !== undefined) {
      copyFileSync(backupPath, sourcePath);
      continue;
    }

    rmSync(sourcePath, { force: true });
  }
}

function cleanupSqliteBackup(backup: SqliteBackup | undefined): void {
  for (const artifact of backup?.artifacts ?? []) {
    try {
      rmSync(artifact.backupPath, { force: true });
    } catch {
      // Cleanup is best-effort; migration success or restore correctness must
      // not be reversed because an obsolete temporary copy could not be removed.
    }
  }
}

function checkpointSqliteWalMode(database: SqliteDatabase): void {
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Non-WAL databases may reject the checkpoint pragma; sidecar copying still
    // preserves any WAL artifacts that exist on disk.
  }
}

const INITIAL_STORAGE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_seen_version TEXT,
    last_health_status TEXT,
    last_health_checked_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS runtimes (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    base_url TEXT,
    hostname TEXT,
    port INTEGER,
    pid INTEGER,
    workspace_path TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_runtimes_provider_id
    ON runtimes(provider_id);

  CREATE INDEX IF NOT EXISTS idx_runtimes_workspace_path
    ON runtimes(workspace_path);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    provider_session_id TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    model TEXT,
    runtime_id TEXT,
    parent_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_run_at TEXT,
    last_sync_at TEXT,
    last_error TEXT,
    deleted_at TEXT,
    tombstone_reason TEXT,
    source_of_truth TEXT NOT NULL DEFAULT 'provider_content_agentproxy_index',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(provider_id, provider_session_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_provider_id
    ON sessions(provider_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_workspace_path
    ON sessions(workspace_path);

  CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions(updated_at);

  CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at
    ON sessions(deleted_at);

  CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_session_events_session_id_created_at
    ON session_events(session_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_session_events_provider_id
    ON session_events(provider_id);
`;

export const INITIAL_STORAGE_MIGRATIONS: readonly SqliteMigration[] = [
  {
    id: AGENTPROXY_INITIAL_SCHEMA_MIGRATION_ID,
    name: AGENTPROXY_INITIAL_SCHEMA_MIGRATION_NAME,
    sql: INITIAL_STORAGE_SCHEMA_SQL,
    destructive: false,
  },
];
