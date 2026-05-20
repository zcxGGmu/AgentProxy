import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS,
  OpenCodeRuntimeDiagnostics,
  RuntimeRegistry,
} from "../src/runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const openResponses: ServerResponse[] = [];

async function createTestContext(): Promise<{
  storage: AgentProxyStorage;
  root: string;
  workspacePath: string;
  binaryDirectory: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-runtime-diagnostics-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  const binaryDirectory = path.join(root, "bin");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(binaryDirectory, { recursive: true }),
  ]);

  return {
    storage: openAgentProxyStorage({ databasePath: path.join(dataDir, "agentproxy.sqlite3") }),
    root,
    workspacePath,
    binaryDirectory,
  };
}

async function writeVersionOnlyOpenCodeBinary(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const binaryPath = path.join(directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
if (process.argv[2] === "--version") {
  console.log("OpenCode 1.15.5");
  process.exit(0);
}

console.error("serve is not available for this fake binary");
process.exit(64);
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function writeManagedSmokeOpenCodeBinary(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const binaryPath = path.join(directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
import { createServer } from "node:http";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("OpenCode 1.15.5");
  process.exit(0);
}

if (args[0] !== "serve") {
  console.error("unexpected args: " + args.join(" "));
  process.exit(64);
}

const hostname = readFlag(args, "--hostname") ?? "127.0.0.1";
const port = Number(readFlag(args, "--port") ?? "4096");

const server = createServer((request, response) => {
  if (request.url === "/global/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ healthy: true, version: "1.15.5" }));
    return;
  }

  if (request.url === "/event") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    response.write('data: {"type":"session.status","properties":{"status":"idle"}}\\n\\n');
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, hostname);

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref();
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref();
});

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index === -1 ? undefined : values[index + 1];
}
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function startFakeOpenCodeServer(): Promise<{ baseUrl: string; port: number }> {
  const server = createServer((request, response) => {
    if (request.url === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.15.5" }));
      return;
    }

    if (request.url === "/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      response.write('data: {"type":"session.status","properties":{"status":"idle"}}\\n\\n');
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
    port: address.port,
  };
}

async function startFakeHangingHealthServer(): Promise<{ baseUrl: string; port: number }> {
  const server = createServer((request, response) => {
    if (request.url === "/global/health") {
      openResponses.push(response);
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"healthy":');
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
    port: address.port,
  };
}

async function startFakeEventContentTypeServer(
  contentType: string,
): Promise<{ baseUrl: string; port: number }> {
  const server = createServer((request, response) => {
    if (request.url === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.15.5" }));
      return;
    }

    if (request.url === "/event") {
      response.writeHead(200, {
        "content-type": contentType,
        "cache-control": "no-cache",
      });
      response.end("not really sse");
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
    port: address.port,
  };
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
    throw new Error("Expected TCP server to listen on a TCP address.");
  }

  return {
    server,
    port: address.port,
  };
}

async function closeTcpServer(server: TcpServer): Promise<void> {
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

afterEach(async () => {
  for (const response of openResponses.splice(0)) {
    response.destroy();
  }
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCode runtime diagnostics", () => {
  it("reports missing OpenCode binary as a failed diagnostic check without throwing", async () => {
    const { storage, root, workspacePath } = await createTestContext();
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      storage,
      binary: path.join(root, "missing-opencode"),
      cwd: workspacePath,
    });

    const report = await diagnostics.run({
      workspacePath,
    });

    const binaryCheck = report.checks.find(
      (check) => check.id === OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary,
    );
    expect(report.ok).toBe(false);
    expect(binaryCheck).toMatchObject({
      status: "failed",
      errorCode: "PROVIDER_UNAVAILABLE",
      providerId: "opencode",
    });

    storage.close();
  });

  it("checks a registered runtime health and event stream endpoint", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const fakeOpenCode = await startFakeOpenCodeServer();
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_registered_healthy",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
      metadata: {
        source: "test",
      },
    });

    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 500,
    });

    const report = await diagnostics.run({
      workspacePath,
    });

    expect(report.ok).toBe(true);
    expect(report.gate3.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary,
          status: "passed",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.registry,
          status: "passed",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health,
          status: "passed",
          runtimeId: "runtime_registered_healthy",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream,
          status: "passed",
          runtimeId: "runtime_registered_healthy",
        }),
      ]),
    );
    expect(report.gate3.capabilities).toMatchObject({
      binary: true,
      registry: true,
      runtimeConnect: true,
      eventStream: true,
      runtimeStart: false,
      runtimeStop: false,
    });

    storage.close();
  });

  it("runs a managed runtime smoke check and passes Gate 3", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeManagedSmokeOpenCodeBinary(binaryDirectory);
    const { server, port } = await listenOnFreePort();
    await closeTcpServer(server);
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      storage,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 500,
      managedHealthTimeoutMs: 1000,
      managedHealthPollIntervalMs: 25,
      managedStopTimeoutMs: 1000,
    });

    const report = await diagnostics.run({
      workspacePath,
      includeManagedSmoke: true,
      managedRuntimeId: "runtime_gate3_smoke",
      managedPort: port,
    });

    expect(report.ok).toBe(true);
    expect(report.gate3.passed).toBe(true);
    expect(report.gate3.capabilities).toEqual({
      binary: true,
      registry: true,
      runtimeStart: true,
      runtimeConnect: true,
      eventStream: true,
      runtimeStop: true,
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStart,
          status: "passed",
          runtimeId: "runtime_gate3_smoke",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health,
          status: "passed",
          runtimeId: "runtime_gate3_smoke",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream,
          status: "passed",
          runtimeId: "runtime_gate3_smoke",
        }),
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStop,
          status: "passed",
          runtimeId: "runtime_gate3_smoke",
        }),
      ]),
    );
    expect(storage.runtimes.get("runtime_gate3_smoke")).toMatchObject({
      mode: "managed",
      status: "stopped",
    });

    storage.close();
  });

  it("sanitizes URL credentials and query secrets in diagnostic output", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_secret_url",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: "http://username:password@127.0.0.1:1/path?token=super-secret-token#frag",
      hostname: "127.0.0.1",
      port: 1,
      workspacePath,
      metadata: {
        authorization: "Bearer super-secret-token",
      },
    });
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 100,
    });

    const report = await diagnostics.run({
      workspacePath,
    });
    const serializedReport = JSON.stringify(report);

    expect(report.ok).toBe(false);
    expect(serializedReport).not.toContain("username:password");
    expect(serializedReport).not.toContain("super-secret-token");
    expect(serializedReport).not.toContain("?token=");
    expect(serializedReport).toContain("http://127.0.0.1:1/path");

    storage.close();
  });

  it("fails an explicitly requested runtime that has no base URL", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_missing_base_url",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      workspacePath,
      metadata: {
        source: "test",
      },
    });
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 100,
    });

    const report = await diagnostics.run({
      runtimeId: "runtime_missing_base_url",
      workspacePath,
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.registry,
          status: "failed",
          errorCode: "RUNTIME_HEALTH_FAILED",
          runtimeId: "runtime_missing_base_url",
          details: expect.objectContaining({
            failureReason: "missing_base_url",
          }),
        }),
      ]),
    );

    storage.close();
  });

  it("times out health response bodies that never finish", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const fakeOpenCode = await startFakeHangingHealthServer();
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_hanging_health",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
      metadata: {
        source: "test",
      },
    });
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 50,
    });

    const report = await diagnostics.run({
      runtimeId: "runtime_hanging_health",
      workspacePath,
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health,
          status: "failed",
          errorCode: "RUNTIME_HEALTH_FAILED",
          runtimeId: "runtime_hanging_health",
        }),
      ]),
    );

    storage.close();
  });

  it("requires the exact text/event-stream media type", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const fakeOpenCode = await startFakeEventContentTypeServer("text/event-streaming");
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_wrong_sse_content_type",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
      metadata: {
        source: "test",
      },
    });
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 100,
    });

    const report = await diagnostics.run({
      runtimeId: "runtime_wrong_sse_content_type",
      workspacePath,
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream,
          status: "failed",
          errorCode: "EVENT_STREAM_INTERRUPTED",
          runtimeId: "runtime_wrong_sse_content_type",
          details: expect.objectContaining({
            failureReason: "unexpected_content_type",
            contentType: "text/event-streaming",
          }),
        }),
      ]),
    );

    storage.close();
  });

  it("redacts unexpected error messages", async () => {
    const { storage, workspacePath, binaryDirectory } = await createTestContext();
    const fakeBinary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const fakeOpenCode = await startFakeOpenCodeServer();
    const registry = new RuntimeRegistry({ storage });
    registry.register({
      id: "runtime_fetch_secret_error",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
      metadata: {
        source: "test",
      },
    });
    const diagnostics = new OpenCodeRuntimeDiagnostics({
      registry,
      binary: fakeBinary,
      cwd: workspacePath,
      requestTimeoutMs: 100,
      fetchImplementation: async () => {
        throw new Error(
          "Authorization: Bearer super-secret-token for http://user:pass@127.0.0.1:1?token=super-secret-token",
        );
      },
    });

    const report = await diagnostics.run({
      runtimeId: "runtime_fetch_secret_error",
      workspacePath,
    });
    const serializedReport = JSON.stringify(report);

    expect(report.ok).toBe(false);
    expect(serializedReport).not.toContain("super-secret-token");
    expect(serializedReport).not.toContain("user:pass");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health,
          message: "OpenCode runtime health request failed.",
        }),
      ]),
    );

    storage.close();
  });
});
