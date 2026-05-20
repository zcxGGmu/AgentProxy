import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../src/providers/index.js";

const servers: Server[] = [];
const hangingResponses: ServerResponse[] = [];

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

function providerContext(metadata: Record<string, unknown> = {}) {
  return {
    providerId: OPENCODE_PROVIDER_ID,
    metadata,
  };
}

afterEach(async () => {
  for (const response of hangingResponses.splice(0)) {
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

describe("OpenCodeProvider session listing", () => {
  it("maps OpenCode sessions and status into stable ProviderSession records", async () => {
    const workspacePath = "/tmp/agentproxy-workspace-a";
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/session") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify([
            {
              id: "ses_other",
              projectID: "proj_other",
              directory: "/tmp/agentproxy-workspace-b",
              title: "Other workspace",
              version: "1.16.0",
              time: {
                created: Date.parse("2026-05-20T19:19:00.000Z"),
                updated: Date.parse("2026-05-20T19:19:01.000Z"),
              },
              messages: [
                {
                  role: "user",
                  text: "do not copy transcript secret-token",
                },
              ],
            },
            {
              id: "ses_a",
              projectID: "proj_a",
              directory: workspacePath,
              parentID: "ses_parent",
              title: "Build the adapter",
              summary: "do not persist summary secret-token",
              model: {
                providerID: "anthropic",
                id: "claude-sonnet-4-5",
              },
              share: {
                url: "https://opencode.example/share/ses_a",
              },
              version: "1.16.0",
              time: {
                created: Date.parse("2026-05-20T19:20:00.000Z"),
                updated: Date.parse("2026-05-20T19:20:05.000Z"),
                compacting: Date.parse("2026-05-20T19:20:04.000Z"),
              },
              secret: "session-secret-token",
            },
          ]),
        );
        return;
      }

      if (request.method === "GET" && request.url === "/session/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ses_a: {
              type: "busy",
            },
            ses_other: {
              type: "idle",
            },
          }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    const sessions = await provider.listSessions(providerContext(), {
      workspacePath,
      metadata: {},
    });

    expect(sessions).toEqual([
      {
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_a",
        workspacePath,
        title: "Build the adapter",
        status: "running",
        createdAt: "2026-05-20T19:20:00.000Z",
        updatedAt: "2026-05-20T19:20:05.000Z",
        lastRunAt: "2026-05-20T19:20:05.000Z",
        model: "anthropic/claude-sonnet-4-5",
        parentProviderSessionId: "ses_parent",
        metadata: {
          opencode: {
            session: {
              projectId: "proj_a",
              directory: workspacePath,
              version: "1.16.0",
              model: {
                providerId: "anthropic",
                id: "claude-sonnet-4-5",
              },
              shared: true,
              compactingAt: "2026-05-20T19:20:04.000Z",
            },
            status: {
              type: "busy",
            },
          },
        },
      },
    ]);
    expect(JSON.stringify(sessions)).not.toContain("session-secret-token");
    expect(JSON.stringify(sessions)).not.toContain("transcript secret-token");
    expect(JSON.stringify(sessions)).not.toContain("do not persist summary");
    expect(JSON.parse(JSON.stringify(sessions))).toEqual(sessions);
  });

  it("sorts sessions by updatedAt descending and maps retry status to waiting", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify([
            {
              id: "ses_old",
              directory: "/repo",
              title: "Old",
              time: {
                created: Date.parse("2026-05-20T19:19:00.000Z"),
                updated: Date.parse("2026-05-20T19:19:01.000Z"),
              },
            },
            {
              id: "ses_new",
              directory: "/repo",
              title: "New",
              time: {
                created: Date.parse("2026-05-20T19:19:00.000Z"),
                updated: Date.parse("2026-05-20T19:19:10.000Z"),
              },
            },
          ]),
        );
        return;
      }

      if (request.method === "GET" && request.url === "/session/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ses_old: {
              type: "retry",
            },
            ses_new: {
              type: "idle",
            },
          }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    const sessions = await provider.listSessions(providerContext());

    expect(sessions.map((session) => session.providerSessionId)).toEqual(["ses_new", "ses_old"]);
    expect(sessions.map((session) => session.status)).toEqual(["idle", "waiting"]);
  });

  it("maps missing runtime and authentication failures to stable errors without leaking raw data", async () => {
    const missingRuntimeProvider = new OpenCodeProvider({ requestTimeoutMs: 250 });

    await expect(missingRuntimeProvider.listSessions(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.listSessions",
    });

    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "token secret-token expired" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl: `${baseUrl}?token=secret-token`,
      requestTimeoutMs: 250,
    });

    let error: unknown;
    try {
      await provider.listSessions(providerContext());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AgentProxyError);
    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      operation: "opencode.provider.listSessions",
    });
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });

  it("maps malformed or hanging session responses to provider-unavailable errors", async () => {
    const malformed = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "not-an-array" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const malformedProvider = new OpenCodeProvider({
      baseUrl: malformed.baseUrl,
      requestTimeoutMs: 250,
    });

    await expect(malformedProvider.listSessions(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.listSessions",
    });

    const hanging = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        hangingResponses.push(response);
        response.writeHead(200, { "content-type": "application/json" });
        response.write("[");
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const hangingProvider = new OpenCodeProvider({
      baseUrl: hanging.baseUrl,
      requestTimeoutMs: 50,
    });

    await expect(hangingProvider.listSessions(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.listSessions",
    });
  });
});

describe("OpenCodeProvider session creation and resume", () => {
  it("creates an OpenCode session and sends an optional async prompt without persisting prompt text", async () => {
    const workspacePath = "/tmp/agentproxy-create-workspace";
    let promptBody: unknown;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/session") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          expect(JSON.parse(body)).toEqual({});
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              id: "ses_created",
              projectID: "proj_created",
              directory: workspacePath,
              title: "Created session",
              version: "1.16.0",
              time: {
                created: Date.parse("2026-05-20T20:00:00.000Z"),
                updated: Date.parse("2026-05-20T20:00:01.000Z"),
              },
            }),
          );
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_created/prompt_async") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          promptBody = JSON.parse(body);
          response.writeHead(204);
          response.end();
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

    const session = await provider.startSession({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath,
      prompt: "implement the adapter with secret-token",
      model: "anthropic/claude-sonnet-4-5",
      metadata: {},
    });

    expect(promptBody).toEqual({
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4-5",
      },
      parts: [
        {
          type: "text",
          text: "implement the adapter with secret-token",
        },
      ],
    });
    expect(session).toEqual({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_created",
      workspacePath,
      title: "Created session",
      status: "running",
      createdAt: "2026-05-20T20:00:00.000Z",
      updatedAt: "2026-05-20T20:00:01.000Z",
      lastRunAt: "2026-05-20T20:00:01.000Z",
      metadata: {
        opencode: {
          session: {
            projectId: "proj_created",
            directory: workspacePath,
            version: "1.16.0",
          },
          promptAsync: {
            accepted: true,
            requestedModel: "anthropic/claude-sonnet-4-5",
          },
        },
      },
    });
    expect(JSON.stringify(session)).not.toContain("secret-token");
  });

  it("returns the created session with rejected prompt metadata when initial async prompt fails", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/session") {
        let body = "";
        request.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        request.on("end", () => {
          expect(JSON.parse(body)).toEqual({});
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              id: "ses_created_orphan_guard",
              directory: "/tmp/agentproxy-workspace",
              title: "Created before prompt failure",
              version: "1.16.0",
              time: {
                created: Date.parse("2026-05-20T20:00:00.000Z"),
                updated: Date.parse("2026-05-20T20:00:01.000Z"),
              },
            }),
          );
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/session/ses_created_orphan_guard/prompt_async"
      ) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "prompt failed secret-token" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    const session = await provider.startSession({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: "/tmp/agentproxy-workspace",
      prompt: "keep session mapping despite this prompt secret-token",
      metadata: {},
    });

    expect(session).toMatchObject({
      providerSessionId: "ses_created_orphan_guard",
      title: "Created before prompt failure",
      metadata: {
        opencode: {
          promptAsync: {
            accepted: false,
            failureReason: "prompt_async_failed",
            status: 500,
          },
        },
      },
    });
    expect(JSON.stringify(session)).not.toContain("secret-token");
  });

  it("gets and resumes an existing OpenCode session without creating a second provider session", async () => {
    const workspacePath = "/tmp/agentproxy-resume-workspace";
    let createCalls = 0;
    let promptCalls = 0;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/session") {
        createCalls += 1;
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "resume must not create" }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/session/ses_existing") {
        expect(url.searchParams.get("directory")).toBe(workspacePath);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "ses_existing",
            projectID: "proj_existing",
            directory: workspacePath,
            title: "Existing session",
            version: "1.16.0",
            time: {
              created: Date.parse("2026-05-20T19:00:00.000Z"),
              updated: Date.parse("2026-05-20T19:30:00.000Z"),
            },
          }),
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/session/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ses_existing: {
              type: "idle",
            },
          }),
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/session/ses_existing/prompt_async") {
        promptCalls += 1;
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    await expect(
      provider.getSession(
        {
          providerId: OPENCODE_PROVIDER_ID,
          workspacePath,
          metadata: {},
        },
        "ses_existing",
      ),
    ).resolves.toMatchObject({
      providerSessionId: "ses_existing",
      status: "idle",
    });

    const resumed = await provider.resumeSession({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_existing",
      workspacePath,
      prompt: "continue",
      metadata: {},
    });

    expect(createCalls).toBe(0);
    expect(promptCalls).toBe(1);
    expect(resumed).toMatchObject({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_existing",
      workspacePath,
      title: "Existing session",
      status: "running",
    });
    expect(JSON.stringify(resumed)).not.toContain("continue");
  });

  it("maps create and resume failures to stable sanitized errors", async () => {
    const missingRuntimeProvider = new OpenCodeProvider({ requestTimeoutMs: 250 });

    await expect(
      missingRuntimeProvider.startSession({
        providerId: OPENCODE_PROVIDER_ID,
        workspacePath: "/tmp/agentproxy-workspace",
        metadata: {},
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.startSession",
    });

    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session/ses_missing") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "missing secret-token" }));
        return;
      }

      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "auth secret-token" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl: `${baseUrl}?token=secret-token`,
      requestTimeoutMs: 250,
    });

    let notFoundError: unknown;
    try {
      await provider.resumeSession({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_missing",
        metadata: {},
      });
    } catch (caught) {
      notFoundError = caught;
    }

    expect(notFoundError).toBeInstanceOf(AgentProxyError);
    expect(notFoundError).toMatchObject({
      code: "SESSION_NOT_FOUND",
      operation: "opencode.provider.resumeSession",
    });
    expect(JSON.stringify(notFoundError)).not.toContain("secret-token");

    let authError: unknown;
    try {
      await provider.startSession({
        providerId: OPENCODE_PROVIDER_ID,
        workspacePath: "/tmp/agentproxy-workspace",
        metadata: {},
      });
    } catch (caught) {
      authError = caught;
    }

    expect(authError).toBeInstanceOf(AgentProxyError);
    expect(authError).toMatchObject({
      code: "PERMISSION_DENIED",
      operation: "opencode.provider.startSession",
    });
    expect(JSON.stringify(authError)).not.toContain("secret-token");
  });

  it("rejects mismatched session ids during resume before dispatching a prompt", async () => {
    let promptCalls = 0;
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/session/ses_requested") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "ses_wrong_secret-token",
            directory: "/tmp/agentproxy-workspace",
            title: "Wrong session",
            version: "1.16.0",
            time: {
              created: Date.parse("2026-05-20T19:00:00.000Z"),
              updated: Date.parse("2026-05-20T19:30:00.000Z"),
            },
          }),
        );
        return;
      }

      if (request.method === "POST" && request.url?.includes("/prompt_async") === true) {
        promptCalls += 1;
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    let error: unknown;
    try {
      await provider.resumeSession({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_requested",
        prompt: "do not send this prompt secret-token",
        metadata: {},
      });
    } catch (caught) {
      error = caught;
    }

    expect(promptCalls).toBe(0);
    expect(error).toBeInstanceOf(AgentProxyError);
    expect(error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.resumeSession",
      details: {
        failureReason: "session_id_mismatch",
        providerSessionId: "ses_requested",
      },
    });
    expect(JSON.stringify(error)).not.toContain("ses_wrong_secret-token");
    expect(JSON.stringify(error)).not.toContain("do not send this prompt");
  });
});
