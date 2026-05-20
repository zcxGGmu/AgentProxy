import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  OPENCODE_EVENT_STREAM_METADATA_KEY,
  OpenCodeEventStreamClient,
  RuntimeRegistry,
} from "../src/runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const openResponses: { destroy: () => void }[] = [];

interface FakeSseConnection {
  status?: number;
  contentType?: string;
  events?: readonly unknown[];
  keepOpen?: boolean;
}

async function createTestContext(): Promise<{
  storage: AgentProxyStorage;
  workspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-event-stream-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
  ]);

  return {
    storage: openAgentProxyStorage({ databasePath: path.join(dataDir, "agentproxy.sqlite3") }),
    workspacePath,
  };
}

async function startFakeOpenCodeEventServer(options: {
  connections: readonly FakeSseConnection[];
}): Promise<{
  server: Server;
  baseUrl: string;
  requestPaths: string[];
  closeConnection: (index: number) => void;
  waitForConnectionClose: (index: number) => Promise<void>;
}> {
  const requestPaths: string[] = [];
  const responses: { end: () => void; destroy: () => void }[] = [];
  const closePromises: Promise<void>[] = [];
  let connectionIndex = 0;

  const server = createServer((request, response) => {
    const currentConnectionIndex = connectionIndex;
    const requestPath = request.url ?? "";
    requestPaths.push(requestPath);

    if (!requestPath.startsWith("/event")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const connection =
      options.connections[Math.min(connectionIndex, options.connections.length - 1)] ?? {};
    connectionIndex += 1;
    responses[currentConnectionIndex] = {
      end: () => response.end(),
      destroy: () => response.destroy(),
    };
    openResponses.push(responses[currentConnectionIndex]);
    closePromises[currentConnectionIndex] = new Promise((resolve) => {
      const resolveOnce = (): void => resolve();
      request.once("close", resolveOnce);
      response.once("close", resolveOnce);
    });

    response.writeHead(connection.status ?? 200, {
      "content-type": connection.contentType ?? "text/event-stream",
      "cache-control": "no-cache",
    });

    for (const event of connection.events ?? []) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (connection.keepOpen === true) {
      return;
    }
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  servers.push(server);

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected fake OpenCode event server to listen on a TCP address.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    requestPaths,
    closeConnection: (index) => responses[index]?.end(),
    waitForConnectionClose: async (index) => {
      await waitFor(() => closePromises[index] !== undefined);
      await withTimeout(closePromises[index] as Promise<void>, 1_000);
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function createRegistry(storage: AgentProxyStorage): RuntimeRegistry {
  return new RuntimeRegistry({
    storage,
    now: () => new Date("2026-05-20T00:00:00.000Z"),
  });
}

function registerHealthyRuntime(input: {
  registry: RuntimeRegistry;
  runtimeId: string;
  baseUrl: string;
  workspacePath: string;
}): void {
  input.registry.register({
    id: input.runtimeId,
    providerId: "opencode",
    mode: "attached",
    status: "healthy",
    baseUrl: input.baseUrl,
    hostname: "127.0.0.1",
    port: Number(new URL(input.baseUrl).port),
    workspacePath: input.workspacePath,
    metadata: {
      source: "test",
    },
  });
}

async function collectEvents(stream: AsyncIterable<unknown>, count: number): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of stream) {
    events.push(event);
    if (events.length === count) {
      break;
    }
  }
  return events;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timed out waiting for promise.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

afterEach(async () => {
  for (const response of openResponses.splice(0)) {
    response.destroy();
  }
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCode event stream client", () => {
  it("connects to /event and wraps known OpenCode events in AgentProxy envelopes", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          events: [
            {
              id: "evt_delta",
              type: "message.part.delta",
              properties: {
                sessionID: "ses_known",
                messageID: "msg_1",
                partID: "prt_1",
                field: "text",
                delta: "hello",
              },
            },
          ],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_known",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      now: () => new Date("2026-05-20T00:00:01.000Z"),
      maxReconnectAttempts: 0,
    });

    const [event] = await collectEvents(
      client.streamRuntime({
        runtimeId: "runtime_event_stream_known",
        agentproxySessionId: "agentproxy_session_1",
        metadata: {
          correlationId: "corr_1",
        },
      }),
      1,
    );

    expect(fakeOpenCode.requestPaths).toEqual(["/event"]);
    expect(event).toMatchObject({
      id: "evt_delta",
      providerId: "opencode",
      providerSessionId: "ses_known",
      agentproxySessionId: "agentproxy_session_1",
      type: "message.delta",
      timestamp: "2026-05-20T00:00:01.000Z",
      payload: {
        type: "message.delta",
        role: "assistant",
        delta: "hello",
        messageId: "msg_1",
        metadata: {
          correlationId: "corr_1",
        },
      },
    });

    storage.close();
  });

  it("keeps unknown OpenCode events as provider.raw_event envelopes", async () => {
    const { storage, workspacePath } = await createTestContext();
    const rawEvent = {
      id: "evt_unknown",
      type: "session.experimental",
      properties: {
        sessionID: "ses_unknown",
        value: true,
      },
    };
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          events: [rawEvent],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_unknown",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      maxReconnectAttempts: 0,
    });

    const [event] = await collectEvents(
      client.streamRuntime({
        runtimeId: "runtime_event_stream_unknown",
      }),
      1,
    );

    expect(event).toMatchObject({
      id: "evt_unknown",
      providerId: "opencode",
      providerSessionId: "ses_unknown",
      type: "provider.raw_event",
      payload: {
        type: "provider.raw_event",
        providerEventType: "session.experimental",
        raw: rawEvent,
      },
      raw: rawEvent,
    });

    storage.close();
  });

  it("marks interruption as degraded, reconnects with backoff, and recovers to healthy", async () => {
    const { storage, workspacePath } = await createTestContext();
    storage.sessions.upsert({
      id: "agentproxy_session_reconnect",
      providerId: "opencode",
      providerSessionId: "ses_reconnect",
      workspacePath,
      status: "running",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      metadata: {},
    });
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          events: [
            {
              id: "evt_before_disconnect",
              type: "session.next.text.delta",
              properties: {
                timestamp: 1,
                sessionID: "ses_reconnect",
                delta: "before",
              },
            },
          ],
        },
        {
          events: [
            {
              id: "evt_after_reconnect",
              type: "session.next.text.delta",
              properties: {
                timestamp: 2,
                sessionID: "ses_reconnect",
                delta: "after",
              },
            },
          ],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_reconnect",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const registerSpy = vi.spyOn(registry, "register");
    const compensateSessionStatus = vi.fn(async () => undefined);
    const client = new OpenCodeEventStreamClient({
      registry,
      now: () => new Date("2026-05-20T00:00:02.000Z"),
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 1,
      compensateSessionStatus,
    });

    const events = await collectEvents(
      client.streamRuntime({
        runtimeId: "runtime_event_stream_reconnect",
        providerSessionId: "ses_reconnect",
        agentproxySessionId: "agentproxy_session_reconnect",
      }),
      2,
    );

    expect(events).toHaveLength(2);
    expect(fakeOpenCode.requestPaths).toEqual(["/event", "/event"]);
    expect(registerSpy.mock.calls.map(([input]) => input.status)).toEqual(
      expect.arrayContaining(["degraded", "reconnecting", "healthy"]),
    );
    expect(storage.runtimes.get("runtime_event_stream_reconnect")).toMatchObject({
      status: "healthy",
      metadata: {
        [OPENCODE_EVENT_STREAM_METADATA_KEY]: {
          interruptCount: 1,
          reconnectAttempt: 1,
          maxReconnectAttempts: 1,
          lastStatusCompensatedAt: "2026-05-20T00:00:02.000Z",
        },
      },
    });
    expect(compensateSessionStatus).toHaveBeenCalledWith({
      runtimeId: "runtime_event_stream_reconnect",
      providerId: "opencode",
      providerSessionId: "ses_reconnect",
      agentproxySessionId: "agentproxy_session_reconnect",
      reconnectAttempt: 1,
      metadata: {},
    });
    expect(storage.sessions.getByProviderSessionId("opencode", "ses_reconnect")).toMatchObject({
      status: "running",
    });

    storage.close();
  });

  it("does not resurrect a stopped or detached runtime after stream interruption", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          keepOpen: true,
          events: [
            {
              id: "evt_before_detach",
              type: "session.next.text.delta",
              properties: {
                timestamp: 1,
                sessionID: "ses_detach",
                delta: "before detach",
              },
            },
          ],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_detached",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 1,
    });
    const iterator = client
      .streamRuntime({
        runtimeId: "runtime_event_stream_detached",
      })
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value).toMatchObject({
      type: "message.delta",
    });

    registry.register({
      id: "runtime_event_stream_detached",
      providerId: "opencode",
      mode: "attached",
      status: "detached",
      stoppedAt: "2026-05-20T00:00:03.000Z",
      metadata: {
        detachedBy: "test",
      },
    });
    fakeOpenCode.closeConnection(0);

    await expect(iterator.next()).rejects.toMatchObject({
      code: "EVENT_STREAM_INTERRUPTED",
      details: {
        failureReason: "runtime_terminal",
        currentStatus: "detached",
      },
    });
    expect(storage.runtimes.get("runtime_event_stream_detached")).toMatchObject({
      status: "detached",
      stoppedAt: "2026-05-20T00:00:03.000Z",
      metadata: {
        detachedBy: "test",
      },
    });

    storage.close();
  });

  it("cancels the SSE connection when the consumer returns early", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          keepOpen: true,
          events: [
            {
              id: "evt_cancel",
              type: "session.next.text.delta",
              properties: {
                timestamp: 1,
                sessionID: "ses_cancel",
                delta: "cancel me",
              },
            },
          ],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_cancel",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      maxReconnectAttempts: 0,
    });
    const iterator = client
      .streamRuntime({
        runtimeId: "runtime_event_stream_cancel",
      })
      [Symbol.asyncIterator]();

    expect(await iterator.next()).toMatchObject({
      done: false,
    });
    await iterator.return?.();

    await fakeOpenCode.waitForConnectionClose(0);
    storage.close();
  });

  it("maps current and legacy OpenCode permission events safely", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [
        {
          events: [
            {
              id: "evt_permission_updated",
              type: "permission.updated",
              properties: {
                id: "per_current",
                sessionID: "ses_permission",
                type: "tool",
                title: "Run tool",
              },
            },
            {
              id: "evt_permission_replied",
              type: "permission.replied",
              properties: {
                sessionID: "ses_permission",
                permissionID: "per_current",
                response: "reject",
              },
            },
            {
              id: "evt_permission_unknown_response",
              type: "permission.replied",
              properties: {
                sessionID: "ses_permission",
                permissionID: "per_current",
                response: "later",
              },
            },
          ],
        },
      ],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_permission",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      maxReconnectAttempts: 0,
    });

    const events = await collectEvents(
      client.streamRuntime({
        runtimeId: "runtime_event_stream_permission",
      }),
      3,
    );

    expect(events[0]).toMatchObject({
      type: "permission.requested",
      payload: {
        permissionId: "per_current",
        action: "tool",
      },
    });
    expect(events[1]).toMatchObject({
      type: "permission.resolved",
      payload: {
        permissionId: "per_current",
        decision: "denied",
      },
    });
    expect(events[2]).toMatchObject({
      type: "provider.raw_event",
      payload: {
        providerEventType: "permission.replied",
      },
    });

    storage.close();
  });

  it("rejects invalid retry and timeout options", async () => {
    const { storage } = await createTestContext();
    expect(
      () =>
        new OpenCodeEventStreamClient({
          storage,
          maxReconnectAttempts: Number.NaN,
        }),
    ).toThrow(AgentProxyError);
    expect(
      () =>
        new OpenCodeEventStreamClient({
          storage,
          connectTimeoutMs: 0,
        }),
    ).toThrow(AgentProxyError);
    expect(
      () =>
        new OpenCodeEventStreamClient({
          storage,
          reconnectBaseDelayMs: 10,
          reconnectMaxDelayMs: 5,
        }),
    ).toThrow(AgentProxyError);

    storage.close();
  });

  it("maps exhausted reconnect attempts to EVENT_STREAM_INTERRUPTED without leaking URL query secrets", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeEventServer({
      connections: [{ events: [] }, { events: [] }],
    });
    const registry = createRegistry(storage);
    registerHealthyRuntime({
      registry,
      runtimeId: "runtime_event_stream_exhausted",
      baseUrl: `${fakeOpenCode.baseUrl}?token=secret-token-value`,
      workspacePath,
    });
    const client = new OpenCodeEventStreamClient({
      registry,
      eventPath: "/event?token=secret-token-value",
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 1,
    });

    try {
      const iterator = client
        .streamRuntime({
          runtimeId: "runtime_event_stream_exhausted",
        })
        [Symbol.asyncIterator]();
      await iterator.next();
      throw new Error("Expected exhausted event stream reconnects to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      expect(error).toMatchObject({
        code: "EVENT_STREAM_INTERRUPTED",
        providerId: "opencode",
        operation: "opencode.eventStream.subscribe",
      });
      expect(JSON.stringify(error)).not.toContain("secret-token-value");
      if (error instanceof AgentProxyError) {
        expect(error.message).not.toContain("secret-token-value");
        expect(JSON.stringify(error.details)).not.toContain("secret-token-value");
        expect(error.details).toMatchObject({
          failureReason: "reconnect_exhausted",
          lastFailureReason: "stream_ended",
          eventPath: "/event",
        });
      }
    }

    expect(fakeOpenCode.requestPaths).toEqual(["/event", "/event"]);
    expect(storage.runtimes.get("runtime_event_stream_exhausted")).toMatchObject({
      status: "failed",
      metadata: {
        [OPENCODE_EVENT_STREAM_METADATA_KEY]: {
          failureReason: "reconnect_exhausted",
          interruptCount: 2,
          maxReconnectAttempts: 1,
        },
      },
    });

    storage.close();
  });
});
