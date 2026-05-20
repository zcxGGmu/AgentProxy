import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../src/providers/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const eventResponses: ServerResponse[] = [];
const healthResponses: ServerResponse[] = [];

async function createTestRoot(): Promise<{
  root: string;
  workspacePath: string;
  binaryPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-provider-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const binaryDirectory = path.join(root, "bin");
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(binaryDirectory, { recursive: true }),
  ]);

  return {
    root,
    workspacePath,
    binaryPath: await writeVersionOnlyOpenCodeBinary(binaryDirectory),
  };
}

async function writeVersionOnlyOpenCodeBinary(directory: string): Promise<string> {
  const binaryPath = path.join(directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
if (process.argv[2] === "--version") {
  console.log("OpenCode 1.15.5");
  process.exit(0);
}

console.error("provider health test binary only supports --version");
process.exit(64);
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function startFakeOpenCodeServer(): Promise<{ baseUrl: string }> {
  return startFakeOpenCodeServerWithHandler((request, response) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";

    if (method === "GET" && url === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
      return;
    }

    if (method === "GET" && url === "/doc") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>OpenAPI 3.1</html>");
      return;
    }

    if (method === "GET" && url === "/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      });
      response.write('data: {"type":"server.connected"}\\n\\n');
      eventResponses.push(response);
      return;
    }

    if (method === "GET" && url === "/session") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }

    if (method === "GET" && url === "/session/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    if (
      method === "GET" &&
      ["/provider", "/command", "/mcp", "/lsp", "/formatter", "/agent"].includes(url)
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    if (method === "OPTIONS") {
      const allow = allowHeaderForProbePath(url);
      if (allow !== undefined) {
        response.writeHead(204, { allow });
        response.end();
        return;
      }
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });
}

async function startFakeOpenCodeServerWithHandler(
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

function allowHeaderForProbePath(url: string): string | undefined {
  switch (url) {
    case "/session":
      return "GET, POST";
    case "/session/__agentproxy_probe__":
      return "GET, PATCH, DELETE";
    case "/session/__agentproxy_probe__/fork":
      return "POST";
    case "/session/__agentproxy_probe__/share":
      return "POST, DELETE";
    case "/session/__agentproxy_probe__/diff":
      return "GET";
    case "/session/__agentproxy_probe__/todo":
      return "GET";
    case "/session/__agentproxy_probe__/revert":
      return "POST";
    case "/session/__agentproxy_probe__/message":
      return "GET, POST";
    case "/session/__agentproxy_probe__/permissions/__permission_probe__":
      return "POST";
    case "/tui/append-prompt":
      return "POST";
    default:
      return undefined;
  }
}

function providerContext(workspacePath?: string) {
  return {
    providerId: OPENCODE_PROVIDER_ID,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    metadata: {},
  };
}

afterEach(async () => {
  for (const response of eventResponses.splice(0)) {
    response.end();
  }
  for (const response of healthResponses.splice(0)) {
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

  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCodeProvider health and capability probing", () => {
  it("reports healthy runtime-backed capabilities for a supported OpenCode server", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServer();
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: true,
        version: "0.0.0-test",
      }),
    });

    const [health, capabilities] = await Promise.all([
      provider.healthCheck(providerContext(workspacePath)),
      provider.getCapabilities(providerContext(workspacePath)),
    ]);

    expect(health.status).toBe("healthy");
    expect(health.providerVersion).toBe("1.16.0");
    expect(health.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      binary: {
        available: true,
        version: "1.15.5",
      },
      runtime: {
        available: true,
        baseUrl,
        version: "1.16.0",
      },
      sdk: {
        available: true,
        version: "0.0.0-test",
      },
    });

    expect(capabilities.providerVersion).toBe("1.16.0");
    expect(capabilities.runtime).toMatchObject({
      serve: true,
      attach: true,
      managedLifecycle: true,
      openApi: true,
      sse: true,
      sdk: true,
    });
    expect(capabilities.sessions).toMatchObject({
      list: false,
      create: false,
      resume: false,
      fork: false,
      delete: false,
      share: false,
      diff: false,
      revert: false,
      todo: false,
    });
    expect(capabilities.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        endpoints: {
          sessionList: {
            supported: true,
          },
          sessionCreate: {
            supported: true,
          },
          messageSend: {
            supported: true,
          },
          tuiPromptPrefill: {
            supported: true,
          },
        },
      },
    });
    expect(capabilities.interaction).toMatchObject({
      nativeTui: false,
      headlessRun: false,
      promptPrefill: false,
      slashCommands: false,
      permissions: false,
    });
    expect(capabilities.ecosystem).toMatchObject({
      mcp: true,
      lsp: true,
      formatters: true,
      customAgents: true,
      customCommands: true,
    });
  });

  it("does not advertise unimplemented AgentProvider operations as top-level capabilities", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServer();
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: true,
      }),
    });

    const capabilities = await provider.getCapabilities(providerContext(workspacePath));

    expect(capabilities.sessions).toMatchObject({
      list: false,
      create: false,
      resume: false,
      fork: false,
      delete: false,
      share: false,
      diff: false,
      revert: false,
      todo: false,
    });
    expect(capabilities.interaction).toMatchObject({
      nativeTui: false,
      headlessRun: false,
      promptPrefill: false,
      slashCommands: false,
      permissions: false,
    });
    expect(capabilities.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        endpoints: {
          sessionCreate: {
            supported: true,
          },
          sessionDelete: {
            supported: true,
          },
          sessionShare: {
            supported: true,
          },
          tuiPromptPrefill: {
            supported: true,
          },
        },
      },
    });
  });

  it("degrades when the binary is supported but no runtime base URL is available", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const [health, capabilities] = await Promise.all([
      provider.healthCheck(providerContext(workspacePath)),
      provider.getCapabilities(providerContext(workspacePath)),
    ]);

    expect(health.status).toBe("degraded");
    expect(health.providerVersion).toBe("1.15.5");
    expect(health.message).toContain("No OpenCode runtime base URL");
    expect(capabilities.runtime.serve).toBe(true);
    expect(capabilities.runtime.managedLifecycle).toBe(true);
    expect(capabilities.runtime.openApi).toBe(false);
    expect(capabilities.runtime.sse).toBe(false);
    expect(capabilities.runtime.sdk).toBe(false);
    expect(capabilities.interaction.headlessRun).toBe(false);
    expect(capabilities.sessions.list).toBe(false);
  });

  it("returns unhealthy health and disabled capabilities when OpenCode is unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-provider-missing-test-"));
    tempRoots.push(root);
    const provider = new OpenCodeProvider({
      binary: path.join(root, "missing-opencode"),
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const [health, capabilities] = await Promise.all([
      provider.healthCheck(providerContext(root)),
      provider.getCapabilities(providerContext(root)),
    ]);

    expect(health.status).toBe("unhealthy");
    expect(health.message).toContain("OpenCode binary is unavailable");
    expect(health.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      binary: {
        available: false,
        errorCode: "PROVIDER_UNAVAILABLE",
      },
      runtime: {
        available: false,
      },
    });
    expect(capabilities.providerVersion).toBeUndefined();
    expect(capabilities.runtime.serve).toBe(false);
    expect(capabilities.runtime.managedLifecycle).toBe(false);
    expect(capabilities.runtime.openApi).toBe(false);
    expect(capabilities.sessions.list).toBe(false);
  });

  it("sanitizes runtime URLs before returning provider probe metadata", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServer();
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl: `${baseUrl}?token=secret-token`,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const health = await provider.healthCheck(providerContext(workspacePath));
    const metadata = JSON.stringify(health.metadata);

    expect(health.status).toBe("healthy");
    expect(metadata).toContain(baseUrl);
    expect(metadata).not.toContain("secret-token");
    expect(metadata).not.toContain("?token=");
  });

  it("times out hanging health bodies instead of hanging provider probing", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServerWithHandler((request, response) => {
      if (request.url === "/global/health") {
        healthResponses.push(response);
        response.writeHead(200, { "content-type": "application/json" });
        response.write('{"healthy":');
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 50,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const health = await provider.healthCheck(providerContext(workspacePath));

    expect(health.status).toBe("degraded");
    expect(health.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        available: false,
        failureReason: "request_failed",
      },
    });
  });

  it("does not infer OpenAPI or mutating session capabilities from health alone", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServerWithHandler((request, response) => {
      if (request.url === "/global/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
        return;
      }

      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }

      if (request.method === "OPTIONS") {
        response.writeHead(204, { "content-type": "application/json" });
        response.end();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const capabilities = await provider.getCapabilities(providerContext(workspacePath));

    expect(capabilities.runtime.openApi).toBe(false);
    expect(capabilities.runtime.sse).toBe(false);
    expect(capabilities.sessions.list).toBe(false);
    expect(capabilities.sessions.create).toBe(false);
    expect(capabilities.sessions.delete).toBe(false);
    expect(capabilities.interaction.promptPrefill).toBe(false);
    expect(capabilities.interaction.headlessRun).toBe(false);
    expect(capabilities.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        endpoints: {
          sessionList: {
            supported: true,
          },
          sessionCreate: {
            supported: false,
            failureReason: "missing_allow_header",
          },
        },
      },
    });
  });

  it("normalizes provider-controlled headers before returning metadata", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServerWithHandler((request, response) => {
      if (request.url === "/global/health") {
        response.writeHead(200, { "content-type": "application/json; token=secret-header" });
        response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
        return;
      }

      if (request.method === "OPTIONS" && request.url === "/session") {
        response.writeHead(204, { allow: "GET, POST, X-Secret-secret-header" });
        response.end();
        return;
      }

      if (request.url === "/event") {
        response.writeHead(200, {
          "content-type": "text/event-stream; token=secret-header",
          "cache-control": "no-cache",
        });
        response.write('data: {"type":"server.connected"}\\n\\n');
        eventResponses.push(response);
        return;
      }

      response.writeHead(404, { "content-type": "application/json; token=secret-header" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const health = await provider.healthCheck(providerContext(workspacePath));
    const metadata = JSON.stringify(health.metadata);

    expect(health.status).toBe("healthy");
    expect(health.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        health: {
          mediaType: "application/json",
        },
        endpoints: {
          sessionCreate: {
            allowMethods: ["GET", "POST"],
          },
          eventStream: {
            mediaType: "text/event-stream",
          },
        },
      },
    });
    expect(metadata).not.toContain("secret-header");
    expect(metadata).not.toContain("X-Secret");
    expect(metadata).not.toContain("token=");
  });

  it("does not leak raw health payloads or infer message support without Allow", async () => {
    const { binaryPath, workspacePath } = await createTestRoot();
    const { baseUrl } = await startFakeOpenCodeServerWithHandler((request, response) => {
      if (request.url === "/global/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            healthy: true,
            version: "1.16.0",
            secretPayload: "payload-secret-token",
          }),
        );
        return;
      }

      if (request.method === "OPTIONS" && request.url === "/session/__agentproxy_probe__/message") {
        response.writeHead(204, { allow: "GET" });
        response.end();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      baseUrl,
      requestTimeoutMs: 250,
      sdkResolver: () => ({
        moduleName: "@opencode-ai/sdk",
        available: false,
      }),
    });

    const health = await provider.healthCheck(providerContext(workspacePath));
    const metadata = JSON.stringify(health.metadata);

    expect(health.status).toBe("healthy");
    expect(health.metadata.agentproxyOpenCodeProviderProbe).toMatchObject({
      runtime: {
        endpoints: {
          messageSend: {
            supported: false,
            allowMethods: ["GET"],
          },
        },
      },
    });
    expect(metadata).not.toContain("payload-secret-token");
    expect(metadata).not.toContain("secretPayload");
  });
});
