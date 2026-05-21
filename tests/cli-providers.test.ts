import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { createOutputWriters } from "../src/logging/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const eventResponses: ServerResponse[] = [];

interface MemorySink {
  chunks: string[];
  write(chunk: string): boolean;
}

interface TestWorkspace {
  root: string;
  workspacePath: string;
  homeDir: string;
  configPath: string;
}

interface FakeServerOptions {
  providerStatus?: number;
  providerBody?: unknown;
}

function createMemorySink(): MemorySink {
  const chunks: string[] = [];

  return {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  };
}

async function createTestWorkspace(input: {
  baseUrl?: string;
  enabled?: boolean;
}): Promise<TestWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-providers-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const binaryPath = path.join(root, "bin", "opencode");
  await Promise.all([
    mkdir(path.join(workspacePath, ".agentproxy"), { recursive: true }),
    mkdir(path.dirname(binaryPath), { recursive: true }),
    mkdir(homeDir, { recursive: true }),
  ]);
  await writeVersionOnlyOpenCodeBinary(binaryPath);

  const configPath = path.join(workspacePath, ".agentproxy", "config.json");
  const runtime =
    input.baseUrl === undefined
      ? {
          mode: "attached",
        }
      : {
          mode: "attached",
          baseUrl: input.baseUrl,
        };
  await writeFile(
    configPath,
    JSON.stringify({
      storage: {
        path: path.join(root, "agentproxy.db"),
      },
      providers: {
        opencode: {
          enabled: input.enabled ?? true,
          binary: binaryPath,
          runtime,
        },
      },
    }),
    "utf8",
  );

  return {
    root,
    workspacePath,
    homeDir,
    configPath,
  };
}

async function writeVersionOnlyOpenCodeBinary(binaryPath: string): Promise<void> {
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
if (process.argv[2] === "--version") {
  console.log("OpenCode 1.16.0")
  process.exit(0)
}
console.error("provider inspect test binary only supports --version")
process.exit(64)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
}

async function runCli(input: {
  argv: string[];
  workspace: TestWorkspace;
  env?: Record<string, string | undefined>;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  const stdout = createMemorySink();
  const stderr = createMemorySink();
  const program = createProgram({
    cwd: input.workspace.workspacePath,
    homeDir: input.workspace.homeDir,
    env: {
      PATH: process.env.PATH ?? "",
      ...(input.env ?? {}),
    },
    output: createOutputWriters({ stdout, stderr }),
  });

  try {
    await program.parseAsync(["node", "agentproxy", ...input.argv]);
    return {
      exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
      stdout: stdout.chunks.join(""),
      stderr: stderr.chunks.join(""),
    };
  } finally {
    process.exitCode = originalExitCode;
  }
}

async function startFakeOpenCodeServer(options: FakeServerOptions = {}): Promise<{
  baseUrl: string;
}> {
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (method === "GET" && url.pathname === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.17.0" }));
      return;
    }

    if (method === "GET" && url.pathname === "/doc") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>OpenAPI 3.1</html>");
      return;
    }

    if (method === "GET" && url.pathname === "/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      });
      response.write('data: {"type":"server.connected"}\\n\\n');
      eventResponses.push(response);
      return;
    }

    if (method === "GET" && url.pathname === "/session") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }

    if (method === "GET" && url.pathname === "/session/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    if (method === "GET" && url.pathname === "/provider") {
      response.writeHead(options.providerStatus ?? 200, { "content-type": "application/json" });
      response.end(JSON.stringify(options.providerBody ?? providerListResponse()));
      return;
    }

    if (
      method === "GET" &&
      ["/command", "/mcp", "/lsp", "/formatter", "/agent"].includes(url.pathname)
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    if (method === "OPTIONS") {
      const allow = allowHeaderForProbePath(url.pathname);
      if (allow !== undefined) {
        response.writeHead(204, { allow });
        response.end();
        return;
      }
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
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
    throw new Error("Expected fake OpenCode server to listen on a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function providerListResponse(): unknown {
  return {
    all: [
      {
        id: "anthropic",
        name: "Anthropic",
        api: "anthropic",
        env: ["ANTHROPIC_API_KEY"],
        models: {
          "claude-sonnet-test": {
            id: "claude-sonnet-test",
            name: "\u001B[31mClaude token=provider-secret\u001B[0m",
            limit: {
              context: 200_000,
              output: 8_192,
            },
            options: {
              apiKey: "sk-model-secret",
            },
            headers: {
              authorization: "Bearer sk-model-secret",
            },
          },
        },
      },
    ],
    default: {
      anthropic: "claude-sonnet-test",
    },
    connected: ["anthropic"],
  };
}

function allowHeaderForProbePath(url: string): string | undefined {
  switch (url) {
    case "/session":
      return "GET, POST";
    case "/session/__agentproxy_probe__":
      return "GET, PATCH, DELETE";
    case "/session/__agentproxy_probe__/abort":
      return "POST";
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

afterEach(async () => {
  for (const response of eventResponses.splice(0)) {
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

describe("agentproxy providers CLI", () => {
  it("prints one JSON providers list report without the planned placeholder", async () => {
    const { baseUrl } = await startFakeOpenCodeServer();
    const workspace = await createTestWorkspace({ baseUrl });

    const result = await runCli({
      workspace,
      argv: ["providers", "list", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      workspacePath: workspace.workspacePath,
      providers: [
        {
          id: "opencode",
          displayName: "OpenCode",
          enabled: true,
          mode: "available",
          health: {
            status: "healthy",
            providerVersion: "1.17.0",
          },
          runtime: {
            baseUrlSource: "config",
            mode: "attached",
          },
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain("provider-secret");
  });

  it("inspects OpenCode in human mode with terminal-safe model output", async () => {
    const { baseUrl } = await startFakeOpenCodeServer();
    const workspace = await createTestWorkspace({ baseUrl });

    const result = await runCli({
      workspace,
      argv: ["providers", "inspect", "opencode", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Provider: opencode (OpenCode)");
    expect(result.stdout).toContain("Health: healthy");
    expect(result.stdout).toContain("Models: 1 available");
    expect(result.stdout).toContain("anthropic/claude-sonnet-test");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(result.stdout).not.toContain("provider-secret");
  });

  it("reports missing runtime base URL as degraded and skips model listing", async () => {
    const workspace = await createTestWorkspace({});
    const storagePath = path.join(workspace.root, "agentproxy.db");

    const result = await runCli({
      workspace,
      argv: ["providers", "inspect", "opencode", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.provider.health).toMatchObject({
      status: "degraded",
    });
    expect(report.provider.runtime).toMatchObject({
      baseUrlSource: "none",
    });
    expect(report.provider.models).toMatchObject({
      status: "skipped",
      count: 0,
    });
    expect(result.stderr).toBe("");
    expect(existsSync(storagePath)).toBe(false);
  });

  it("keeps model list failures inside inspect metadata", async () => {
    const { baseUrl } = await startFakeOpenCodeServer({
      providerStatus: 401,
      providerBody: { error: "token=provider-secret" },
    });
    const workspace = await createTestWorkspace({ baseUrl });

    const result = await runCli({
      workspace,
      argv: ["providers", "inspect", "opencode", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.provider.models).toMatchObject({
      status: "failed",
      count: 0,
      error: {
        code: "PERMISSION_DENIED",
      },
    });
    expect(JSON.stringify(report)).not.toContain("provider-secret");
  });

  it("maps invalid provider errors and disabled provider states without leaking controls", async () => {
    const enabledWorkspace = await createTestWorkspace({});
    const disabledWorkspace = await createTestWorkspace({ enabled: false });

    const missing = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "providers",
        "inspect",
        "missing-provider",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missing.exitCode).toBe(4);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-provider",
      },
    });

    const missingHuman = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "providers",
        "inspect",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingHuman.exitCode).toBe(4);
    expect(missingHuman.stdout).toBe("");
    expect(missingHuman.stderr).toContain("PROVIDER_NOT_FOUND");
    expect(missingHuman.stderr).not.toContain("\u001B[31m");
    expect(missingHuman.stderr).not.toContain("provider-secret");

    const disabledList = await runCli({
      workspace: disabledWorkspace,
      argv: ["providers", "list", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabledList.exitCode).toBe(0);
    expect(JSON.parse(disabledList.stdout)).toMatchObject({
      ok: true,
      providers: [
        {
          id: "opencode",
          enabled: false,
          mode: "limited",
          health: {
            status: "unknown",
          },
        },
      ],
    });

    const disabledInspect = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "providers",
        "inspect",
        "opencode",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledInspect.exitCode).toBe(4);
    expect(JSON.parse(disabledInspect.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
  });

  it("leaves later Phase 5 business commands as planned placeholders", async () => {
    const workspace = await createTestWorkspace({});

    const result = await runCli({
      workspace,
      argv: ["sessions", "abort", "apx_123", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CAPABILITY_UNSUPPORTED");
    expect(result.stderr).toContain("agentproxy sessions abort is planned");
  });
});
