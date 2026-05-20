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

describe("OpenCodeProvider model listing", () => {
  it("maps OpenCode provider models to ModelRef records with sanitized metadata", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/provider") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            all: [
              {
                id: "anthropic",
                name: "Anthropic",
                api: "anthropic",
                env: ["ANTHROPIC_API_KEY"],
                npm: "@ai-sdk/anthropic",
                models: {
                  "claude-sonnet-4-5": {
                    id: "claude-sonnet-4-5",
                    name: "Claude Sonnet 4.5",
                    release_date: "2026-02-03",
                    attachment: true,
                    reasoning: true,
                    temperature: true,
                    tool_call: true,
                    cost: {
                      input: 3,
                      output: 15,
                    },
                    limit: {
                      context: 200_000,
                      output: 8_192,
                      ignored_secret: {
                        apiKey: "limit-secret-token",
                      },
                    },
                    modalities: {
                      input: ["text", "image", "pdf"],
                      output: ["text"],
                    },
                    experimental: false,
                    status: "active",
                    options: {
                      apiKey: "model-secret-token",
                      baseURL: "https://api.example.test?token=model-secret-token",
                    },
                    headers: {
                      authorization: "Bearer model-secret-token",
                    },
                    provider: {
                      npm: "@ai-sdk/anthropic",
                    },
                  },
                },
              },
            ],
            default: {
              anthropic: "claude-sonnet-4-5",
            },
            connected: ["anthropic"],
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

    const models = await provider.listModels(providerContext());

    expect(models).toEqual([
      {
        id: "anthropic/claude-sonnet-4-5",
        providerId: OPENCODE_PROVIDER_ID,
        displayName: "Claude Sonnet 4.5",
        family: "Anthropic",
        contextWindowTokens: 200_000,
        metadata: {
          opencode: {
            provider: {
              id: "anthropic",
              name: "Anthropic",
              api: "anthropic",
              npm: "@ai-sdk/anthropic",
              connected: true,
              requiredEnv: ["ANTHROPIC_API_KEY"],
            },
            model: {
              key: "claude-sonnet-4-5",
              id: "claude-sonnet-4-5",
              releaseDate: "2026-02-03",
              status: "active",
              experimental: false,
              isDefaultForProvider: true,
              capabilities: {
                attachment: true,
                reasoning: true,
                temperature: true,
                toolCall: true,
              },
              cost: {
                input: 3,
                output: 15,
              },
              limit: {
                context: 200_000,
                output: 8_192,
              },
              modalities: {
                input: ["text", "image", "pdf"],
                output: ["text"],
              },
              provider: {
                npm: "@ai-sdk/anthropic",
              },
            },
          },
        },
      },
    ]);
    expect(JSON.stringify(models)).not.toContain("model-secret-token");
    expect(JSON.stringify(models)).not.toContain("limit-secret-token");
    expect(JSON.stringify(models)).not.toContain("authorization");
    expect(JSON.stringify(models)).not.toContain("options");
    expect(JSON.stringify(models)).not.toContain("headers");
    expect(JSON.parse(JSON.stringify(models))).toEqual(models);
  });

  it("uses runtime base URL from provider context metadata and returns empty lists", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/provider") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            all: [
              {
                id: "anthropic",
                name: "Anthropic",
                api: "anthropic",
                env: ["ANTHROPIC_API_KEY"],
                models: {},
              },
            ],
            default: {},
            connected: [],
          }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      requestTimeoutMs: 250,
    });

    const models = await provider.listModels(providerContext({ runtimeBaseUrl: baseUrl }));

    expect(models).toEqual([]);
  });

  it("maps missing runtime base URL to an actionable provider unavailable error", async () => {
    const provider = new OpenCodeProvider({
      requestTimeoutMs: 250,
    });

    await expect(provider.listModels(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.provider.listModels",
      details: {
        failureReason: "missing_base_url",
        suggestion: expect.stringContaining("Start or attach"),
      },
    });
  });

  it("rejects runtime base URLs with credentials without leaking them", async () => {
    const provider = new OpenCodeProvider({
      baseUrl: "http://user:secret-password@127.0.0.1:12345?token=secret-token",
      requestTimeoutMs: 250,
    });

    await expect(provider.listModels(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      details: {
        failureReason: "credentials_not_allowed",
      },
    });

    try {
      await provider.listModels(providerContext());
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("secret-password");
      expect(JSON.stringify(error)).not.toContain("secret-token");
    }
  });

  it("maps unauthenticated provider-list responses to stable diagnostics", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/provider") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "token secret-from-body is missing" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    await expect(provider.listModels(providerContext())).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.provider.listModels",
      details: {
        failureReason: "authentication_required",
        status: 401,
        suggestion: expect.stringContaining("Authenticate"),
      },
    });

    try {
      await provider.listModels(providerContext());
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      expect(JSON.stringify(error)).not.toContain("secret-from-body");
    }
  });

  it("maps malformed provider-list responses without leaking raw payloads", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/provider") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ secretPayload: "provider-secret-token" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 250,
    });

    await expect(provider.listModels(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      details: {
        failureReason: "unexpected_provider_response",
      },
    });

    try {
      await provider.listModels(providerContext());
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      expect(JSON.stringify(error)).not.toContain("provider-secret-token");
      expect(JSON.stringify(error)).not.toContain("secretPayload");
    }
  });

  it("times out hanging provider-list bodies", async () => {
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "GET" && request.url === "/provider") {
        response.writeHead(200, { "content-type": "application/json" });
        response.write('{"all":');
        hangingResponses.push(response);
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl,
      requestTimeoutMs: 50,
    });

    await expect(provider.listModels(providerContext())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      details: {
        failureReason: "request_failed",
      },
    });
  });
});
