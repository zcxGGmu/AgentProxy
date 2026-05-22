import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AgentProvider,
  ExportResult,
  ExportSessionRequest,
  ImportSessionRequest,
  SessionActionRequest,
  ShareResult,
} from "../src/providers/index.js";
import {
  abortAgentProxySession,
  deleteAgentProxySession,
  exportAgentProxySession,
  importAgentProxySession,
  shareAgentProxySession,
  unshareAgentProxySession,
  type ProviderSession,
} from "../src/sessions/index.js";
import {
  AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
  openAgentProxyStorage,
  type AgentProxyStorage,
} from "../src/storage/index.js";

const tempRoots: string[] = [];

async function createStorage(): Promise<{
  storage: AgentProxyStorage;
  workspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-session-actions-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
  ]);

  return {
    storage: openAgentProxyStorage({
      databasePath: path.join(dataDir, "agentproxy.sqlite3"),
    }),
    workspacePath,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session operation service", () => {
  it("aborts a provider session and records local abort metadata without payload data", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert(createStoredSession({ workspacePath }));
    let abortCalls = 0;
    const provider = operationProvider({
      abortSession: async (ctx) => {
        abortCalls += 1;
        expect(ctx).toMatchObject({
          providerId: "opencode",
          providerSessionId: "ses_actions",
          sessionId: "apx_actions",
          workspacePath,
        });
      },
    });

    const result = await abortAgentProxySession({
      provider,
      storage,
      context: actionContext(workspacePath),
      now: () => new Date("2026-05-20T21:05:00.000Z"),
    });

    expect(abortCalls).toBe(1);
    expect(result).toMatchObject({
      id: "apx_actions",
      providerSessionId: "ses_actions",
      status: "failed",
      updatedAt: "2026-05-20T21:05:00.000Z",
      lastRunAt: "2026-05-20T21:05:00.000Z",
      lastSyncAt: "2026-05-20T21:05:00.000Z",
      metadata: {
        sessionOperations: {
          abort: {
            abortedAt: "2026-05-20T21:05:00.000Z",
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });

  it("requires confirmation before provider delete and writes a local tombstone", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert(createStoredSession({ workspacePath }));
    let deleteCalls = 0;
    const provider = operationProvider({
      deleteSession: async (ctx) => {
        deleteCalls += 1;
        expect(ctx.providerSessionId).toBe("ses_actions");
      },
    });

    await expect(
      deleteAgentProxySession({
        provider,
        storage,
        context: actionContext(workspacePath),
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "sessions.delete",
      details: {
        failureReason: "confirmation_required",
      },
    });
    expect(deleteCalls).toBe(0);

    const result = await deleteAgentProxySession({
      provider,
      storage,
      context: actionContext(workspacePath),
      confirmed: true,
      now: () => new Date("2026-05-20T21:10:00.000Z"),
    });

    expect(result.deletedAt).toBe("2026-05-20T21:10:00.000Z");
    expect(deleteCalls).toBe(1);
    expect(storage.sessions.getById("apx_actions")).toMatchObject({
      id: "apx_actions",
      deletedAt: "2026-05-20T21:10:00.000Z",
      tombstoneReason: "provider_deleted",
    });
  });

  it("does not call provider operations for tombstoned sessions", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      ...createStoredSession({ workspacePath }),
      deletedAt: "2026-05-20T21:00:00.000Z",
      tombstoneReason: "user_deleted",
    });
    let deleteCalls = 0;
    const provider = operationProvider({
      deleteSession: async () => {
        deleteCalls += 1;
      },
    });

    await expect(
      deleteAgentProxySession({
        provider,
        storage,
        context: actionContext(workspacePath),
        confirmed: true,
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.delete",
    });
    expect(deleteCalls).toBe(0);
  });

  it("exports without persisting export data and enforces raw confirmation", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert(createStoredSession({ workspacePath }));
    const provider = operationProvider({
      exportSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        sanitized: ctx.raw !== true,
        data: {
          transcript: "export payload secret-token",
        },
        metadata: {},
      }),
    });

    await expect(
      exportAgentProxySession({
        provider,
        storage,
        context: {
          ...actionContext(workspacePath),
          raw: true,
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "sessions.export",
    });

    const result = await exportAgentProxySession({
      provider,
      storage,
      context: {
        ...actionContext(workspacePath),
        metadata: {},
      },
    });

    expect(result.sanitized).toBe(true);
    expect(JSON.stringify(storage.sessions.getById("apx_actions"))).not.toContain(
      "export payload secret-token",
    );
  });

  it("persists imported sessions without storing import source secrets", async () => {
    const { storage, workspacePath } = await createStorage();
    const provider = operationProvider({
      importSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_imported",
        workspacePath,
        title: "\u001B[31mImported token=title-secret\u001B[0m",
        status: "idle",
        createdAt: "2026-05-20T21:00:00.000Z",
        updatedAt: "2026-05-20T21:00:01.000Z",
        metadata: {
          authorization: "Bearer sk-provider-metadata-secret",
          opencode: {
            session: {
              directory: `${workspacePath}\u001B[31m`,
            },
          },
        },
      }),
    });

    const result = await importAgentProxySession({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        source: "https://share.example.test/import?token=source-secret-token",
        metadata: {},
      },
      now: () => new Date("2026-05-20T21:00:02.000Z"),
      createSessionId: () => "apx_imported",
    });

    expect(result.session).toMatchObject({
      id: "apx_imported",
      providerId: "opencode",
      providerSessionId: "ses_imported",
      workspacePath,
      title: "Imported token=[REDACTED]",
      status: "idle",
      lastSyncAt: "2026-05-20T21:00:02.000Z",
      sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
      metadata: {
        authorization: "[REDACTED]",
        opencode: {
          session: {
            directory: workspacePath,
          },
        },
        lifecycle: {
          importedAt: "2026-05-20T21:00:02.000Z",
        },
      },
    });
    expect(JSON.stringify(result.session)).not.toContain("source-secret-token");
    expect(JSON.stringify(result.session)).not.toContain("title-secret");
    expect(JSON.stringify(result.session)).not.toContain("sk-provider-metadata-secret");
    expect(JSON.stringify(result.session)).not.toContain("\u001B[31m");
  });

  it("updates local share state without persisting provider share URLs", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert(createStoredSession({ workspacePath }));
    const provider = operationProvider({
      shareSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        url: "https://share.example.test/ses_actions?token=share-secret-token",
        metadata: {},
      }),
      unshareSession: async (ctx) => {
        expect(ctx.providerSessionId).toBe("ses_actions");
      },
    });

    const share = await shareAgentProxySession({
      provider,
      storage,
      context: actionContext(workspacePath),
      now: () => new Date("2026-05-20T21:15:00.000Z"),
    });
    expect(share.url).toContain("share-secret-token");
    expect(storage.sessions.getById("apx_actions")).toMatchObject({
      metadata: {
        sessionOperations: {
          share: {
            shared: true,
            updatedAt: "2026-05-20T21:15:00.000Z",
          },
        },
      },
    });
    expect(JSON.stringify(storage.sessions.getById("apx_actions"))).not.toContain(
      "share-secret-token",
    );

    await unshareAgentProxySession({
      provider,
      storage,
      context: actionContext(workspacePath),
      now: () => new Date("2026-05-20T21:16:00.000Z"),
    });
    expect(storage.sessions.getById("apx_actions")).toMatchObject({
      metadata: {
        sessionOperations: {
          share: {
            shared: false,
            updatedAt: "2026-05-20T21:16:00.000Z",
          },
        },
      },
    });
  });

  it("does not update share state when the local mapping changes during unshare", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      ...createStoredSession({ workspacePath }),
      metadata: {
        sessionOperations: {
          share: {
            shared: true,
            updatedAt: "2026-05-20T21:15:00.000Z",
          },
        },
      },
    });
    const provider = operationProvider({
      unshareSession: async () => {
        const current = storage.sessions.getById("apx_actions");
        if (current === undefined) {
          throw new Error("Expected stored session.");
        }
        storage.sessions.upsert({
          ...current,
          providerSessionId: "ses_remapped",
          metadata: {
            sessionOperations: {
              share: {
                shared: true,
                updatedAt: "2026-05-20T21:15:00.000Z",
              },
            },
          },
        });
      },
    });

    await expect(
      unshareAgentProxySession({
        provider,
        storage,
        context: actionContext(workspacePath),
        now: () => new Date("2026-05-20T21:16:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.unshare",
    });
    expect(storage.sessions.getById("apx_actions")).toMatchObject({
      providerSessionId: "ses_remapped",
      metadata: {
        sessionOperations: {
          share: {
            shared: true,
            updatedAt: "2026-05-20T21:15:00.000Z",
          },
        },
      },
    });
  });
});

function actionContext(workspacePath: string): SessionActionRequest {
  return {
    providerId: "opencode",
    providerSessionId: "ses_actions",
    sessionId: "apx_actions",
    workspacePath,
    metadata: {},
  };
}

function createStoredSession(input: { workspacePath: string }) {
  return {
    id: "apx_actions",
    providerId: "opencode",
    providerSessionId: "ses_actions",
    workspacePath: input.workspacePath,
    title: "Session actions",
    status: "idle" as const,
    createdAt: "2026-05-20T20:00:00.000Z",
    updatedAt: "2026-05-20T20:00:01.000Z",
    metadata: {},
  };
}

function operationProvider(
  overrides: Partial<
    Pick<
      AgentProvider,
      | "abortSession"
      | "deleteSession"
      | "exportSession"
      | "importSession"
      | "shareSession"
      | "unshareSession"
    >
  >,
): AgentProvider {
  const providerSession: ProviderSession = {
    providerId: "opencode",
    providerSessionId: "ses_actions",
    status: "idle",
    metadata: {},
  };

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
    listModels: async () => [],
    listSessions: async () => [],
    getSession: async (_ctx, id): Promise<ProviderSession> => ({
      ...providerSession,
      providerSessionId: id,
    }),
    startSession: async () => providerSession,
    resumeSession: async (ctx) => ({
      ...providerSession,
      providerSessionId: ctx.providerSessionId,
    }),
    sendMessage: async function* () {
      yield {
        type: "provider.raw_event" as const,
        providerEventType: "not.used",
        raw: {},
        metadata: {},
      };
    },
    abortSession: overrides.abortSession ?? (async () => undefined),
    deleteSession: overrides.deleteSession ?? (async () => undefined),
    exportSession:
      overrides.exportSession ??
      (async (ctx: ExportSessionRequest): Promise<ExportResult> => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        sanitized: true,
        data: {},
        metadata: {},
      })),
    importSession:
      overrides.importSession ??
      (async (ctx: ImportSessionRequest): Promise<ProviderSession> => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_imported",
        ...(ctx.workspacePath !== undefined ? { workspacePath: ctx.workspacePath } : {}),
        status: "idle",
        metadata: {},
      })),
    shareSession:
      overrides.shareSession ??
      (async (ctx: SessionActionRequest): Promise<ShareResult> => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        url: "https://share.example.test/ses_actions",
        metadata: {},
      })),
    unshareSession: overrides.unshareSession ?? (async () => undefined),
    openNativeTui: async () => {
      throw new Error("not used");
    },
    passthrough: async () => {
      throw new Error("not used");
    },
  };
}
