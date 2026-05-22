import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { resumeAgentProxyCliSession } from "../src/cli/sessions.js";
import { createOutputWriters } from "../src/logging/index.js";
import { openAgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const openSseResponses: ServerResponse[] = [];

interface MemorySink {
  chunks: string[];
  write(chunk: string): boolean;
}

interface TestWorkspace {
  root: string;
  workspacePath: string;
  otherWorkspacePath: string;
  homeDir: string;
  configPath: string;
  storagePath: string;
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

async function createTestWorkspace(input: { enabled?: boolean } = {}): Promise<TestWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-sessions-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const otherWorkspacePath = path.join(root, "other-workspace");
  const homeDir = path.join(root, "home");
  const storagePath = path.join(root, "data", "agentproxy.db");
  const configPath = path.join(workspacePath, ".agentproxy", "config.json");
  await Promise.all([
    mkdir(path.dirname(configPath), { recursive: true }),
    mkdir(otherWorkspacePath, { recursive: true }),
    mkdir(homeDir, { recursive: true }),
  ]);

  await writeFile(
    configPath,
    JSON.stringify({
      storage: {
        path: storagePath,
      },
      providers: {
        opencode: {
          enabled: input.enabled ?? true,
          runtime: {
            mode: "attached",
          },
        },
      },
    }),
    "utf8",
  );

  return {
    root,
    workspacePath,
    otherWorkspacePath,
    homeDir,
    configPath,
    storagePath,
  };
}

async function createFakeOpenCodeExportBinary(root: string): Promise<{
  binaryPath: string;
  invocationLogPath: string;
}> {
  const binaryDirectory = path.join(root, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  const binaryPath = path.join(binaryDirectory, "opencode");
  const invocationLogPath = path.join(root, "opencode-export-invocations.jsonl");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(invocationLogPath)}, JSON.stringify(args) + "\\n")

if (args[0] === "--version") {
  console.log("OpenCode 1.16.0")
  process.exit(0)
}

if (args[0] === "export") {
  const sanitized = args.includes("--sanitize")
  console.log(JSON.stringify({
    id: args[1],
    sanitized,
    transcript: sanitized ? "[sanitized]" : "raw transcript secret-token",
    title: sanitized
      ? "\\u001B[31mexport token=payload-secret\\u001B[0m"
      : "\\u001B[31mraw token=payload-secret\\u001B[0m"
  }))
  process.exit(0)
}

if (args[0] === "import") {
  console.log(JSON.stringify({
    id: "ses_imported_token=provider-secret",
    directory: process.cwd(),
    title: "\\u001B[31mImported token=title-secret\\u001B[0m",
    model: {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5"
    },
    time: {
      created: Date.parse("2026-05-20T21:00:00.000Z"),
      updated: Date.parse("2026-05-20T21:00:01.000Z")
    }
  }))
  process.exit(0)
}

console.error("unexpected args " + args.join(" "))
process.exit(64)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return { binaryPath, invocationLogPath };
}

async function startFakeOpenCodeResumeServer(
  input: {
    providerSessionId?: string;
    delta?: string;
    terminal?: "idle" | "error" | "none";
    hangSessionGet?: boolean;
  } = {},
): Promise<{
  baseUrl: string;
  sessionGets: string[];
  messageBodies: unknown[];
}> {
  const providerSessionId = input.providerSessionId ?? "ses_resume";
  const delta = input.delta ?? "resume complete";
  const terminal = input.terminal ?? "idle";
  const sessionGets: string[] = [];
  const messageBodies: unknown[] = [];
  let eventResponse: ServerResponse | undefined;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPathname = decodeURIComponent(url.pathname);

    if (request.method === "GET" && url.pathname === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/session/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ [providerSessionId]: { type: "busy" } }));
      return;
    }

    if (request.method === "GET" && decodedPathname === `/session/${providerSessionId}`) {
      sessionGets.push(url.searchParams.get("directory") ?? "");
      if (input.hangSessionGet === true) {
        response.writeHead(200, { "content-type": "application/json" });
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: providerSessionId,
          directory: url.searchParams.get("directory") ?? undefined,
          title: "Resumed session token=title-secret",
          model: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4-5",
          },
          time: {
            created: Date.parse("2026-05-21T06:00:00.000Z"),
            updated: Date.parse("2026-05-21T08:00:00.000Z"),
          },
        }),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      response.write(": connected\n\n");
      eventResponse = response;
      openSseResponses.push(response);
      return;
    }

    if (request.method === "POST" && decodedPathname === `/session/${providerSessionId}/message`) {
      void readRequestJson(request).then((body) => {
        messageBodies.push(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ info: { id: "msg_resume" }, parts: [] }));

        if (eventResponse !== undefined) {
          writeSse(eventResponse, {
            id: "evt_resume_delta",
            type: "message.part.delta",
            properties: {
              sessionID: providerSessionId,
              messageID: "msg_resume",
              partID: "prt_text",
              field: "text",
              delta,
            },
          });
          if (terminal === "idle") {
            writeSse(eventResponse, {
              id: "evt_resume_idle",
              type: "session.idle",
              properties: {
                sessionID: providerSessionId,
              },
            });
          } else if (terminal === "error") {
            writeSse(eventResponse, {
              id: "evt_resume_error",
              type: "session.error",
              properties: {
                sessionID: providerSessionId,
                error: {
                  type: "OPENCODE_RESUME_FAILED",
                  message: "resume failed with api_key=sk-resume-error",
                },
              },
            });
          }
        }
      });
      return;
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
    sessionGets,
    messageBodies,
  };
}

async function startFakeOpenCodeAbortServer(
  input: { providerSessionId?: string; responseStatus?: number } = {},
): Promise<{
  baseUrl: string;
  abortDirectories: string[];
  abortCalls: string[];
}> {
  const providerSessionId = input.providerSessionId ?? "ses_abort";
  const responseStatus = input.responseStatus ?? 204;
  const abortDirectories: string[] = [];
  const abortCalls: string[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPathname = decodeURIComponent(url.pathname);

    if (request.method === "POST" && decodedPathname === `/session/${providerSessionId}/abort`) {
      abortCalls.push(`${request.method} ${decodedPathname}`);
      abortDirectories.push(url.searchParams.get("directory") ?? "");
      response.writeHead(responseStatus, { "content-type": "application/json" });
      response.end(
        responseStatus === 204
          ? undefined
          : JSON.stringify({
              error: "abort failed token=provider-error-secret",
            }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found token=server-secret" }));
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
    abortDirectories,
    abortCalls,
  };
}

async function startFakeOpenCodeDeleteServer(
  input: { providerSessionId?: string; responseStatus?: number } = {},
): Promise<{
  baseUrl: string;
  deleteDirectories: string[];
  deleteCalls: string[];
}> {
  const providerSessionId = input.providerSessionId ?? "ses_delete";
  const responseStatus = input.responseStatus ?? 204;
  const deleteDirectories: string[] = [];
  const deleteCalls: string[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPathname = decodeURIComponent(url.pathname);

    if (request.method === "DELETE" && decodedPathname === `/session/${providerSessionId}`) {
      deleteCalls.push(`${request.method} ${decodedPathname}`);
      deleteDirectories.push(url.searchParams.get("directory") ?? "");
      response.writeHead(responseStatus, { "content-type": "application/json" });
      response.end(
        responseStatus === 204
          ? undefined
          : JSON.stringify({
              error: "delete failed token=provider-error-secret",
            }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found token=server-secret" }));
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
    deleteDirectories,
    deleteCalls,
  };
}

async function startFakeOpenCodeShareServer(
  input: { providerSessionId?: string; responseStatus?: number; shareUrl?: string } = {},
): Promise<{
  baseUrl: string;
  shareDirectories: string[];
  shareCalls: string[];
  unshareDirectories: string[];
  unshareCalls: string[];
}> {
  const providerSessionId = input.providerSessionId ?? "ses_share";
  const responseStatus = input.responseStatus ?? 200;
  const shareDirectories: string[] = [];
  const shareCalls: string[] = [];
  const unshareDirectories: string[] = [];
  const unshareCalls: string[] = [];
  const shareUrl =
    input.shareUrl ??
    "\u001B[31mhttps://user:password@share.example.test/session/ses_recent?token=share-secret-token\u001B[0m\rStatus: spoofed";

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPathname = decodeURIComponent(url.pathname);

    if (request.method === "POST" && decodedPathname === `/session/${providerSessionId}/share`) {
      shareCalls.push(`${request.method} ${decodedPathname}`);
      shareDirectories.push(url.searchParams.get("directory") ?? "");
      response.writeHead(responseStatus, { "content-type": "application/json" });
      response.end(
        responseStatus === 200
          ? JSON.stringify({
              url: shareUrl,
              token: "provider-response-token-secret",
              transcript: "provider transcript must not print",
            })
          : JSON.stringify({
              error: "share failed token=provider-error-secret",
            }),
      );
      return;
    }

    if (request.method === "DELETE" && decodedPathname === `/session/${providerSessionId}/share`) {
      unshareCalls.push(`${request.method} ${decodedPathname}`);
      unshareDirectories.push(url.searchParams.get("directory") ?? "");
      response.writeHead(responseStatus === 200 ? 204 : responseStatus, {
        "content-type": "application/json",
      });
      response.end(
        responseStatus === 200
          ? ""
          : JSON.stringify({
              error:
                "unshare failed token=provider-error-secret url=https://share.example.test/session/ses_recent?token=provider-share-secret",
            }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found token=server-secret" }));
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
    shareDirectories,
    shareCalls,
    unshareDirectories,
    unshareCalls,
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

function updateConfigRuntimeBaseUrl(workspace: TestWorkspace, baseUrl: string): Promise<void> {
  return writeFile(
    workspace.configPath,
    JSON.stringify({
      storage: {
        path: workspace.storagePath,
      },
      providers: {
        opencode: {
          enabled: true,
          runtime: {
            mode: "attached",
            baseUrl,
          },
        },
      },
    }),
    "utf8",
  );
}

function updateConfigOpenCodeBinary(workspace: TestWorkspace, binaryPath: string): Promise<void> {
  return writeFile(
    workspace.configPath,
    JSON.stringify({
      storage: {
        path: workspace.storagePath,
      },
      providers: {
        opencode: {
          enabled: true,
          binary: binaryPath,
          runtime: {
            mode: "attached",
          },
        },
      },
    }),
    "utf8",
  );
}

async function readFakeOpenCodeInvocations(invocationLogPath: string): Promise<string[][]> {
  const raw = await readFile(invocationLogPath, "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as string[]);
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

function seedSessionRegistry(workspace: TestWorkspace): void {
  const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
  try {
    storage.sessions.upsert({
      id: "apx_other_workspace",
      providerId: "opencode",
      providerSessionId: "ses_other_workspace",
      workspacePath: workspace.otherWorkspacePath,
      title: "Other workspace",
      status: "completed",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T08:30:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_other_provider",
      providerId: "mock",
      providerSessionId: "ses_other_provider",
      workspacePath: workspace.workspacePath,
      title: "Other provider",
      status: "completed",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T08:00:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_deleted",
      providerId: "opencode",
      providerSessionId: "ses_deleted",
      workspacePath: workspace.workspacePath,
      title: "Deleted token=deleted-secret",
      status: "idle",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T09:00:00.000Z",
      deletedAt: "2026-05-21T09:10:00.000Z",
      tombstoneReason: "provider_deleted",
      metadata: {
        secret: "deleted-metadata-secret",
      },
    });
    storage.sessions.upsert({
      id: "apx_recent",
      providerId: "opencode",
      providerSessionId: "ses_recent_token=provider-secret",
      workspacePath: workspace.workspacePath,
      title: "\u001B[31mLatest token=title-secret\u001B[0m",
      status: "running",
      model: "anthropic/claude-sonnet-4-5",
      runtimeId: "runtime_1",
      parentSessionId: "apx_parent",
      createdAt: "2026-05-21T06:00:00.000Z",
      updatedAt: "2026-05-21T07:30:00.000Z",
      lastRunAt: "2026-05-21T07:35:00.000Z",
      lastSyncAt: "2026-05-21T07:36:00.000Z",
      lastError: "Authorization: Bearer sk-last-error-secret",
      metadata: {
        authorization: "Bearer sk-session-metadata-secret",
        transcript: "do not print provider transcript",
      },
    });
    storage.sessions.upsert({
      id: "apx_older",
      providerId: "opencode",
      providerSessionId: "ses_older",
      workspacePath: workspace.workspacePath,
      title: "Older session",
      status: "completed",
      model: "openai/gpt-5",
      createdAt: "2026-05-21T05:30:00.000Z",
      updatedAt: "2026-05-21T06:30:00.000Z",
      lastRunAt: "2026-05-21T06:45:00.000Z",
      metadata: {},
    });
  } finally {
    storage.close();
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

  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy sessions CLI", () => {
  it("prints one JSON sessions list report without the planned placeholder", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      workspacePath: workspace.workspacePath,
      source: {
        storage: "readonly",
        databaseExists: true,
      },
      sessions: [
        {
          id: "apx_recent",
          providerId: "opencode",
          providerSessionId: "ses_recent_token=[REDACTED]",
          title: "Latest token=[REDACTED]",
          status: "running",
          model: "anthropic/claude-sonnet-4-5",
          runtimeId: "runtime_1",
          parentSessionId: "apx_parent",
          lastError: "Authorization: [REDACTED]",
        },
        {
          id: "apx_older",
          providerId: "opencode",
          providerSessionId: "ses_older",
          title: "Older session",
          status: "completed",
          model: "openai/gpt-5",
        },
      ],
    });
    expect(report.sessions).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain("apx_other_workspace");
    expect(JSON.stringify(report)).not.toContain("apx_other_provider");
    expect(JSON.stringify(report)).not.toContain("apx_deleted");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-last-error-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("prints terminal-safe human sessions list output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("AgentProxy sessions: 2");
    expect(result.stdout).toContain("apx_recent");
    expect(result.stdout).toContain("running");
    expect(result.stdout).toContain("Latest token=[REDACTED]");
    expect(result.stdout).toContain("ses_recent_token=[REDACTED]");
    expect(result.stdout).not.toContain("apx_deleted");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("prints one JSON sessions show report without the planned placeholder", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      workspacePath: workspace.workspacePath,
      source: {
        storage: "readonly",
        databaseExists: true,
      },
      session: {
        id: "apx_recent",
        providerId: "opencode",
        providerSessionId: "ses_recent_token=[REDACTED]",
        workspacePath: workspace.workspacePath,
        title: "Latest token=[REDACTED]",
        status: "running",
        model: "anthropic/claude-sonnet-4-5",
        runtimeId: "runtime_1",
        parentSessionId: "apx_parent",
        createdAt: "2026-05-21T06:00:00.000Z",
        updatedAt: "2026-05-21T07:30:00.000Z",
        lastRunAt: "2026-05-21T07:35:00.000Z",
        lastSyncAt: "2026-05-21T07:36:00.000Z",
        lastError: "Authorization: [REDACTED]",
        sourceOfTruth: "provider_content_agentproxy_index",
      },
    });
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-last-error-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("prints terminal-safe human sessions show output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("AgentProxy session: apx_recent");
    expect(result.stdout).toContain("Status: running");
    expect(result.stdout).toContain("Title: Latest token=[REDACTED]");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain("Source of truth: provider_content_agentproxy_index");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("exports sanitized session data to stdout by default", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);

    const result = await runCli({
      workspace,
      argv: ["sessions", "export", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: "ses_recent_token=[REDACTED]",
      sanitized: true,
      transcript: "[sanitized]",
      title: "export token=[REDACTED]",
    });
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("payload-secret");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(await readFakeOpenCodeInvocations(fakeBinary.invocationLogPath)).toContainEqual([
      "export",
      "ses_recent_token=provider-secret",
      "--sanitize",
    ]);

    const storage = openAgentProxyStorage({
      databasePath: workspace.storagePath,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(JSON.stringify(storage.sessions.getById("apx_recent"))).not.toContain(
        "payload-secret",
      );
      expect(JSON.stringify(storage.sessions.getById("apx_recent"))).not.toContain(
        "raw transcript secret-token",
      );
    } finally {
      storage.close();
    }
  });

  it("prints one JSON sessions export report with sanitized data", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);

    const result = await runCli({
      workspace,
      argv: ["sessions", "export", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      sanitized: true,
      output: {
        target: "stdout",
      },
      data: {
        id: "ses_recent_token=[REDACTED]",
        sanitized: true,
        transcript: "[sanitized]",
        title: "export token=[REDACTED]",
      },
    });
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("payload-secret");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("writes sanitized export data to --output and prints a terminal-safe summary", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const outputPath = path.join(workspace.root, "session-export.json");

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--output",
        outputPath,
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session exported: apx_recent");
    expect(result.stdout).toContain("Sanitized: true");
    expect(result.stdout).toContain(`Output: ${outputPath}`);
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("payload-secret");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      id: "ses_recent_token=[REDACTED]",
      sanitized: true,
      transcript: "[sanitized]",
      title: "export token=[REDACTED]",
    });
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  });

  it("does not overwrite existing export output files", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const outputPath = path.join(workspace.root, "existing-export.json");
    await writeFile(outputPath, "existing content\n", { encoding: "utf8", mode: 0o600 });

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--output",
        outputPath,
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "sessions.export",
      },
    });
    expect(await readFile(outputPath, "utf8")).toBe("existing content\n");
    await expect(readFile(fakeBinary.invocationLogPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("cleans up reserved export output files when provider export fails", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const emptyBin = path.join(workspace.root, "empty-bin");
    await mkdir(emptyBin, { recursive: true });
    const outputPath = path.join(workspace.root, "failed-export.json");

    const result = await runCli({
      workspace,
      env: {
        PATH: emptyBin,
      },
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--output",
        outputPath,
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "opencode.provider.exportSession",
      },
    });
    expect(existsSync(outputPath)).toBe(false);
  });

  it("requires explicit confirmation before raw export contacts the provider", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--raw",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        providerId: "opencode",
        operation: "sessions.export",
      },
    });
    await expect(readFile(fakeBinary.invocationLogPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("exports raw data only with explicit confirmation", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--raw",
        "--yes",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      sanitized: false,
      data: {
        id: "ses_recent_token=provider-secret",
        sanitized: false,
        transcript: "raw transcript secret-token",
        title: "\u001B[31mraw token=payload-secret\u001B[0m",
      },
    });
    expect(await readFakeOpenCodeInvocations(fakeBinary.invocationLogPath)).toContainEqual([
      "export",
      "ses_recent_token=provider-secret",
    ]);
  });

  it("keeps raw --output JSON reports payload-free while writing the raw file", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const outputPath = path.join(workspace.root, "raw-session-export.json");

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--raw",
        "--yes",
        "--output",
        outputPath,
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      sanitized: false,
      output: {
        target: "file",
        path: outputPath,
      },
    });
    expect(report).not.toHaveProperty("data");
    expect(result.stdout).not.toContain("raw transcript secret-token");
    expect(result.stdout).not.toContain("payload-secret");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      id: "ses_recent_token=provider-secret",
      sanitized: false,
      transcript: "raw transcript secret-token",
      title: "\u001B[31mraw token=payload-secret\u001B[0m",
    });
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  });

  it("imports a session from native OpenCode import and prints a transcript-free JSON report", async () => {
    const workspace = await createTestWorkspace();
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const source = "https://share.example.test/import?token=source-secret-token";

    const result = await runCli({
      workspace,
      argv: ["sessions", "import", source, "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      session: {
        id: expect.stringMatching(/^apx_/u),
        providerId: "opencode",
        providerSessionId: "ses_imported_token=[REDACTED]",
        workspacePath: workspace.workspacePath,
        title: "Imported token=[REDACTED]",
        status: "unknown",
        model: "anthropic/claude-sonnet-4-5",
        sourceOfTruth: "provider_content_agentproxy_index",
      },
      action: {
        type: "import",
      },
    });
    expect(typeof report.action.importedAt).toBe("string");
    expect(typeof report.generatedAt).toBe("string");
    expect(JSON.stringify(report)).not.toContain("source-secret-token");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(await readFakeOpenCodeInvocations(fakeBinary.invocationLogPath)).toContainEqual([
      "import",
      source,
    ]);

    const storage = openAgentProxyStorage({
      databasePath: workspace.storagePath,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    try {
      const session = storage.sessions.getByProviderSessionId(
        "opencode",
        "ses_imported_token=provider-secret",
      );
      expect(session).toMatchObject({
        providerId: "opencode",
        providerSessionId: "ses_imported_token=provider-secret",
        workspacePath: workspace.workspacePath,
        title: "Imported token=[REDACTED]",
        status: "unknown",
        sourceOfTruth: "provider_content_agentproxy_index",
      });
      expect(JSON.stringify(session)).not.toContain("source-secret-token");
      expect(JSON.stringify(session)).not.toContain("title-secret");
      expect(JSON.stringify(session)).not.toContain("\u001B[31m");
    } finally {
      storage.close();
    }
  });

  it("updates an existing imported session mapping in place", async () => {
    const workspace = await createTestWorkspace();
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      storage.sessions.upsert({
        id: "apx_existing_import",
        providerId: "opencode",
        providerSessionId: "ses_imported_token=provider-secret",
        workspacePath: workspace.workspacePath,
        title: "Existing token=old-title-secret",
        status: "idle",
        createdAt: "2026-05-20T20:00:00.000Z",
        updatedAt: "2026-05-20T20:00:01.000Z",
        metadata: {
          prior: "token=old-metadata-secret",
        },
      });
    } finally {
      storage.close();
    }

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.session).toMatchObject({
      id: "apx_existing_import",
      providerSessionId: "ses_imported_token=[REDACTED]",
      title: "Imported token=[REDACTED]",
      status: "unknown",
    });

    const updatedStorage = openAgentProxyStorage({
      databasePath: workspace.storagePath,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(updatedStorage.sessions.list({ includeTombstones: true })).toHaveLength(1);
      expect(updatedStorage.sessions.getById("apx_existing_import")).toMatchObject({
        id: "apx_existing_import",
        providerSessionId: "ses_imported_token=provider-secret",
        title: "Imported token=[REDACTED]",
        status: "unknown",
      });
    } finally {
      updatedStorage.close();
    }
  });

  it("does not overwrite a tombstoned matching provider session during import", async () => {
    const workspace = await createTestWorkspace();
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      storage.sessions.upsert({
        id: "apx_import_deleted",
        providerId: "opencode",
        providerSessionId: "ses_imported_token=provider-secret",
        workspacePath: workspace.workspacePath,
        title: "Deleted token=deleted-title-secret",
        status: "idle",
        createdAt: "2026-05-20T20:00:00.000Z",
        updatedAt: "2026-05-20T20:00:01.000Z",
        deletedAt: "2026-05-20T20:10:00.000Z",
        tombstoneReason: "provider_deleted",
        metadata: {
          prior: "token=deleted-metadata-secret",
        },
      });
    } finally {
      storage.close();
    }

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.import",
      },
    });
    expect(result.stdout).not.toContain("source-secret-token");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("deleted-title-secret");
    expect(result.stdout).not.toContain("deleted-metadata-secret");

    const updatedStorage = openAgentProxyStorage({
      databasePath: workspace.storagePath,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(updatedStorage.sessions.getById("apx_import_deleted")).toMatchObject({
        id: "apx_import_deleted",
        deletedAt: "2026-05-20T20:10:00.000Z",
        tombstoneReason: "provider_deleted",
      });
      expect(updatedStorage.sessions.list({ includeTombstones: true })).toHaveLength(1);
    } finally {
      updatedStorage.close();
    }
  });

  it("prints terminal-safe human import output", async () => {
    const workspace = await createTestWorkspace();
    const fakeBinary = await createFakeOpenCodeExportBinary(workspace.root);
    await updateConfigOpenCodeBinary(workspace, fakeBinary.binaryPath);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session imported: apx_");
    expect(result.stdout).toContain("Provider session: ses_imported_token=[REDACTED]");
    expect(result.stdout).toContain("Status: unknown");
    expect(result.stdout).toContain("Imported: ");
    expect(result.stdout).not.toContain("source-secret-token");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("resumes an existing session with a prompt and prints a transcript-free JSON report", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_recent_token=provider-secret",
      delta: "\u001B[31mresume api_key=sk-delta-secret\u001B[0m\rStatus: spoofed",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "resume",
        "apx_recent",
        "--prompt",
        "continue api_key=sk-prompt-secret",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      status: "completed",
      promptSent: true,
      runtime: {
        source: "config",
        mode: "attached",
        startedByCommand: false,
      },
      counts: {
        events: 4,
        eventSummaries: 4,
      },
    });
    expect(report.events.map((event: { type: string }) => event.type)).toEqual([
      "session.status_changed",
      "message.delta",
      "session.status_changed",
      "session.completed",
    ]);
    expect(JSON.stringify(report)).not.toContain("sk-prompt-secret");
    expect(JSON.stringify(report)).not.toContain("sk-delta-secret");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("resume api_key=");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(fakeServer.sessionGets).toEqual([workspace.workspacePath]);
    expect(fakeServer.messageBodies).toEqual([
      {
        parts: [
          {
            type: "text",
            text: "continue api_key=sk-prompt-secret",
          },
        ],
      },
    ]);

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      expect(session).toMatchObject({
        id: "apx_recent",
        providerSessionId: "ses_recent_token=provider-secret",
        title: "Resumed session token=[REDACTED]",
        status: "completed",
        model: "anthropic/claude-sonnet-4-5",
      });
      expect(JSON.stringify(storage.sessionEvents.listBySessionId("apx_recent"))).not.toContain(
        "sk-delta-secret",
      );
      expect(JSON.stringify(storage.sessions.list({ includeTombstones: true }))).not.toContain(
        "sk-prompt-secret",
      );
    } finally {
      storage.close();
    }
  });

  it("resumes an existing session without a prompt as a sync-only workflow", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_older",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "resume", "apx_older", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_older",
      providerSessionId: "ses_older",
      status: "running",
      promptSent: false,
      events: [],
      counts: {
        events: 0,
        eventSummaries: 0,
      },
    });
    expect(fakeServer.sessionGets).toEqual([workspace.workspacePath]);
    expect(fakeServer.messageBodies).toEqual([]);
  });

  it("prints terminal-safe human resume output with streamed prompt events", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_recent_token=provider-secret",
      delta: "\u001B[31mhuman token=delta-secret\u001B[0m\rStatus: spoofed",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "resume",
        "apx_recent",
        "--prompt",
        "human token=prompt-secret",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session: apx_recent");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain("Status: completed");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("human token=");
    expect(result.stdout).not.toContain("prompt-secret");
    expect(result.stdout).not.toContain("delta-secret");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(result.stdout).not.toContain("\rStatus: spoofed");
  });

  it("maps provider terminal errors during resume prompt to run-style failure exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_recent_token=provider-secret",
      delta: "failed transcript api_key=sk-delta-secret",
      terminal: "error",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "resume",
        "apx_recent",
        "--prompt",
        "fail api_key=sk-prompt-secret",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      sessionId: "apx_recent",
      status: "failed",
      promptSent: true,
    });
    expect(report.events.at(-1)).toEqual({ type: "session.completed", status: "failed" });
    expect(JSON.stringify(report)).not.toContain("sk-prompt-secret");
    expect(JSON.stringify(report)).not.toContain("sk-delta-secret");
  });

  it("marks the existing session failed when provider resume times out before sync succeeds", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_recent_token=provider-secret",
      hangSessionGet: true,
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    await expect(
      resumeAgentProxyCliSession("apx_recent", {
        cwd: workspace.workspacePath,
        homeDir: workspace.homeDir,
        env: {
          PATH: process.env.PATH ?? "",
        },
        cli: {
          configPath: workspace.configPath,
        },
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({
      code: "EVENT_STREAM_INTERRUPTED",
      operation: "sessions.resume",
    });

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(storage.sessions.getById("apx_recent")).toMatchObject({
        status: "failed",
        lastError: "agentproxy sessions resume timed out.",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects empty and oversized resume prompts before contacting the provider", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const prompt of ["", "x".repeat(1024 * 1024 + 1)]) {
      const result = await runCli({
        workspace,
        argv: [
          "sessions",
          "resume",
          "apx_recent",
          "--prompt",
          prompt,
          "--json",
          "--config",
          workspace.configPath,
        ],
      });

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "CONFIG_INVALID",
          operation: "sessions.resume",
        },
      });
    }

    expect(fakeServer.sessionGets).toEqual([]);
    expect(fakeServer.messageBodies).toEqual([]);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(storage.sessions.getById("apx_recent")).toMatchObject({
        status: "running",
        lastError: "Authorization: Bearer sk-last-error-secret",
      });
    } finally {
      storage.close();
    }
  });

  it("aborts an existing session and prints a transcript-free JSON report", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeAbortServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "abort", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      status: "failed",
      action: {
        type: "abort",
      },
      runtime: {
        source: "config",
        mode: "attached",
        startedByCommand: false,
      },
    });
    expect(typeof report.action.abortedAt).toBe("string");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(fakeServer.abortCalls).toEqual(["POST /session/ses_recent_token=provider-secret/abort"]);
    expect(fakeServer.abortDirectories).toEqual([workspace.workspacePath]);

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      expect(session).toMatchObject({
        id: "apx_recent",
        providerSessionId: "ses_recent_token=provider-secret",
        status: "failed",
        metadata: {
          sessionOperations: {
            abort: {
              abortedAt: report.action.abortedAt,
            },
          },
        },
      });
      expect(JSON.stringify(session)).not.toContain("sk-session-metadata-secret");
    } finally {
      storage.close();
    }
  });

  it("prints terminal-safe human abort output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeAbortServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "abort", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session aborted: apx_recent");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain("Status: failed");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(fakeServer.abortDirectories).toEqual([workspace.workspacePath]);
  });

  it("deletes an existing session and prints a transcript-free JSON report", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeDeleteServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "delete",
        "apx_recent",
        "--yes",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      action: {
        type: "delete",
        tombstoneReason: "provider_deleted",
      },
      runtime: {
        source: "config",
        mode: "attached",
        startedByCommand: false,
      },
    });
    expect(typeof report.action.deletedAt).toBe("string");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(fakeServer.deleteCalls).toEqual(["DELETE /session/ses_recent_token=provider-secret"]);
    expect(fakeServer.deleteDirectories).toEqual([workspace.workspacePath]);

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      expect(session).toMatchObject({
        id: "apx_recent",
        providerSessionId: "ses_recent_token=provider-secret",
        deletedAt: report.action.deletedAt,
        tombstoneReason: "provider_deleted",
      });
    } finally {
      storage.close();
    }
  });

  it("prints terminal-safe human delete output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeDeleteServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "delete", "apx_recent", "--yes", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session deleted: apx_recent");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain("Tombstone: provider_deleted");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(fakeServer.deleteDirectories).toEqual([workspace.workspacePath]);
  });

  it("shares an existing session and prints a transcript-free JSON report with the returned URL", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "share", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      providerSessionId: "ses_recent_token=[REDACTED]",
      action: {
        type: "share",
        url: "https://share.example.test/session/ses_recent?token=share-secret-token",
      },
      runtime: {
        source: "config",
        mode: "attached",
        startedByCommand: false,
      },
    });
    expect(typeof report.action.sharedAt).toBe("string");
    expect(typeof report.generatedAt).toBe("string");
    expect(result.stdout).toContain("share-secret-token");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("provider-response-token-secret");
    expect(JSON.stringify(report)).not.toContain("user:password");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(JSON.stringify(report)).not.toContain("\rStatus: spoofed");
    expect(fakeServer.shareCalls).toEqual(["POST /session/ses_recent_token=provider-secret/share"]);
    expect(fakeServer.shareDirectories).toEqual([workspace.workspacePath]);

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      expect(session).toMatchObject({
        id: "apx_recent",
        providerSessionId: "ses_recent_token=provider-secret",
        metadata: {
          sessionOperations: {
            share: {
              shared: true,
              updatedAt: report.action.sharedAt,
            },
          },
        },
      });
      expect(JSON.stringify(session)).not.toContain("share-secret-token");
      expect(JSON.stringify(session)).not.toContain("provider-response-token-secret");
      expect(JSON.stringify(session)).not.toContain("sk-session-metadata-secret");
    } finally {
      storage.close();
    }
  });

  it("prints terminal-safe human share output with the returned URL only in the command result", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "share", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session shared: apx_recent");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain(
      "Share URL: https://share.example.test/session/ses_recent?token=share-secret-token",
    );
    expect(result.stdout).toContain("Shared: ");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("provider-response-token-secret");
    expect(result.stdout).not.toContain("user:password");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(result.stdout).not.toContain("\rStatus: spoofed");
    expect(fakeServer.shareDirectories).toEqual([workspace.workspacePath]);
  });

  it("unshares an existing session and prints a transcript-free JSON report without share URLs", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "unshare", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      sessionId: "apx_recent",
      action: {
        type: "unshare",
      },
      runtime: {
        source: "config",
        mode: "attached",
        startedByCommand: false,
      },
    });
    expect(typeof report.action.unsharedAt).toBe("string");
    expect(typeof report.generatedAt).toBe("string");
    expect(report).not.toHaveProperty("providerSessionId");
    expect(result.stdout).not.toContain("share-secret-token");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("provider-response-token-secret");
    expect(JSON.stringify(report)).not.toContain("share.example.test");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
    expect(fakeServer.unshareCalls).toEqual([
      "DELETE /session/ses_recent_token=provider-secret/share",
    ]);
    expect(fakeServer.unshareDirectories).toEqual([workspace.workspacePath]);

    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      expect(session).toMatchObject({
        id: "apx_recent",
        providerSessionId: "ses_recent_token=provider-secret",
        metadata: {
          sessionOperations: {
            share: {
              shared: false,
              updatedAt: report.action.unsharedAt,
            },
          },
        },
      });
      expect(JSON.stringify(session)).not.toContain("share-secret-token");
      expect(JSON.stringify(session)).not.toContain("provider-response-token-secret");
      expect(JSON.stringify(session)).not.toContain("share.example.test");
    } finally {
      storage.close();
    }
  });

  it("prints terminal-safe human unshare output without share URLs", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "unshare", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session unshared: apx_recent");
    expect(result.stdout).toContain("Unshared: ");
    expect(result.stdout).not.toContain("Provider session:");
    expect(result.stdout).not.toContain("Share URL:");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("provider-response-token-secret");
    expect(result.stdout).not.toContain("share.example.test");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(fakeServer.unshareDirectories).toEqual([workspace.workspacePath]);
  });

  it("requires explicit confirmation before deleting a session", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeDeleteServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "delete", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "sessions.delete",
      },
    });
    expect(result.stdout).not.toContain("provider-secret");
    expect(fakeServer.deleteCalls).toEqual([]);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(storage.sessions.getById("apx_recent")?.deletedAt).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("does not tombstone locally when provider delete fails", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeDeleteServer({
      providerSessionId: "ses_recent_token=provider-secret",
      responseStatus: 500,
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "delete",
        "apx_recent",
        "--yes",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("provider-error-secret");
    expect(fakeServer.deleteCalls).toEqual(["DELETE /session/ses_recent_token=provider-secret"]);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(storage.sessions.getById("apx_recent")?.deletedAt).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("succeeds with an empty list when the session registry database is absent", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      providerId: "opencode",
      workspacePath: workspace.workspacePath,
      source: {
        storage: "absent",
        databaseExists: false,
      },
      sessions: [],
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when showing from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.show",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when resuming from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "resume", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.resume",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when aborting from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "abort", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.abort",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when deleting from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "sessions",
        "delete",
        "apx_missing",
        "--yes",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.delete",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when exporting from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "export", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.export",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when sharing from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "share", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.share",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when unsharing from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "unshare", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.unshare",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("requires delete confirmation before touching absent storage", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "delete", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        providerId: "opencode",
        operation: "sessions.delete",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "show", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.show",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for resume", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeResumeServer();
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "resume", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.resume",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
    expect(fakeServer.sessionGets).toEqual([]);
    expect(fakeServer.messageBodies).toEqual([]);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for abort", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeAbortServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "abort", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.abort",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
    expect(fakeServer.abortCalls).toEqual([]);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for delete", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeDeleteServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: [
          "sessions",
          "delete",
          sessionId,
          "--yes",
          "--json",
          "--config",
          workspace.configPath,
        ],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.delete",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
    expect(fakeServer.deleteCalls).toEqual([]);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for share", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "share", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.share",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
    expect(fakeServer.shareCalls).toEqual([]);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for unshare", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "unshare", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.unshare",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
    expect(fakeServer.unshareCalls).toEqual([]);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found for export", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "export", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.export",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
  });

  it("maps resume runtime availability errors to a stable runtime exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "resume", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
    expect(result.stderr).not.toContain("provider-secret");
  });

  it("maps abort runtime availability errors to a stable runtime exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "abort", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
    expect(result.stderr).not.toContain("provider-secret");
  });

  it("maps delete runtime availability errors to a stable runtime exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "delete", "apx_recent", "--yes", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
    expect(result.stderr).not.toContain("provider-secret");
  });

  it("maps share runtime availability errors to a stable runtime exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "share", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
    expect(result.stderr).not.toContain("provider-secret");
  });

  it("maps unshare runtime availability errors to a stable runtime exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "unshare", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
    expect(result.stderr).not.toContain("provider-secret");
  });

  it("maps export provider binary errors to a stable provider exit code", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const emptyBin = path.join(workspace.root, "empty-bin");
    await mkdir(emptyBin, { recursive: true });

    const result = await runCli({
      workspace,
      env: {
        PATH: emptyBin,
      },
      argv: ["sessions", "export", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
    expect(result.stdout).not.toContain("provider-secret");
  });

  it("maps import provider binary errors to a stable provider exit code without leaking source", async () => {
    const workspace = await createTestWorkspace();
    const emptyBin = path.join(workspace.root, "empty-bin");
    await mkdir(emptyBin, { recursive: true });

    const result = await runCli({
      workspace,
      env: {
        PATH: emptyBin,
      },
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "opencode.provider.importSession",
      },
    });
    expect(result.stdout).not.toContain("source-secret-token");
  });

  it("does not mark the local session shared when provider share fails", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
      responseStatus: 500,
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "share", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("provider-error-secret");
    expect(fakeServer.shareCalls).toEqual(["POST /session/ses_recent_token=provider-secret/share"]);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(storage.sessions.getById("apx_recent")?.metadata.sessionOperations).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("does not mark the local session unshared when provider unshare fails", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);
    const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      const session = storage.sessions.getById("apx_recent");
      if (session === undefined) {
        throw new Error("Expected seeded session.");
      }
      storage.sessions.upsert({
        ...session,
        metadata: {
          ...session.metadata,
          sessionOperations: {
            share: {
              shared: true,
              updatedAt: "2026-05-22T00:00:00.000Z",
            },
          },
        },
      });
    } finally {
      storage.close();
    }

    const fakeServer = await startFakeOpenCodeShareServer({
      providerSessionId: "ses_recent_token=provider-secret",
      responseStatus: 500,
    });
    await updateConfigRuntimeBaseUrl(workspace, fakeServer.baseUrl);

    const result = await runCli({
      workspace,
      argv: ["sessions", "unshare", "apx_recent", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("provider-error-secret");
    expect(result.stdout).not.toContain("provider-share-secret");
    expect(result.stdout).not.toContain("share.example.test");
    expect(fakeServer.unshareCalls).toEqual([
      "DELETE /session/ses_recent_token=provider-secret/share",
    ]);
    const reopened = openAgentProxyStorage({ databasePath: workspace.storagePath });
    try {
      expect(reopened.sessions.getById("apx_recent")).toMatchObject({
        metadata: {
          sessionOperations: {
            share: {
              shared: true,
              updatedAt: "2026-05-22T00:00:00.000Z",
            },
          },
        },
      });
    } finally {
      reopened.close();
    }
  });

  it("maps invalid and disabled provider errors without leaking controls", async () => {
    const enabledWorkspace = await createTestWorkspace();
    const disabledWorkspace = await createTestWorkspace({ enabled: false });

    const missing = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "list",
        "--provider",
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
        "sessions",
        "list",
        "--provider",
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

    const missingShow = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "show",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingShow.exitCode).toBe(4);
    expect(JSON.parse(missingShow.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.show",
      },
    });
    expect(missingShow.stdout).not.toContain("\u001B[31m");
    expect(missingShow.stdout).not.toContain("provider-secret");

    const disabled = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "list", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabled.exitCode).toBe(4);
    expect(JSON.parse(disabled.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });

    const disabledShow = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "show", "apx_recent", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabledShow.exitCode).toBe(4);
    expect(JSON.parse(disabledShow.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.show",
      },
    });

    const missingImport = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingImport.exitCode).toBe(4);
    expect(JSON.parse(missingImport.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.import",
      },
    });
    expect(missingImport.stdout).not.toContain("\u001B[31m");
    expect(missingImport.stdout).not.toContain("provider-secret");
    expect(missingImport.stdout).not.toContain("source-secret-token");

    const disabledImport = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "sessions",
        "import",
        "https://share.example.test/import?token=source-secret-token",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledImport.exitCode).toBe(4);
    expect(JSON.parse(disabledImport.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.import",
      },
    });
    expect(disabledImport.stdout).not.toContain("source-secret-token");

    const missingResume = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "resume",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingResume.exitCode).toBe(4);
    expect(JSON.parse(missingResume.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.resume",
      },
    });
    expect(missingResume.stdout).not.toContain("\u001B[31m");
    expect(missingResume.stdout).not.toContain("provider-secret");

    const disabledResume = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "sessions",
        "resume",
        "apx_recent",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledResume.exitCode).toBe(4);
    expect(JSON.parse(disabledResume.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.resume",
      },
    });

    const missingAbort = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "abort",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingAbort.exitCode).toBe(4);
    expect(JSON.parse(missingAbort.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.abort",
      },
    });
    expect(missingAbort.stdout).not.toContain("\u001B[31m");
    expect(missingAbort.stdout).not.toContain("provider-secret");

    const disabledAbort = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "abort", "apx_recent", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabledAbort.exitCode).toBe(4);
    expect(JSON.parse(disabledAbort.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.abort",
      },
    });

    const missingShare = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "share",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingShare.exitCode).toBe(4);
    expect(JSON.parse(missingShare.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.share",
      },
    });
    expect(missingShare.stdout).not.toContain("\u001B[31m");
    expect(missingShare.stdout).not.toContain("provider-secret");

    const disabledShare = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "share", "apx_recent", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabledShare.exitCode).toBe(4);
    expect(JSON.parse(disabledShare.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.share",
      },
    });

    const missingUnshare = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "unshare",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingUnshare.exitCode).toBe(4);
    expect(JSON.parse(missingUnshare.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.unshare",
      },
    });
    expect(missingUnshare.stdout).not.toContain("\u001B[31m");
    expect(missingUnshare.stdout).not.toContain("provider-secret");

    const disabledUnshare = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "sessions",
        "unshare",
        "apx_recent",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledUnshare.exitCode).toBe(4);
    expect(JSON.parse(disabledUnshare.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.unshare",
      },
    });

    const missingDelete = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "delete",
        "apx_recent",
        "--yes",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingDelete.exitCode).toBe(4);
    expect(JSON.parse(missingDelete.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.delete",
      },
    });
    expect(missingDelete.stdout).not.toContain("\u001B[31m");
    expect(missingDelete.stdout).not.toContain("provider-secret");

    const disabledDelete = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "sessions",
        "delete",
        "apx_recent",
        "--yes",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledDelete.exitCode).toBe(4);
    expect(JSON.parse(disabledDelete.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.delete",
      },
    });

    const missingExport = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingExport.exitCode).toBe(4);
    expect(JSON.parse(missingExport.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.export",
      },
    });
    expect(missingExport.stdout).not.toContain("\u001B[31m");
    expect(missingExport.stdout).not.toContain("provider-secret");

    const disabledExport = await runCli({
      workspace: disabledWorkspace,
      argv: [
        "sessions",
        "export",
        "apx_recent",
        "--json",
        "--config",
        disabledWorkspace.configPath,
      ],
    });
    expect(disabledExport.exitCode).toBe(4);
    expect(JSON.parse(disabledExport.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.export",
      },
    });
  });

  it("keeps session-specific chat launch explicitly unsupported", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["chat", "--session", "apx_session_token=sk-session-secret", "--json"],
    });

    expect(result.exitCode).toBe(6);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("sk-session-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        operation: "chat",
      },
    });
  });
});
