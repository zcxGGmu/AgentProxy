import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  OPENCODE_MANAGED_RUNTIME_METADATA_KEY,
  OpenCodeManagedRuntimeManager,
} from "../src/runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const managers: OpenCodeManagedRuntimeManager[] = [];

async function createTestContext(): Promise<{
  storage: AgentProxyStorage;
  workspacePath: string;
  fakeBinary: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-managed-runtime-test-"));
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
    fakeBinary: await writeFakeOpenCodeBinary(path.join(root, "bin")),
  };
}

function createManager(options: {
  storage: AgentProxyStorage;
  fakeBinary: string;
  runtimeId?: string;
  env?: Record<string, string | undefined>;
}): OpenCodeManagedRuntimeManager {
  const manager = new OpenCodeManagedRuntimeManager({
    storage: options.storage,
    binary: options.fakeBinary,
    env: {
      ...(options.env ?? {}),
    },
    healthTimeoutMs: 800,
    healthPollIntervalMs: 25,
    stopTimeoutMs: 800,
    runtimeIdFactory: () => options.runtimeId ?? "runtime_managed_test",
  });
  managers.push(manager);
  return manager;
}

async function writeFakeOpenCodeBinary(directory: string): Promise<string> {
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
const behavior = process.env.FAKE_OPENCODE_BEHAVIOR ?? "healthy";

if (behavior === "exit-immediately") {
  process.exit(Number(process.env.FAKE_OPENCODE_EXIT_CODE ?? "42"));
}

const server = createServer((request, response) => {
  if (request.url === "/global/health" && behavior !== "never-healthy") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }), () => {
      if (behavior === "exit-on-health") {
        process.exit(Number(process.env.FAKE_OPENCODE_EXIT_CODE ?? "88"));
      }
    });
    return;
  }

  response.writeHead(503, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false }));
});

server.listen(port, hostname);

if (behavior === "exit-after-health") {
  setTimeout(() => process.exit(Number(process.env.FAKE_OPENCODE_EXIT_CODE ?? "77")), Number(process.env.FAKE_OPENCODE_EXIT_AFTER_MS ?? "80"));
}

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

async function listenOnFreePort(): Promise<{ server: Server; port: number }> {
  const server = createServer();
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

async function waitFor<T>(
  callback: () => T | undefined,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const value = callback();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for condition.");
}

afterEach(async () => {
  await Promise.all(
    managers.splice(0).map(async (manager) => {
      await manager.dispose();
    }),
  );
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCode managed runtime manager", () => {
  it("starts opencode serve on 127.0.0.1 and marks the managed runtime healthy", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_healthy",
    });

    const runtime = await manager.startManagedRuntime({
      workspacePath,
      port,
    });

    expect(runtime).toMatchObject({
      id: "runtime_healthy",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      hostname: "127.0.0.1",
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      workspacePath,
    });
    expect(runtime.pid).toEqual(expect.any(Number));
    expect(storage.runtimes.get("runtime_healthy")).toMatchObject({
      status: "healthy",
      pid: runtime.pid,
    });
    expect(runtime.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY]).toMatchObject({
      ownedBy: "agentproxy",
      healthPath: "/global/health",
      requestedPort: port,
      selectedPort: port,
      portWasOccupied: false,
      binary: {
        version: "1.15.5",
      },
    });

    await manager.stopManagedRuntime(runtime.id);
    storage.close();
  });

  it("chooses a free port when the requested port is occupied", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const occupied = await listenOnFreePort();
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_port_conflict",
    });

    const runtime = await manager.startManagedRuntime({
      workspacePath,
      port: occupied.port,
    });

    expect(runtime.port).not.toBe(occupied.port);
    expect(runtime.hostname).toBe("127.0.0.1");
    expect(runtime.status).toBe("healthy");
    expect(occupied.server.listening).toBe(true);
    expect(runtime.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY]).toMatchObject({
      requestedPort: occupied.port,
      selectedPort: runtime.port,
      portWasOccupied: true,
    });

    await manager.stopManagedRuntime(runtime.id);
    await closeServer(occupied.server);
    storage.close();
  });

  it("rejects duplicate active runtime ids without losing ownership of the running child", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_duplicate",
    });
    const runtime = await manager.startManagedRuntime({
      workspacePath,
      port,
    });

    await expect(
      manager.startManagedRuntime({
        id: runtime.id,
        workspacePath,
        port,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.start",
    });

    expect(storage.runtimes.get(runtime.id)).toMatchObject({
      id: runtime.id,
      mode: "managed",
      status: "healthy",
      pid: runtime.pid,
    });

    const stopped = await manager.stopManagedRuntime(runtime.id);
    expect(stopped).toMatchObject({
      id: runtime.id,
      status: "stopped",
    });

    storage.close();
  });

  it("rejects concurrent duplicate runtime ids without losing ownership of the winner", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_concurrent_duplicate",
    });

    const results = await Promise.allSettled([
      manager.startManagedRuntime({
        id: "runtime_concurrent_duplicate",
        workspacePath,
        port,
      }),
      manager.startManagedRuntime({
        id: "runtime_concurrent_duplicate",
        workspacePath,
        port,
      }),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof manager.startManagedRuntime>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.start",
    });

    const winner = fulfilled[0]?.value;
    expect(winner).toMatchObject({
      id: "runtime_concurrent_duplicate",
      status: "healthy",
    });
    expect(storage.runtimes.get("runtime_concurrent_duplicate")).toMatchObject({
      id: "runtime_concurrent_duplicate",
      status: "healthy",
      pid: winner?.pid,
    });

    const stopped = await manager.stopManagedRuntime("runtime_concurrent_duplicate");
    expect(stopped).toMatchObject({
      id: "runtime_concurrent_duplicate",
      status: "stopped",
    });

    storage.close();
  });

  it("does not overwrite an active attached runtime when starting managed with the same id", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_unused",
    });
    manager.registry.register({
      id: "runtime_attached_collision",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      workspacePath,
      baseUrl: "http://127.0.0.1:5096",
      hostname: "127.0.0.1",
      port: 5096,
      pid: 12345,
      metadata: {
        source: "server-url",
      },
    });

    await expect(
      manager.startManagedRuntime({
        id: "runtime_attached_collision",
        workspacePath,
        port,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.start",
    });

    expect(storage.runtimes.get("runtime_attached_collision")).toMatchObject({
      id: "runtime_attached_collision",
      mode: "attached",
      status: "attached",
      pid: 12345,
    });

    storage.close();
  });

  it("marks runtime failed when opencode serve exits before health succeeds", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_start_exit",
      env: {
        FAKE_OPENCODE_BEHAVIOR: "exit-immediately",
        FAKE_OPENCODE_EXIT_CODE: "42",
      },
    });

    await expect(
      manager.startManagedRuntime({
        workspacePath,
        port,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.start",
    });

    expect(storage.runtimes.get("runtime_start_exit")).toMatchObject({
      status: "failed",
      mode: "managed",
      port,
    });
    expect(
      storage.runtimes.get("runtime_start_exit")?.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY],
    ).toMatchObject({
      failureReason: "process_exit_before_health",
      exit: {
        code: 42,
      },
    });

    storage.close();
  });

  it("marks runtime failed and terminates the child when health times out", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_health_timeout",
      env: {
        FAKE_OPENCODE_BEHAVIOR: "never-healthy",
      },
    });

    await expect(
      manager.startManagedRuntime({
        workspacePath,
        port,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_HEALTH_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.waitForHealth",
    });

    expect(storage.runtimes.get("runtime_health_timeout")).toMatchObject({
      status: "failed",
      mode: "managed",
      port,
    });
    expect(
      storage.runtimes.get("runtime_health_timeout")?.metadata[
        OPENCODE_MANAGED_RUNTIME_METADATA_KEY
      ],
    ).toMatchObject({
      failureReason: "health_timeout",
    });

    storage.close();
  });

  it("does not return healthy when the child exits immediately after health responds", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_exit_on_health",
      env: {
        FAKE_OPENCODE_BEHAVIOR: "exit-on-health",
        FAKE_OPENCODE_EXIT_CODE: "88",
      },
    });

    await expect(
      manager.startManagedRuntime({
        workspacePath,
        port,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.managedRuntime.start",
    });

    expect(storage.runtimes.get("runtime_exit_on_health")).toMatchObject({
      id: "runtime_exit_on_health",
      mode: "managed",
      status: "failed",
    });
    expect(
      storage.runtimes.get("runtime_exit_on_health")?.metadata[
        OPENCODE_MANAGED_RUNTIME_METADATA_KEY
      ],
    ).toMatchObject({
      failureReason: "process_exit_before_health",
      exit: {
        code: 88,
        expected: false,
      },
    });

    storage.close();
  });

  it("stops only an owned managed runtime and records stopped status", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_stop",
    });
    const runtime = await manager.startManagedRuntime({
      workspacePath,
      port,
    });

    const stopped = await manager.stopManagedRuntime(runtime.id);

    expect(stopped).toMatchObject({
      id: "runtime_stop",
      mode: "managed",
      status: "stopped",
      port,
    });
    expect(stopped.stoppedAt).toEqual(expect.any(String));
    expect(stopped.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY]).toMatchObject({
      stopRequested: true,
      exit: {
        expected: true,
      },
    });

    storage.close();
  });

  it("does not stop or mutate attached runtimes", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_unused",
    });
    manager.registry.register({
      id: "runtime_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      workspacePath,
      pid: 12345,
      metadata: {
        source: "server-url",
      },
    });

    await expect(manager.stopManagedRuntime("runtime_attached")).rejects.toBeInstanceOf(
      AgentProxyError,
    );

    expect(storage.runtimes.get("runtime_attached")).toMatchObject({
      mode: "attached",
      status: "attached",
      pid: 12345,
    });

    storage.close();
  });

  it("updates runtime status when a healthy child exits unexpectedly", async () => {
    const { storage, workspacePath, fakeBinary } = await createTestContext();
    const { server, port } = await listenOnFreePort();
    await closeServer(server);
    const manager = createManager({
      storage,
      fakeBinary,
      runtimeId: "runtime_unexpected_exit",
      env: {
        FAKE_OPENCODE_BEHAVIOR: "exit-after-health",
        FAKE_OPENCODE_EXIT_CODE: "77",
        FAKE_OPENCODE_EXIT_AFTER_MS: "200",
      },
    });

    await manager.startManagedRuntime({
      workspacePath,
      port,
    });

    const failed = await waitFor(() => {
      const runtime = storage.runtimes.get("runtime_unexpected_exit");
      return runtime?.status === "failed" ? runtime : undefined;
    });

    expect(failed).toMatchObject({
      id: "runtime_unexpected_exit",
      mode: "managed",
      status: "failed",
      port,
    });
    expect(failed.metadata[OPENCODE_MANAGED_RUNTIME_METADATA_KEY]).toMatchObject({
      failureReason: "process_exit",
      exit: {
        code: 77,
        expected: false,
      },
    });

    storage.close();
  });
});
