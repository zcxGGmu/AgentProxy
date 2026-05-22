import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError, type AgentEvent } from "../src/core/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../src/providers/index.js";

const servers: Server[] = [];
const openSseResponses: ServerResponse[] = [];

async function startFakeOpenCodeServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: string }> {
  const server = createServer(handler);
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
    throw new Error("Expected fake OpenCode server to listen on a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
  }

  return body === "" ? undefined : JSON.parse(body);
}

function writeSse(response: ServerResponse, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

interface Deferred<TValue> {
  promise: Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolve!: (value: TValue) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

async function waitForValue<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<TValue> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<TValue>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

afterEach(async () => {
  for (const response of openSseResponses.splice(0)) {
    response.end();
  }

  for (const server of servers) {
    server.closeAllConnections();
  }

  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );
});

describe("OpenCodeProvider message sending", () => {
  it("posts the message when OpenCode delays event stream headers until an event exists", async () => {
    const eventRequestObserved = createDeferred<ServerResponse>();
    let messageBody: unknown;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/event") {
        openSseResponses.push(response);
        eventRequestObserved.resolve(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_delayed_event/message") {
        void (async () => {
          const body = await readRequestJson(request);
          messageBody = body;
          const eventResponse = await waitForValue(
            eventRequestObserved.promise,
            500,
            "event request was not observed before message POST handling.",
          );
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ info: { id: "msg_delayed" }, parts: [] }));

          eventResponse.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
          });
          eventResponse.write(": connected\n\n");
          writeSse(eventResponse, {
            id: "evt_delayed_delta",
            type: "message.part.delta",
            properties: {
              sessionID: "ses_delayed_event",
              messageID: "msg_delayed",
              partID: "prt_delayed",
              field: "text",
              delta: "delayed headers",
            },
          });
          writeSse(eventResponse, {
            id: "evt_delayed_idle",
            type: "session.idle",
            properties: {
              sessionID: "ses_delayed_event",
            },
          });
        })().catch((error: unknown) => {
          if (!response.headersSent) {
            response.writeHead(500, { "content-type": "application/json" });
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "test failure",
              }),
            );
          }
        });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 1_000,
    });

    const events = await collectEvents(
      provider.sendMessage({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_delayed_event",
        prompt: "trigger delayed event stream",
        metadata: {},
      }),
    );

    expect(messageBody).toEqual({
      parts: [
        {
          type: "text",
          text: "trigger delayed event stream",
        },
      ],
    });
    expect(events.map((event) => event.type)).toEqual([
      "session.status_changed",
      "message.delta",
      "session.status_changed",
      "session.completed",
    ]);
    expect(events.find((event) => event.type === "message.delta")).toMatchObject({
      role: "assistant",
      delta: "delayed headers",
      messageId: "msg_delayed",
    });
  });

  it("prioritizes delayed event stream failure over a hanging message post", async () => {
    let messageCalls = 0;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/event") {
        setTimeout(() => {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "event failed secret-token" }));
        }, 150);
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_event_failed/message") {
        messageCalls += 1;
        request.resume();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 2_000,
    });
    const startedAt = Date.now();

    await expect(
      collectEvents(
        provider.sendMessage({
          providerId: OPENCODE_PROVIDER_ID,
          providerSessionId: "ses_event_failed",
          prompt: "trigger event failure",
          metadata: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.sendMessage",
      details: {
        failureReason: "unhealthy_response",
        status: 500,
      },
    });

    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(messageCalls).toBe(1);
  });

  it("surfaces delayed event stream failure after a successful message post", async () => {
    let messageBody: unknown;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/event") {
        setTimeout(() => {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "event failed secret-token" }));
        }, 150);
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_event_failed_fast/message") {
        void readRequestJson(request).then((body) => {
          messageBody = body;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ info: { id: "msg_event_failed" }, parts: [] }));
        });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 2_000,
    });

    await expect(
      collectEvents(
        provider.sendMessage({
          providerId: OPENCODE_PROVIDER_ID,
          providerSessionId: "ses_event_failed_fast",
          prompt: "trigger delayed event failure",
          metadata: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.sendMessage",
      details: {
        failureReason: "unhealthy_response",
        status: 500,
      },
    });
    expect(messageBody).toEqual({
      parts: [
        {
          type: "text",
          text: "trigger delayed event failure",
        },
      ],
    });
  });

  it("sends a prompt and maps OpenCode message events without auto-approving permissions", async () => {
    const workspacePath = "/tmp/agentproxy-message-workspace";
    let eventResponse: ServerResponse | undefined;
    let messageBody: unknown;
    let permissionResponseCalls = 0;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/event") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        response.write(": connected\n\n");
        eventResponse = response;
        openSseResponses.push(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_message/message") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        void readRequestJson(request).then((body) => {
          messageBody = body;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              info: {
                id: "msg_reply",
              },
              parts: [],
            }),
          );

          if (eventResponse === undefined) {
            throw new Error("Expected the event stream to be connected before prompt dispatch.");
          }
          writeSse(eventResponse, {
            id: "evt_delta",
            type: "message.part.delta",
            properties: {
              sessionID: "ses_message",
              messageID: "msg_reply",
              partID: "prt_text",
              field: "text",
              delta: "hello",
            },
          });
          writeSse(eventResponse, {
            type: "sync",
            name: "session.next.tool.called.1",
            id: "evt_tool_started",
            data: {
              sessionID: "ses_message",
              callID: "call_1",
              tool: "bash",
              input: {
                command: "echo secret-token",
              },
              provider: {
                executed: true,
              },
            },
          });
          writeSse(eventResponse, {
            type: "sync",
            name: "session.next.tool.success.1",
            id: "evt_tool_finished",
            data: {
              sessionID: "ses_message",
              callID: "call_1",
              structured: {
                output: "secret-token",
              },
              content: [],
              provider: {
                executed: true,
              },
            },
          });
          writeSse(eventResponse, {
            id: "evt_permission",
            type: "permission.asked",
            properties: {
              id: "per_1",
              sessionID: "ses_message",
              permission: "bash",
              patterns: [],
              metadata: {},
              always: [],
            },
          });
          writeSse(eventResponse, {
            id: "evt_permission_replied",
            type: "permission.replied",
            properties: {
              sessionID: "ses_message",
              requestID: "per_1",
              reply: "reject",
            },
          });
          writeSse(eventResponse, {
            id: "evt_file",
            type: "file.edited",
            properties: {
              sessionID: "ses_message",
              file: "/tmp/agentproxy-message-workspace/src/index.ts",
            },
          });
          writeSse(eventResponse, {
            id: "evt_diff",
            type: "session.diff",
            properties: {
              sessionID: "ses_message",
              diff: [
                {
                  path: "src/index.ts",
                  added: 1,
                },
              ],
            },
          });
          writeSse(eventResponse, {
            id: "evt_unknown",
            type: "session.experimental",
            properties: {
              sessionID: "ses_message",
              value: "kept-live-only",
            },
          });
          writeSse(eventResponse, {
            id: "evt_idle",
            type: "session.idle",
            properties: {
              sessionID: "ses_message",
            },
          });
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_message/permissions/per_1") {
        permissionResponseCalls += 1;
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "must not approve automatically" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    const events = await collectEvents(
      provider.sendMessage({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_message",
        agentproxySessionId: "apx_message",
        workspacePath,
        prompt: "run the test with secret-token",
        model: "anthropic/claude-sonnet-4-5",
        metadata: {},
      }),
    );

    expect(messageBody).toEqual({
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4-5",
      },
      parts: [
        {
          type: "text",
          text: "run the test with secret-token",
        },
      ],
    });
    expect(events.map((event) => event.type)).toEqual([
      "session.status_changed",
      "message.delta",
      "tool.started",
      "tool.finished",
      "permission.requested",
      "permission.resolved",
      "file.changed",
      "diff.updated",
      "provider.raw_event",
      "session.status_changed",
      "session.completed",
    ]);
    expect(events.find((event) => event.type === "message.delta")).toMatchObject({
      role: "assistant",
      delta: "hello",
      messageId: "msg_reply",
    });
    expect(events.find((event) => event.type === "tool.started")).toMatchObject({
      toolCallId: "call_1",
      toolName: "bash",
    });
    expect(events.find((event) => event.type === "tool.finished")).toMatchObject({
      toolCallId: "call_1",
      toolName: "unknown",
    });
    expect(events.find((event) => event.type === "permission.requested")).toMatchObject({
      permissionId: "per_1",
      action: "bash",
    });
    expect(events.find((event) => event.type === "permission.resolved")).toMatchObject({
      permissionId: "per_1",
      decision: "denied",
    });
    expect(events.find((event) => event.type === "file.changed")).toMatchObject({
      path: "/tmp/agentproxy-message-workspace/src/index.ts",
      change: "updated",
    });
    expect(events.find((event) => event.type === "diff.updated")).toMatchObject({
      diff: '[{"path":"src/index.ts","added":1}]',
    });
    expect(events.at(-1)).toMatchObject({
      type: "session.completed",
      status: "completed",
    });
    expect(permissionResponseCalls).toBe(0);
    expect(JSON.stringify(events)).not.toContain("echo secret-token");
    expect(JSON.stringify(events)).not.toContain('"output":"secret-token"');
  });

  it("maps send failures to stable sanitized errors", async () => {
    const missingRuntimeProvider = new OpenCodeProvider({ requestTimeoutMs: 250 });
    await expect(
      collectEvents(
        missingRuntimeProvider.sendMessage({
          providerId: OPENCODE_PROVIDER_ID,
          providerSessionId: "ses_missing_runtime",
          prompt: "hello",
          metadata: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.sendMessage",
    });

    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/event") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(": connected\n\n");
        openSseResponses.push(response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/session/ses_denied/message") {
        request.resume();
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "auth secret-token" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "missing secret-token" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl: `${baseUrl}?token=secret-token`,
      requestTimeoutMs: 250,
    });

    let error: unknown;
    try {
      await collectEvents(
        provider.sendMessage({
          providerId: OPENCODE_PROVIDER_ID,
          providerSessionId: "ses_denied",
          prompt: "do not leak this prompt secret-token",
          metadata: {},
        }),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AgentProxyError);
    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      operation: "opencode.provider.sendMessage",
    });
    expect(JSON.stringify(error)).not.toContain("secret-token");
    expect(JSON.stringify(error)).not.toContain("do not leak this prompt");
  });

  it("does not treat step-ended as terminal and drops sessionless raw events from strict message streams", async () => {
    let eventResponse: ServerResponse | undefined;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/event") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(": connected\n\n");
        eventResponse = response;
        openSseResponses.push(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_step/message") {
        request.resume();
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ info: { id: "msg_step" }, parts: [] }));

        if (eventResponse === undefined) {
          throw new Error("Expected the event stream to be connected.");
        }
        writeSse(eventResponse, {
          type: "sync",
          name: "session.next.step.ended.1",
          id: "evt_step_ended",
          data: {
            sessionID: "ses_step",
            finish: "stop",
          },
        });
        writeSse(eventResponse, {
          id: "evt_sessionless_secret",
          type: "session.experimental",
          properties: {
            value: "raw secret-token must not surface",
          },
        });
        writeSse(eventResponse, {
          id: "evt_after_step",
          type: "message.part.delta",
          properties: {
            sessionID: "ses_step",
            messageID: "msg_step",
            partID: "prt_after_step",
            field: "text",
            delta: "after-step",
          },
        });
        writeSse(eventResponse, {
          id: "evt_idle_step",
          type: "session.idle",
          properties: {
            sessionID: "ses_step",
          },
        });
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    const events = await collectEvents(
      provider.sendMessage({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_step",
        prompt: "continue after step",
        metadata: {},
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "session.status_changed",
      "provider.raw_event",
      "message.delta",
      "session.status_changed",
      "session.completed",
    ]);
    expect(events.find((event) => event.type === "message.delta")).toMatchObject({
      delta: "after-step",
    });
    expect(JSON.stringify(events)).not.toContain("raw secret-token");
    expect(JSON.stringify(events)).not.toContain("evt_sessionless_secret");
  });

  it("normalizes pre-aborted message streams to sendMessage errors", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((_request, response) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "should not be reached" }));
    });
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    await expect(
      collectEvents(
        provider.sendMessage({
          providerId: OPENCODE_PROVIDER_ID,
          providerSessionId: "ses_aborted",
          prompt: "hello",
          signal: controller.signal,
          metadata: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.sendMessage",
      details: {
        failureReason: "aborted",
      },
    });
  });
});
