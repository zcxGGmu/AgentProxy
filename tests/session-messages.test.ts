import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../src/core/index.js";
import type { AgentProvider } from "../src/providers/index.js";
import { sendAgentProxyMessage, type ProviderSession } from "../src/sessions/index.js";
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
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-session-message-test-"));
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

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session message dispatch persistence", () => {
  it("persists message lifecycle status and sanitized event records", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_message",
      providerId: "opencode",
      providerSessionId: "ses_message",
      workspacePath,
      title: "Message session",
      status: "idle",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:00.000Z",
      sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
      metadata: {},
    });
    const provider = messageProvider(async function* (ctx) {
      expect(ctx.prompt).toBe("do not persist prompt secret-token");
      expect(ctx.providerSessionId).toBe("ses_message");

      yield {
        type: "message.delta",
        role: "assistant",
        delta: "transcript secret-token",
        messageId: "msg_1",
        metadata: {
          rawSecret: "secret-token",
        },
      };
      yield {
        type: "permission.requested",
        permissionId: "per_1",
        action: "bash",
        metadata: {
          pattern: "secret-token",
        },
      };
      yield {
        type: "session.completed",
        status: "completed",
        metadata: {
          completedBy: "fake-provider",
        },
      };
    });

    const events = await collectEvents(
      sendAgentProxyMessage({
        provider,
        storage,
        context: {
          providerId: "opencode",
          providerSessionId: "ses_message",
          agentproxySessionId: "apx_message",
          workspacePath,
          runtimeId: "runtime_message",
          prompt: "do not persist prompt secret-token",
          metadata: {},
        },
        now: fakeClock([
          "2026-05-20T20:00:01.000Z",
          "2026-05-20T20:00:02.000Z",
          "2026-05-20T20:00:03.000Z",
          "2026-05-20T20:00:04.000Z",
          "2026-05-20T20:00:05.000Z",
        ]),
        createEventId: fakeIds(["evt_1", "evt_2", "evt_3"]),
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "message.delta",
      "permission.requested",
      "session.completed",
    ]);
    expect(storage.sessions.getById("apx_message")).toMatchObject({
      id: "apx_message",
      status: "completed",
      runtimeId: "runtime_message",
      updatedAt: "2026-05-20T20:00:04.000Z",
      lastRunAt: "2026-05-20T20:00:04.000Z",
      lastSyncAt: "2026-05-20T20:00:04.000Z",
      metadata: {
        lifecycle: {
          messageStartedAt: "2026-05-20T20:00:01.000Z",
          messageCompletedAt: "2026-05-20T20:00:04.000Z",
        },
      },
    });
    expect(storage.sessionEvents.listBySessionId("apx_message")).toEqual([
      {
        id: "evt_1",
        sessionId: "apx_message",
        providerId: "opencode",
        eventType: "message.delta",
        createdAt: "2026-05-20T20:00:02.000Z",
        payload: {
          type: "message.delta",
          role: "assistant",
          messageId: "msg_1",
          metadata: {},
        },
      },
      {
        id: "evt_2",
        sessionId: "apx_message",
        providerId: "opencode",
        eventType: "permission.requested",
        createdAt: "2026-05-20T20:00:03.000Z",
        payload: {
          type: "permission.requested",
          permissionId: "per_1",
          action: "bash",
          metadata: {},
        },
      },
      {
        id: "evt_3",
        sessionId: "apx_message",
        providerId: "opencode",
        eventType: "session.completed",
        createdAt: "2026-05-20T20:00:04.000Z",
        payload: {
          type: "session.completed",
          status: "completed",
          metadata: {
            completedBy: "fake-provider",
          },
        },
      },
    ]);
    expect(JSON.stringify(storage.sessions.list({ includeTombstones: true }))).not.toContain(
      "secret-token",
    );
    expect(JSON.stringify(storage.sessionEvents.listBySessionId("apx_message"))).not.toContain(
      "secret-token",
    );
  });

  it("rejects missing or tombstoned local mappings before calling the provider", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_deleted",
      providerId: "opencode",
      providerSessionId: "ses_deleted",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:00.000Z",
      deletedAt: "2026-05-20T20:00:01.000Z",
      tombstoneReason: "user_deleted",
      metadata: {},
    });
    let sendCalls = 0;
    const provider = messageProvider(async function* () {
      sendCalls += 1;
      yield* [];
    });

    await expect(
      collectEvents(
        sendAgentProxyMessage({
          provider,
          storage,
          context: {
            providerId: "opencode",
            providerSessionId: "ses_missing",
            workspacePath,
            prompt: "hello",
            metadata: {},
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.sendMessage",
    });

    await expect(
      collectEvents(
        sendAgentProxyMessage({
          provider,
          storage,
          context: {
            providerId: "opencode",
            providerSessionId: "ses_deleted",
            workspacePath,
            prompt: "hello",
            metadata: {},
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "sessions.sendMessage",
    });

    expect(sendCalls).toBe(0);
  });

  it("marks the local session failed when provider message streaming fails", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_fails",
      providerId: "opencode",
      providerSessionId: "ses_fails",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:00.000Z",
      metadata: {},
    });
    const provider = messageProvider(async function* () {
      yield {
        type: "message.delta",
        role: "assistant",
        delta: "partial secret-token",
        metadata: {},
      };
      throw new Error("provider stream failed with secret-token");
    });

    let error: unknown;
    try {
      await collectEvents(
        sendAgentProxyMessage({
          provider,
          storage,
          context: {
            providerId: "opencode",
            providerSessionId: "ses_fails",
            workspacePath,
            prompt: "do not persist prompt secret-token",
            metadata: {},
          },
          now: fakeClock([
            "2026-05-20T20:00:01.000Z",
            "2026-05-20T20:00:02.000Z",
            "2026-05-20T20:00:03.000Z",
          ]),
          createEventId: fakeIds(["evt_fail_1"]),
        }),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(storage.sessions.getById("apx_fails")).toMatchObject({
      status: "failed",
      lastError: "Session message dispatch failed.",
      metadata: {
        lifecycle: {
          messageStartedAt: "2026-05-20T20:00:01.000Z",
          messageFailedAt: "2026-05-20T20:00:03.000Z",
        },
      },
    });
    expect(JSON.stringify(storage.sessions.list({ includeTombstones: true }))).not.toContain(
      "secret-token",
    );
    expect(JSON.stringify(storage.sessionEvents.listBySessionId("apx_fails"))).not.toContain(
      "secret-token",
    );
  });

  it("marks the local session failed when the consumer stops before a terminal event", async () => {
    const { storage, workspacePath } = await createStorage();
    storage.sessions.upsert({
      id: "apx_cancelled",
      providerId: "opencode",
      providerSessionId: "ses_cancelled",
      workspacePath,
      status: "idle",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:00.000Z",
      metadata: {},
    });
    const provider = messageProvider(async function* () {
      yield {
        type: "message.delta",
        role: "assistant",
        delta: "partial secret-token",
        metadata: {},
      };
      await new Promise<void>(() => {});
    });
    const stream = sendAgentProxyMessage({
      provider,
      storage,
      context: {
        providerId: "opencode",
        providerSessionId: "ses_cancelled",
        workspacePath,
        prompt: "do not persist prompt secret-token",
        metadata: {},
      },
      now: fakeClock([
        "2026-05-20T20:00:01.000Z",
        "2026-05-20T20:00:02.000Z",
        "2026-05-20T20:00:03.000Z",
      ]),
      createEventId: fakeIds(["evt_cancelled_1"]),
    })[Symbol.asyncIterator]();

    await expect(stream.next()).resolves.toMatchObject({
      value: {
        type: "message.delta",
      },
      done: false,
    });
    await stream.return?.();

    expect(storage.sessions.getById("apx_cancelled")).toMatchObject({
      status: "failed",
      lastError: "Session message dispatch failed.",
      metadata: {
        lifecycle: {
          messageStartedAt: "2026-05-20T20:00:01.000Z",
          messageFailedAt: "2026-05-20T20:00:03.000Z",
        },
      },
    });
    expect(JSON.stringify(storage.sessionEvents.listBySessionId("apx_cancelled"))).not.toContain(
      "secret-token",
    );
  });
});

function messageProvider(sendMessage: AgentProvider["sendMessage"]): AgentProvider {
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
    startSession: async (ctx) => ({
      providerId: ctx.providerId,
      providerSessionId: "ses_default_started",
      status: "idle",
      metadata: {},
    }),
    resumeSession: async (ctx) => ({
      providerId: ctx.providerId,
      providerSessionId: ctx.providerSessionId,
      status: "idle",
      metadata: {},
    }),
    sendMessage,
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

function fakeClock(values: string[]): () => Date {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? values.at(-1);
    index += 1;
    return new Date(value ?? "2026-05-20T00:00:00.000Z");
  };
}

function fakeIds(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? values.at(-1);
    index += 1;
    return value ?? "evt_fallback";
  };
}
