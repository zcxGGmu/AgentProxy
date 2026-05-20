import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentProvider } from "../src/providers/index.js";
import {
  resumeAgentProxySession,
  startAgentProxySession,
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
  providerWorkspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-session-lifecycle-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  const providerWorkspacePath = path.join(root, "provider-workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(providerWorkspacePath, { recursive: true }),
  ]);

  return {
    storage: openAgentProxyStorage({
      databasePath: path.join(dataDir, "agentproxy.sqlite3"),
    }),
    workspacePath,
    providerWorkspacePath,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session lifecycle persistence", () => {
  it("starts a provider session and persists the AgentProxy mapping", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_parent",
      providerId: "opencode",
      providerSessionId: "ses_parent",
      workspacePath,
      title: "Parent session",
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      metadata: {},
    });
    const provider = lifecycleProvider({
      startSession: async (ctx) => {
        expect(ctx.metadata.parentProviderSessionId).toBe("ses_parent");
        expect(ctx.prompt).toBeUndefined();

        return {
          providerId: ctx.providerId,
          providerSessionId: "ses_created",
          workspacePath,
          parentProviderSessionId: "ses_parent",
          title: "Created provider session",
          status: "running",
          createdAt: "2026-05-20T20:00:00.000Z",
          updatedAt: "2026-05-20T20:00:01.000Z",
          lastRunAt: "2026-05-20T20:00:01.000Z",
          metadata: {
            opencode: {
              session: {
                projectId: "proj_created",
              },
            },
          },
        };
      },
      resumeSession: async (ctx) => {
        expect(ctx.providerSessionId).toBe("ses_created");
        expect(ctx.prompt).toBe("do not persist prompt secret-token");
        expect(ctx.model).toBe("anthropic/claude-sonnet-4-5");

        return {
          providerId: ctx.providerId,
          providerSessionId: ctx.providerSessionId,
          workspacePath,
          parentProviderSessionId: "ses_parent",
          title: "Created provider session",
          status: "running",
          createdAt: "2026-05-20T20:00:00.000Z",
          updatedAt: "2026-05-20T20:00:01.000Z",
          lastRunAt: "2026-05-20T20:00:01.000Z",
          metadata: {
            opencode: {
              session: {
                projectId: "proj_created",
              },
              promptAsync: {
                accepted: true,
              },
            },
          },
        };
      },
    });

    const result = await startAgentProxySession({
      provider,
      storage,
      context: {
        providerId: "opencode",
        workspacePath,
        runtimeId: "runtime_1",
        parentSessionId: "apx_parent",
        prompt: "do not persist prompt secret-token",
        model: "anthropic/claude-sonnet-4-5",
        metadata: {},
      },
      now: () => new Date("2026-05-20T20:00:02.000Z"),
      createSessionId: () => "apx_created",
    });

    expect(result.session).toEqual({
      id: "apx_created",
      providerId: "opencode",
      providerSessionId: "ses_created",
      workspacePath,
      title: "Created provider session",
      status: "running",
      runtimeId: "runtime_1",
      parentSessionId: "apx_parent",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:01.000Z",
      lastRunAt: "2026-05-20T20:00:01.000Z",
      lastSyncAt: "2026-05-20T20:00:02.000Z",
      sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
      metadata: {
        opencode: {
          session: {
            projectId: "proj_created",
          },
          promptAsync: {
            accepted: true,
          },
        },
        lifecycle: {
          startedAt: "2026-05-20T20:00:02.000Z",
          promptSentAt: "2026-05-20T20:00:02.000Z",
          requestedModel: "anthropic/claude-sonnet-4-5",
        },
        parentProviderSessionId: "ses_parent",
      },
    });
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_created")).toEqual(
      result.session,
    );
    expect(JSON.stringify(result.session)).not.toContain("secret-token");
  });

  it("rejects missing or tombstoned parent sessions before provider creation", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_deleted_parent",
      providerId: "opencode",
      providerSessionId: "ses_deleted_parent",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      deletedAt: "2026-05-20T19:45:00.000Z",
      tombstoneReason: "user_deleted",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_other_provider_parent",
      providerId: "other",
      providerSessionId: "ses_other_parent",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      metadata: {},
    });
    let startCalls = 0;
    const provider = lifecycleProvider({
      startSession: async (ctx) => {
        startCalls += 1;
        return {
          providerId: ctx.providerId,
          providerSessionId: "ses_should_not_exist",
          status: "idle",
          metadata: {},
        };
      },
    });

    await expect(
      startAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          workspacePath,
          parentSessionId: "apx_missing_parent",
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.start",
    });
    await expect(
      startAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          workspacePath,
          parentSessionId: "apx_deleted_parent",
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.start",
    });
    await expect(
      startAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          workspacePath,
          parentSessionId: "apx_other_provider_parent",
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "sessions.start",
    });
    expect(startCalls).toBe(0);
  });

  it("refuses provider-returned parent mappings that point to local tombstones", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_deleted_parent",
      providerId: "opencode",
      providerSessionId: "ses_deleted_parent",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      deletedAt: "2026-05-20T19:45:00.000Z",
      tombstoneReason: "user_deleted",
      metadata: {},
    });
    const provider = lifecycleProvider({
      startSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_child",
        workspacePath,
        parentProviderSessionId: "ses_deleted_parent",
        status: "idle",
        metadata: {},
      }),
    });

    await expect(
      startAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          workspacePath,
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.persist",
    });
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_child")).toBeUndefined();
  });

  it("persists a created session mapping before surfacing initial prompt failure", async () => {
    const { storage, workspacePath } = await createStorage();
    const provider = lifecycleProvider({
      startSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_created_before_prompt_failure",
        workspacePath,
        title: "Created before prompt failure",
        status: "idle",
        createdAt: "2026-05-20T20:00:00.000Z",
        updatedAt: "2026-05-20T20:00:01.000Z",
        metadata: {},
      }),
      resumeSession: async () => {
        throw new Error("prompt dispatch failed with secret-token");
      },
    });

    let error: unknown;
    try {
      await startAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          workspacePath,
          prompt: "do not lose mapping or persist this prompt secret-token",
          metadata: {},
        },
        now: () => new Date("2026-05-20T20:00:02.000Z"),
        createSessionId: () => "apx_created_before_prompt_failure",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(
      storage.sessions.getByProviderSessionId("opencode", "ses_created_before_prompt_failure"),
    ).toMatchObject({
      id: "apx_created_before_prompt_failure",
      providerSessionId: "ses_created_before_prompt_failure",
      workspacePath,
      title: "Created before prompt failure",
      lastError: "Session prompt dispatch failed.",
      metadata: {
        lifecycle: {
          startedAt: "2026-05-20T20:00:02.000Z",
          promptFailedAt: "2026-05-20T20:00:02.000Z",
        },
      },
    });
    expect(JSON.stringify(storage.sessions.list({ includeTombstones: true }))).not.toContain(
      "do not lose mapping",
    );
  });

  it("resumes an existing provider session using the original provider id and preserves local workspace", async () => {
    const { storage, workspacePath, providerWorkspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_existing",
      providerId: "opencode",
      providerSessionId: "ses_existing",
      workspacePath,
      title: "Local cached title",
      status: "idle",
      model: "anthropic/claude-sonnet-4-5",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      metadata: {
        localOnly: true,
      },
    });
    const provider = lifecycleProvider({
      resumeSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        workspacePath: providerWorkspacePath,
        title: "Provider title wins",
        status: "running",
        createdAt: "2026-05-20T19:00:00.000Z",
        updatedAt: "2026-05-20T20:00:00.000Z",
        metadata: {
          opencode: {
            session: {
              directory: providerWorkspacePath,
            },
          },
        },
      }),
    });

    const result = await resumeAgentProxySession({
      provider,
      storage,
      context: {
        providerId: "opencode",
        providerSessionId: "ses_existing",
        workspacePath,
        runtimeId: "runtime_2",
        prompt: "continue without storing this secret-token",
        metadata: {},
      },
      now: () => new Date("2026-05-20T20:00:02.000Z"),
      createSessionId: () => "apx_should_not_be_used",
    });

    expect(result.session).toMatchObject({
      id: "apx_existing",
      providerId: "opencode",
      providerSessionId: "ses_existing",
      workspacePath,
      title: "Provider title wins",
      status: "running",
      model: "anthropic/claude-sonnet-4-5",
      runtimeId: "runtime_2",
      lastSyncAt: "2026-05-20T20:00:02.000Z",
      metadata: {
        localOnly: true,
        opencode: {
          session: {
            directory: providerWorkspacePath,
          },
        },
        providerWorkspacePath,
        lifecycle: {
          resumedAt: "2026-05-20T20:00:02.000Z",
        },
      },
    });
    expect(JSON.stringify(result.session)).not.toContain("secret-token");
  });

  it("does not revive tombstoned local session mappings", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_deleted",
      providerId: "opencode",
      providerSessionId: "ses_deleted",
      workspacePath,
      title: "Deleted local mapping",
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      deletedAt: "2026-05-20T19:45:00.000Z",
      tombstoneReason: "user_deleted",
      metadata: {},
    });
    const provider = lifecycleProvider({
      resumeSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        workspacePath,
        status: "running",
        metadata: {},
      }),
    });

    await expect(
      resumeAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          providerSessionId: "ses_deleted",
          workspacePath,
          metadata: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.resume",
    });
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_deleted")).toMatchObject({
      id: "apx_deleted",
      deletedAt: "2026-05-20T19:45:00.000Z",
      tombstoneReason: "user_deleted",
    });
  });

  it("refuses to persist a resume response for a different provider session id", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_requested",
      providerId: "opencode",
      providerSessionId: "ses_requested",
      workspacePath,
      title: "Requested session",
      status: "idle",
      createdAt: "2026-05-20T19:00:00.000Z",
      updatedAt: "2026-05-20T19:30:00.000Z",
      metadata: {},
    });
    const provider = lifecycleProvider({
      resumeSession: async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_wrong_secret-token",
        workspacePath,
        title: "Wrong session",
        status: "running",
        metadata: {},
      }),
    });

    let error: unknown;
    try {
      await resumeAgentProxySession({
        provider,
        storage,
        context: {
          providerId: "opencode",
          providerSessionId: "ses_requested",
          workspacePath,
          prompt: "do not persist this prompt secret-token",
          metadata: {},
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "sessions.resume",
      details: {
        failureReason: "provider_session_id_mismatch",
        providerSessionId: "ses_requested",
      },
    });
    expect(JSON.stringify(error)).not.toContain("ses_wrong_secret-token");
    expect(JSON.stringify(error)).not.toContain("do not persist this prompt");
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_wrong_secret-token")).toBe(
      undefined,
    );
  });
});

function lifecycleProvider(
  overrides: Partial<Pick<AgentProvider, "startSession" | "resumeSession">>,
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
    listModels: async () => [],
    listSessions: async () => [],
    getSession: async (_ctx, id): Promise<ProviderSession> => ({
      providerId: "opencode",
      providerSessionId: id,
      status: "idle",
      metadata: {},
    }),
    startSession:
      overrides.startSession ??
      (async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: "ses_default_started",
        status: "idle",
        metadata: {},
      })),
    resumeSession:
      overrides.resumeSession ??
      (async (ctx) => ({
        providerId: ctx.providerId,
        providerSessionId: ctx.providerSessionId,
        status: "idle",
        metadata: {},
      })),
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
