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
