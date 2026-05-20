import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentProvider } from "../src/providers/index.js";
import { syncProviderSessions } from "../src/sessions/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];

async function createStorage(): Promise<{
  storage: AgentProxyStorage;
  databasePath: string;
  workspacePath: string;
  otherWorkspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-session-sync-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  const otherWorkspacePath = path.join(root, "other-workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(otherWorkspacePath, { recursive: true }),
  ]);

  const databasePath = path.join(dataDir, "agentproxy.sqlite3");
  return {
    storage: openAgentProxyStorage({ databasePath }),
    databasePath,
    workspacePath,
    otherWorkspacePath,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session sync", () => {
  it("imports provider sessions, updates existing rows, marks missing rows, and keeps ordering", async () => {
    const { storage, workspacePath } = await createStorage();
    const provider = sessionListProvider([
      {
        providerId: "opencode",
        providerSessionId: "ses_new",
        workspacePath,
        title: "New provider session",
        status: "running",
        createdAt: "2026-05-20T18:00:00.000Z",
        updatedAt: "2026-05-20T18:30:00.000Z",
        lastRunAt: "2026-05-20T18:30:00.000Z",
        model: "anthropic/claude-sonnet-4-5",
        metadata: {
          opencode: {
            session: {
              projectId: "proj_new",
            },
          },
        },
      },
      {
        providerId: "opencode",
        providerSessionId: "ses_existing",
        workspacePath: "/provider/reported/workspace",
        title: "Provider title wins",
        status: "idle",
        createdAt: "2026-05-20T17:00:00.000Z",
        updatedAt: "2026-05-20T18:10:00.000Z",
        metadata: {
          opencode: {
            session: {
              directory: "/provider/reported/workspace",
            },
          },
        },
      },
    ]);

    storage.sessions.upsert({
      id: "apx_existing",
      providerId: "opencode",
      providerSessionId: "ses_existing",
      workspacePath,
      title: "Local cached title",
      status: "running",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      metadata: {
        localOnly: true,
      },
    });
    storage.sessions.upsert({
      id: "apx_missing",
      providerId: "opencode",
      providerSessionId: "ses_missing",
      workspacePath,
      title: "Missing locally",
      status: "idle",
      createdAt: "2026-05-20T16:00:00.000Z",
      updatedAt: "2026-05-20T16:30:00.000Z",
      metadata: {},
    });

    const result = await syncProviderSessions({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        metadata: {},
      },
      now: () => new Date("2026-05-20T19:00:00.000Z"),
      missingDetection: "completeProviderList",
      createSessionId: (() => {
        let next = 0;
        return () => `apx_imported_${++next}`;
      })(),
    });

    expect(result).toMatchObject({
      syncedAt: "2026-05-20T19:00:00.000Z",
      imported: 1,
      updated: 1,
      missing: 1,
      skippedTombstones: 0,
    });
    expect(result.sessions.map((session) => session.id)).toEqual([
      "apx_imported_1",
      "apx_existing",
      "apx_missing",
    ]);
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_new")).toMatchObject({
      id: "apx_imported_1",
      workspacePath,
      title: "New provider session",
      status: "running",
      lastSyncAt: "2026-05-20T19:00:00.000Z",
      sourceOfTruth: "provider_content_agentproxy_index",
    });
    expect(storage.sessions.getById("apx_existing")).toMatchObject({
      id: "apx_existing",
      workspacePath,
      title: "Provider title wins",
      status: "idle",
      metadata: {
        localOnly: true,
        opencode: {
          session: {
            directory: "/provider/reported/workspace",
          },
        },
        providerWorkspacePath: "/provider/reported/workspace",
      },
    });
    expect(storage.sessions.getById("apx_missing")).toMatchObject({
      status: "missing_in_provider",
      lastSyncAt: "2026-05-20T19:00:00.000Z",
    });
    storage.close();
  });

  it("does not revive tombstoned sessions and excludes them from default sync output", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_deleted",
      providerId: "opencode",
      providerSessionId: "ses_deleted",
      workspacePath,
      title: "Deleted locally",
      status: "idle",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      deletedAt: "2026-05-20T18:00:00.000Z",
      tombstoneReason: "provider_deleted",
      metadata: {},
    });
    const provider = sessionListProvider([
      {
        providerId: "opencode",
        providerSessionId: "ses_deleted",
        workspacePath,
        title: "Provider tried to revive",
        status: "running",
        createdAt: "2026-05-20T17:00:00.000Z",
        updatedAt: "2026-05-20T18:30:00.000Z",
        metadata: {},
      },
    ]);

    const result = await syncProviderSessions({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        metadata: {},
      },
      now: () => new Date("2026-05-20T19:00:00.000Z"),
      createSessionId: () => "apx_should_not_be_used",
    });

    expect(result).toMatchObject({
      imported: 0,
      updated: 0,
      missing: 0,
      skippedTombstones: 1,
      sessions: [],
    });
    expect(storage.sessions.getById("apx_deleted")).toMatchObject({
      title: "Deleted locally",
      status: "idle",
      deletedAt: "2026-05-20T18:00:00.000Z",
      tombstoneReason: "provider_deleted",
    });
    storage.close();
  });

  it("filters sync and missing detection by workspace", async () => {
    const { storage, workspacePath, otherWorkspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_target_missing",
      providerId: "opencode",
      providerSessionId: "ses_target_missing",
      workspacePath,
      title: "Target missing",
      status: "idle",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_other",
      providerId: "opencode",
      providerSessionId: "ses_other",
      workspacePath: otherWorkspacePath,
      title: "Other workspace remains",
      status: "idle",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      metadata: {},
    });
    const provider = sessionListProvider([
      {
        providerId: "opencode",
        providerSessionId: "ses_target",
        workspacePath,
        title: "Target workspace session",
        status: "idle",
        createdAt: "2026-05-20T18:00:00.000Z",
        updatedAt: "2026-05-20T18:30:00.000Z",
        metadata: {},
      },
      {
        providerId: "opencode",
        providerSessionId: "ses_other_provider",
        workspacePath: otherWorkspacePath,
        title: "Provider other workspace",
        status: "idle",
        createdAt: "2026-05-20T18:00:00.000Z",
        updatedAt: "2026-05-20T18:30:00.000Z",
        metadata: {},
      },
    ]);

    const result = await syncProviderSessions({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        metadata: {},
      },
      query: {
        workspacePath,
        metadata: {},
      },
      now: () => new Date("2026-05-20T19:00:00.000Z"),
      missingDetection: "completeProviderList",
      createSessionId: () => "apx_target",
    });

    expect(result.sessions.map((session) => session.providerSessionId)).toEqual([
      "ses_target",
      "ses_target_missing",
    ]);
    expect(storage.sessions.getById("apx_target_missing")).toMatchObject({
      status: "missing_in_provider",
    });
    expect(storage.sessions.getById("apx_other")).toMatchObject({
      status: "idle",
    });
    expect(
      storage.sessions.getByProviderSessionId("opencode", "ses_other_provider"),
    ).toBeUndefined();
    storage.close();
  });

  it("skips missing detection by default and matches provider sessions across workspaces", async () => {
    const { storage, workspacePath, otherWorkspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_cross_workspace",
      providerId: "opencode",
      providerSessionId: "ses_cross_workspace",
      workspacePath: otherWorkspacePath,
      title: "Original workspace wins",
      status: "idle",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_not_marked_missing",
      providerId: "opencode",
      providerSessionId: "ses_not_returned",
      workspacePath,
      title: "Should not be marked missing by partial sync",
      status: "idle",
      createdAt: "2026-05-20T17:00:00.000Z",
      updatedAt: "2026-05-20T17:30:00.000Z",
      metadata: {},
    });
    const provider = sessionListProvider([
      {
        providerId: "opencode",
        providerSessionId: "ses_cross_workspace",
        workspacePath,
        title: "Provider reported different workspace",
        status: "running",
        createdAt: "2026-05-20T18:00:00.000Z",
        updatedAt: "2026-05-20T18:30:00.000Z",
        metadata: {},
      },
    ]);

    const result = await syncProviderSessions({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        metadata: {},
      },
      now: () => new Date("2026-05-20T19:00:00.000Z"),
      createSessionId: () => "apx_should_not_be_inserted",
    });

    expect(result).toMatchObject({
      imported: 0,
      updated: 1,
      missing: 0,
    });
    expect(storage.sessions.getById("apx_cross_workspace")).toMatchObject({
      workspacePath: otherWorkspacePath,
      title: "Provider reported different workspace",
      status: "running",
      metadata: {
        providerWorkspacePath: workspacePath,
      },
    });
    expect(storage.sessions.getById("apx_not_marked_missing")).toMatchObject({
      status: "idle",
    });
    storage.close();
  });
});

function sessionListProvider(
  sessions: Awaited<ReturnType<AgentProvider["listSessions"]>>,
): AgentProvider {
  return {
    id: "opencode",
    displayName: "OpenCode",
    getCapabilities: async () => {
      throw new Error("not used");
    },
    healthCheck: async () => {
      throw new Error("not used");
    },
    ensureRuntime: async () => {
      throw new Error("not used");
    },
    shutdownRuntime: async () => {
      throw new Error("not used");
    },
    listModels: async () => {
      throw new Error("not used");
    },
    listSessions: async (_ctx, query) =>
      sessions.filter((session) => {
        if (query?.workspacePath === undefined) {
          return true;
        }

        return session.workspacePath === query.workspacePath;
      }),
    getSession: async () => {
      throw new Error("not used");
    },
    startSession: async () => {
      throw new Error("not used");
    },
    resumeSession: async () => {
      throw new Error("not used");
    },
    sendMessage: () => {
      throw new Error("not used");
    },
    abortSession: async () => {
      throw new Error("not used");
    },
    deleteSession: async () => {
      throw new Error("not used");
    },
    exportSession: async () => {
      throw new Error("not used");
    },
    importSession: async () => {
      throw new Error("not used");
    },
    shareSession: async () => {
      throw new Error("not used");
    },
    openNativeTui: async () => {
      throw new Error("not used");
    },
    passthrough: async () => {
      throw new Error("not used");
    },
  };
}
