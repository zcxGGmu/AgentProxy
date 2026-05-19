import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  AGENTPROXY_INITIAL_SCHEMA_MIGRATION_ID,
  openAgentProxyStorage,
} from "../src/storage/index.js";

const tempRoots: string[] = [];

async function createDatabasePath(): Promise<{ databasePath: string; workspacePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-storage-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
  ]);

  return {
    databasePath: path.join(dataDir, "agentproxy.sqlite3"),
    workspacePath,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SQLite storage", () => {
  it("initializes a fresh database and safely reapplies migrations", async () => {
    const { databasePath } = await createDatabasePath();
    const storage = openAgentProxyStorage({ databasePath });

    expect(storage.getAppliedMigrations()).toEqual([
      {
        id: AGENTPROXY_INITIAL_SCHEMA_MIGRATION_ID,
        name: "initial_storage_schema",
        appliedAt: expect.any(String),
      },
    ]);

    storage.runMigrations();
    expect(storage.getAppliedMigrations()).toHaveLength(1);
    storage.close();

    const reopenedStorage = openAgentProxyStorage({ databasePath });
    expect(reopenedStorage.getAppliedMigrations()).toHaveLength(1);
    reopenedStorage.close();
  });

  it("persists providers and runtimes through basic repository CRUD", async () => {
    const { databasePath, workspacePath } = await createDatabasePath();
    const storage = openAgentProxyStorage({ databasePath });
    const checkedAt = "2026-05-19T01:00:00.000Z";
    const startedAt = "2026-05-19T01:01:00.000Z";

    storage.providers.upsert({
      id: "opencode",
      displayName: "OpenCode",
      enabled: true,
      lastSeenVersion: "0.12.0",
      lastHealthStatus: "healthy",
      lastHealthCheckedAt: checkedAt,
      metadata: {
        capabilitySchemaVersion: "1",
      },
    });

    expect(storage.providers.get("opencode")).toEqual({
      id: "opencode",
      displayName: "OpenCode",
      enabled: true,
      lastSeenVersion: "0.12.0",
      lastHealthStatus: "healthy",
      lastHealthCheckedAt: checkedAt,
      metadata: {
        capabilitySchemaVersion: "1",
      },
    });

    storage.providers.upsert({
      id: "opencode",
      displayName: "OpenCode Provider",
      enabled: false,
      metadata: {},
    });

    expect(storage.providers.list()).toEqual([
      {
        id: "opencode",
        displayName: "OpenCode Provider",
        enabled: false,
        metadata: {},
      },
    ]);

    storage.runtimes.upsert({
      id: "runtime_1",
      providerId: "opencode",
      mode: "managed",
      baseUrl: "http://127.0.0.1:4096",
      hostname: "127.0.0.1",
      port: 4096,
      pid: 1234,
      workspacePath,
      status: "healthy",
      startedAt,
      metadata: {
        managedBy: "agentproxy",
      },
    });

    expect(storage.runtimes.get("runtime_1")).toEqual({
      id: "runtime_1",
      providerId: "opencode",
      mode: "managed",
      baseUrl: "http://127.0.0.1:4096",
      hostname: "127.0.0.1",
      port: 4096,
      pid: 1234,
      workspacePath,
      status: "healthy",
      startedAt,
      metadata: {
        managedBy: "agentproxy",
      },
    });

    storage.runtimes.upsert({
      id: "runtime_1",
      providerId: "opencode",
      mode: "managed",
      workspacePath,
      status: "stopped",
      startedAt,
      stoppedAt: "2026-05-19T01:05:00.000Z",
      metadata: {},
    });

    expect(storage.runtimes.list({ providerId: "opencode" })).toEqual([
      {
        id: "runtime_1",
        providerId: "opencode",
        mode: "managed",
        workspacePath,
        status: "stopped",
        startedAt,
        stoppedAt: "2026-05-19T01:05:00.000Z",
        metadata: {},
      },
    ]);

    storage.runtimes.delete("runtime_1");
    expect(storage.runtimes.get("runtime_1")).toBeUndefined();

    storage.providers.delete("opencode");
    expect(storage.providers.get("opencode")).toBeUndefined();
    storage.close();
  });

  it("persists sessions, enforces provider session uniqueness, and preserves tombstones", async () => {
    const { databasePath, workspacePath } = await createDatabasePath();
    const storage = openAgentProxyStorage({ databasePath });
    const createdAt = "2026-05-19T02:00:00.000Z";
    const updatedAt = "2026-05-19T02:01:00.000Z";

    const session = {
      id: "apx_1",
      providerId: "opencode",
      providerSessionId: "ses_opencode_1",
      workspacePath,
      title: "Storage smoke test",
      status: "idle" as const,
      model: "test-model",
      runtimeId: "runtime_1",
      parentSessionId: "apx_parent",
      createdAt,
      updatedAt,
      lastRunAt: "2026-05-19T02:02:00.000Z",
      lastSyncAt: "2026-05-19T02:03:00.000Z",
      lastError: "redacted last error",
      sourceOfTruth: "provider_content_agentproxy_index" as const,
      metadata: {
        summaryOnly: true,
      },
    };

    storage.sessions.upsert(session);

    expect(storage.sessions.getById("apx_1")).toEqual(session);
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_opencode_1")).toEqual(session);
    expect(storage.sessions.list({ workspacePath })).toEqual([session]);

    expect(() =>
      storage.sessions.upsert({
        ...session,
        id: "apx_2",
      }),
    ).toThrow(AgentProxyError);

    try {
      storage.sessions.upsert({
        ...session,
        id: "apx_2",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("STORAGE_ERROR");
        expect(error.operation).toBe("storage.sessions.upsert");
      }
    }

    storage.sessions.markDeleted({
      id: "apx_1",
      deletedAt: "2026-05-19T02:04:00.000Z",
      tombstoneReason: "provider_deleted",
    });

    expect(storage.sessions.getById("apx_1")).toEqual({
      ...session,
      deletedAt: "2026-05-19T02:04:00.000Z",
      tombstoneReason: "provider_deleted",
    });

    storage.sessions.upsert({
      ...session,
      title: "Provider sync should not revive tombstones",
      status: "completed",
      updatedAt: "2026-05-19T02:05:00.000Z",
    });

    expect(storage.sessions.getById("apx_1")).toEqual({
      ...session,
      title: "Provider sync should not revive tombstones",
      status: "completed",
      updatedAt: "2026-05-19T02:05:00.000Z",
      deletedAt: "2026-05-19T02:04:00.000Z",
      tombstoneReason: "provider_deleted",
    });
    expect(storage.sessions.list()).toHaveLength(1);
    expect(storage.sessions.list({ includeTombstones: false })).toEqual([]);
    storage.close();
  });

  it("persists redacted session event summaries", async () => {
    const { databasePath } = await createDatabasePath();
    const storage = openAgentProxyStorage({ databasePath });

    storage.sessionEvents.append({
      id: "event_1",
      sessionId: "apx_1",
      providerId: "opencode",
      eventType: "session.status_changed",
      createdAt: "2026-05-19T03:00:00.000Z",
      payload: {
        status: "running",
        summaryOnly: true,
      },
    });

    expect(storage.sessionEvents.listBySessionId("apx_1")).toEqual([
      {
        id: "event_1",
        sessionId: "apx_1",
        providerId: "opencode",
        eventType: "session.status_changed",
        createdAt: "2026-05-19T03:00:00.000Z",
        payload: {
          status: "running",
          summaryOnly: true,
        },
      },
    ]);

    storage.sessionEvents.deleteBySessionId("apx_1");
    expect(storage.sessionEvents.listBySessionId("apx_1")).toEqual([]);
    storage.close();
  });

  it("maps storage serialization failures to STORAGE_ERROR", async () => {
    const { databasePath } = await createDatabasePath();
    const storage = openAgentProxyStorage({ databasePath });
    const circularMetadata: Record<string, unknown> = {};
    circularMetadata.self = circularMetadata;

    expect(() =>
      storage.providers.upsert({
        id: "opencode",
        displayName: "OpenCode",
        enabled: true,
        metadata: circularMetadata,
      }),
    ).toThrow(AgentProxyError);

    try {
      storage.providers.upsert({
        id: "opencode",
        displayName: "OpenCode",
        enabled: true,
        metadata: circularMetadata,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("STORAGE_ERROR");
        expect(error.operation).toBe("storage.json.serialize");
      }
    }

    storage.close();
  });
});
