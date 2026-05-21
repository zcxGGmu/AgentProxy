import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { runAgentProxyPrompt } from "../src/cli/run.js";
import { createOutputWriters } from "../src/logging/index.js";
import { openAgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const openSseResponses: ServerResponse[] = [];

function createMemorySink(): { chunks: string[]; write: (chunk: string) => boolean } {
  const chunks: string[] = [];

  return {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  };
}

async function createTestRoot(): Promise<{
  root: string;
  workspacePath: string;
  homeDir: string;
  configPath: string;
  storagePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-run-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const configPath = path.join(root, "agentproxy.json");
  const storagePath = path.join(root, "data", "agentproxy.sqlite3");
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(homeDir, { recursive: true }),
    mkdir(path.dirname(storagePath), { recursive: true }),
  ]);

  return {
    root,
    workspacePath,
    homeDir,
    configPath,
    storagePath,
  };
}

async function writeConfig(input: {
  configPath: string;
  workspacePath: string;
  storagePath: string;
  binary?: string;
  runtime?: {
    mode: "managed" | "attached";
    baseUrl?: string;
    port?: number;
  };
}): Promise<void> {
  await writeFile(
    input.configPath,
    `${JSON.stringify(
      {
        workspacePath: input.workspacePath,
        storage: {
          path: input.storagePath,
        },
        providers: {
          opencode: {
            enabled: true,
            binary: input.binary ?? "opencode",
            runtime: {
              mode: input.runtime?.mode ?? "attached",
              hostname: "127.0.0.1",
              port: input.runtime?.port ?? 4096,
              ...(input.runtime?.baseUrl === undefined ? {} : { baseUrl: input.runtime.baseUrl }),
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function runCli(input: {
  argv: string[];
  cwd: string;
  homeDir: string;
  env?: Record<string, string | undefined>;
  stdin?: AsyncIterable<string | Buffer>;
}): Promise<{ stdout: string; stderr: string; exitCode: string | number | undefined }> {
  const originalExitCode = process.exitCode;
  const stdout = createMemorySink();
  const stderr = createMemorySink();
  const program = createProgram({
    cwd: input.cwd,
    homeDir: input.homeDir,
    env: input.env ?? { PATH: "" },
    ...(input.stdin !== undefined ? { stdin: input.stdin } : {}),
    output: createOutputWriters({ stdout, stderr }),
  });

  try {
    process.exitCode = undefined;
    await program.parseAsync(["node", "agentproxy", ...input.argv]);

    return {
      stdout: stdout.chunks.join(""),
      stderr: stderr.chunks.join(""),
      exitCode: process.exitCode,
    };
  } finally {
    process.exitCode = originalExitCode;
  }
}

async function startFakeOpenCodeRunServer(
  input: { providerSessionId?: string; delta?: string; terminal?: "idle" | "error" | "none" } = {},
): Promise<{
  baseUrl: string;
  createBodies: unknown[];
  messageBodies: unknown[];
}> {
  const createBodies: unknown[] = [];
  const messageBodies: unknown[] = [];
  let eventResponse: ServerResponse | undefined;
  const providerSessionId = input.providerSessionId ?? "ses_cli_run";
  const delta = input.delta ?? "hello from OpenCode";
  const terminal = input.terminal ?? "idle";

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/session") {
      void readRequestJson(request).then((body) => {
        createBodies.push(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: providerSessionId,
            directory: url.searchParams.get("directory") ?? undefined,
            title: "CLI run session",
            time: {
              created: Date.parse("2026-05-21T10:00:00.000Z"),
              updated: Date.parse("2026-05-21T10:00:01.000Z"),
            },
          }),
        );
      });
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

    if (request.method === "POST" && url.pathname === `/session/${providerSessionId}/message`) {
      void readRequestJson(request).then((body) => {
        messageBodies.push(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ info: { id: "msg_cli_run" }, parts: [] }));

        if (eventResponse !== undefined) {
          writeSse(eventResponse, {
            id: "evt_cli_delta",
            type: "message.part.delta",
            properties: {
              sessionID: providerSessionId,
              messageID: "msg_cli_run",
              partID: "prt_text",
              field: "text",
              delta,
            },
          });
          if (terminal === "idle") {
            writeSse(eventResponse, {
              id: "evt_cli_idle",
              type: "session.idle",
              properties: {
                sessionID: providerSessionId,
              },
            });
          } else if (terminal === "error") {
            writeSse(eventResponse, {
              id: "evt_cli_error",
              type: "session.error",
              properties: {
                sessionID: providerSessionId,
                error: {
                  type: "OPENCODE_RUN_FAILED",
                  message: "provider failed with api_key=sk-error-secret",
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
    createBodies,
    messageBodies,
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

async function listenOnFreePort(): Promise<{ server: TcpServer; port: number }> {
  const server = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP server address.");
  }

  return {
    server,
    port: address.port,
  };
}

async function closeTcpServer(server: TcpServer): Promise<void> {
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

async function writeManagedRunBinary(input: {
  directory: string;
  logPath: string;
  providerSessionId: string;
}): Promise<string> {
  await mkdir(input.directory, { recursive: true });
  const binaryPath = path.join(input.directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const logPath = ${JSON.stringify(input.logPath)};
const providerSessionId = ${JSON.stringify(input.providerSessionId)};

if (args[0] === "--version") {
  console.log("OpenCode 1.16.0");
  process.exit(0);
}

if (args[0] !== "serve") {
  console.error("unexpected args " + args.join(" "));
  process.exit(64);
}

function readFlag(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function log(value) {
  if (logPath !== undefined) {
    appendFileSync(logPath, JSON.stringify(value) + "\\n", "utf8");
  }
}

log({
  type: "env",
  awsSecret: process.env.AWS_SECRET_ACCESS_KEY,
  hasPath: process.env.PATH !== undefined,
});

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
  }
  return body === "" ? undefined : JSON.parse(body);
}

let eventResponse;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/global/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/session") {
    readJson(request).then((body) => {
      log({ type: "create", body });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: providerSessionId,
        directory: url.searchParams.get("directory") ?? undefined,
        title: "Managed CLI run session",
        time: {
          created: Date.parse("2026-05-21T11:00:00.000Z"),
          updated: Date.parse("2026-05-21T11:00:01.000Z")
        }
      }));
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/event") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache"
    });
    response.write(": connected\\n\\n");
    eventResponse = response;
    return;
  }

  if (request.method === "POST" && url.pathname === "/session/" + providerSessionId + "/message") {
    readJson(request).then((body) => {
      log({ type: "message", body });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ info: { id: "msg_managed" }, parts: [] }));
      if (eventResponse !== undefined) {
        eventResponse.write("data: " + JSON.stringify({
          id: "evt_managed_delta",
          type: "message.part.delta",
          properties: {
            sessionID: providerSessionId,
            messageID: "msg_managed",
            partID: "prt_text",
            field: "text",
            delta: "managed hello"
          }
        }) + "\\n\\n");
        eventResponse.write("data: " + JSON.stringify({
          id: "evt_managed_idle",
          type: "session.idle",
          properties: {
            sessionID: providerSessionId
          }
        }) + "\\n\\n");
      }
    });
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

const hostname = readFlag("--hostname") ?? "127.0.0.1";
const port = Number(readFlag("--port") ?? "4096");
server.listen(port, hostname);

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref();
});
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function readJsonLines(filePath: string): Promise<unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
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

describe("agentproxy run CLI", () => {
  it("runs a prompt against a configured attached OpenCode runtime in human mode", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      delta: "\u001B[31mhello api_key=sk-run-secret\u001B[0m\rStatus: spoofed",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: [
        "run",
        "scan api_key=sk-prompt-secret",
        "--model",
        "anthropic/claude-sonnet-4-5",
        "--config",
        configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Session: apx_");
    expect(result.stdout).toContain("Provider session: ses_cli_run");
    expect(result.stdout).toContain("hello api_key=[REDACTED]");
    expect(result.stdout).not.toContain("\u001B[31m");
    expect(result.stdout).not.toContain("\rStatus: spoofed");
    expect(result.stdout).toContain("Status: completed");
    expect(result.stdout).not.toContain("sk-run-secret");
    expect(fakeServer.createBodies).toEqual([{}]);
    expect(fakeServer.messageBodies).toEqual([
      {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5",
        },
        parts: [
          {
            type: "text",
            text: "scan api_key=sk-prompt-secret",
          },
        ],
      },
    ]);

    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      const sessions = storage.sessions.list({ includeTombstones: true });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        providerId: "opencode",
        providerSessionId: "ses_cli_run",
        workspacePath,
        status: "completed",
      });
      expect(JSON.stringify(sessions)).not.toContain("sk-prompt-secret");
      expect(
        JSON.stringify(storage.sessionEvents.listBySessionId(sessions[0]?.id ?? "")),
      ).not.toContain("sk-run-secret");
    } finally {
      storage.close();
    }
  });

  it("emits exactly one redacted JSON report on stdout", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      providerSessionId: "ses_cli_json",
      delta: "json api_key=sk-json-secret",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "json prompt", "--json", "--config", configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(`${result.stdout.trim()}\n`).toBe(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerId: "opencode",
      providerSessionId: "ses_cli_json",
      status: "completed",
      runtime: {
        source: "config",
      },
    });
    expect(report.sessionId).toMatch(/^apx_/u);
    expect(report.events.map((event: { type: string }) => event.type)).toEqual([
      "session.status_changed",
      "message.delta",
      "session.status_changed",
      "session.completed",
    ]);
    expect(report.events.find((event: { type: string }) => event.type === "message.delta")).toEqual(
      {
        type: "message.delta",
        role: "assistant",
        messageId: "msg_cli_run",
        deltaBytes: 27,
      },
    );
    expect(JSON.stringify(report)).not.toContain("api_key=");
    expect(JSON.stringify(report)).not.toContain("sk-json-secret");
  });

  it("returns a non-zero exit code when the provider reports a failed session", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      providerSessionId: "ses_cli_failed",
      delta: "partial output",
      terminal: "error",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "fail prompt", "--json", "--config", configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      providerSessionId: "ses_cli_failed",
      status: "failed",
    });
    expect(report.events.at(-1)).toEqual({
      type: "session.completed",
      status: "failed",
    });
    expect(JSON.stringify(report)).not.toContain("sk-error-secret");
  });

  it("fails timed-out runs instead of treating an aborted event stream as completed", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      providerSessionId: "ses_cli_timeout",
      terminal: "none",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    await expect(
      runAgentProxyPrompt({
        providerId: "opencode",
        prompt: "slow prompt",
        cwd: workspacePath,
        homeDir,
        cli: {
          configPath,
        },
        timeoutMs: 10,
        collectEvents: false,
      }),
    ).rejects.toMatchObject({
      code: "EVENT_STREAM_INTERRUPTED",
      operation: "run",
    });

    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      const session = storage.sessions.getByProviderSessionId("opencode", "ses_cli_timeout");
      expect(session).toMatchObject({
        status: "failed",
        lastError: "agentproxy run timed out.",
      });
    } finally {
      storage.close();
    }
  });

  it("reads prompt text from stdin when the positional prompt is omitted", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      providerSessionId: "ses_cli_stdin",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "--json", "--config", configPath],
      stdin: Readable.from(["prompt from stdin"]),
    });

    expect(result.exitCode).toBe(0);
    expect(fakeServer.messageBodies).toEqual([
      {
        parts: [
          {
            type: "text",
            text: "prompt from stdin",
          },
        ],
      },
    ]);
  });

  it("fails with CONFIG_INVALID when no prompt is provided", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "--config", configPath],
      stdin: Readable.from([]),
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CONFIG_INVALID");
    expect(result.stderr).toContain("A prompt is required");
  });

  it("rejects oversized stdin prompts before opening runtime state", async () => {
    const { workspacePath, homeDir } = await createTestRoot();
    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run"],
      stdin: Readable.from(["x".repeat(1024 * 1024 + 1)]),
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CONFIG_INVALID");
    expect(result.stderr).toContain("prompt exceeds");
  });

  it("rejects invalid model before creating a provider session", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
        baseUrl: fakeServer.baseUrl,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "hello", "--model", "invalid-model", "--config", configPath],
      stdin: Readable.from([]),
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CONFIG_INVALID");
    expect(fakeServer.createBodies).toEqual([]);
    expect(fakeServer.messageBodies).toEqual([]);
    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      expect(storage.sessions.list({ includeTombstones: true })).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("reports the actual registry runtime mode instead of the configured mode", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const fakeServer = await startFakeOpenCodeRunServer({
      providerSessionId: "ses_cli_registry",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "managed",
      },
    });
    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      storage.runtimes.upsert({
        id: "runtime_attached_registry",
        providerId: "opencode",
        mode: "attached",
        status: "healthy",
        baseUrl: fakeServer.baseUrl,
        hostname: "127.0.0.1",
        port: Number(new URL(fakeServer.baseUrl).port),
        workspacePath,
        startedAt: "2026-05-21T12:00:00.000Z",
        metadata: {},
      });
    } finally {
      storage.close();
    }

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "hello", "--json", "--config", configPath],
      stdin: Readable.from([]),
    });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.runtime).toMatchObject({
      source: "registry",
      mode: "attached",
      runtimeId: "runtime_attached_registry",
    });
  });

  it("fails with a stable runtime error when attached mode has no runtime URL", async () => {
    const { workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      runtime: {
        mode: "attached",
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "hello", "--config", configPath],
      stdin: Readable.from([]),
    });

    expect(result.exitCode).toBe(9);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RUNTIME_HEALTH_FAILED");
  });

  it("starts and stops a managed runtime for one-shot run when no runtime URL exists", async () => {
    const { root, workspacePath, homeDir, configPath, storagePath } = await createTestRoot();
    const freePort = await listenOnFreePort();
    await closeTcpServer(freePort.server);
    const logPath = path.join(root, "managed-run.log");
    const fakeBinary = await writeManagedRunBinary({
      directory: path.join(root, "bin"),
      logPath,
      providerSessionId: "ses_cli_managed",
    });
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary: fakeBinary,
      runtime: {
        mode: "managed",
        port: freePort.port,
      },
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["run", "managed prompt", "--config", configPath],
      env: {
        PATH: process.env.PATH,
        FAKE_OPENCODE_RUN_LOG: logPath,
        AWS_SECRET_ACCESS_KEY: "aws-secret-must-not-reach-provider",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("managed hello");
    expect(await readJsonLines(logPath)).toContainEqual({
      type: "message",
      body: {
        parts: [
          {
            type: "text",
            text: "managed prompt",
          },
        ],
      },
    });
    expect(JSON.stringify(await readJsonLines(logPath))).not.toContain(
      "aws-secret-must-not-reach-provider",
    );

    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      expect(storage.runtimes.list()).toContainEqual(
        expect.objectContaining({
          providerId: "opencode",
          mode: "managed",
          status: "stopped",
        }),
      );
    } finally {
      storage.close();
    }
  });

  it("leaves later Phase 5 business commands as planned placeholders", async () => {
    const { workspacePath, homeDir } = await createTestRoot();

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["sessions", "export", "apx_123"],
      stdin: Readable.from([]),
    });

    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CAPABILITY_UNSUPPORTED");
    expect(result.stderr).toContain("agentproxy sessions export is planned");
  });
});
