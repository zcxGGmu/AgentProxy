import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  OPENCODE_ATTACHED_RUNTIME_METADATA_KEY,
  OpenCodeAttachedRuntimeManager,
} from "../src/runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];

async function createTestContext(): Promise<{
  storage: AgentProxyStorage;
  workspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-attached-runtime-test-"));
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
  };
}

function createManager(options: {
  storage: AgentProxyStorage;
  runtimeId?: string;
  onWarning?: ConstructorParameters<typeof OpenCodeAttachedRuntimeManager>[0]["onWarning"];
}): OpenCodeAttachedRuntimeManager {
  return new OpenCodeAttachedRuntimeManager({
    storage: options.storage,
    healthRequestTimeoutMs: 500,
    runtimeIdFactory: () => options.runtimeId ?? "runtime_attached_test",
    ...(options.onWarning !== undefined ? { onWarning: options.onWarning } : {}),
  });
}

async function startFakeOpenCodeServer(
  options: { host?: string; responseStatus?: number; responseBody?: unknown } = {},
): Promise<{ server: Server; baseUrl: string; port: number }> {
  const host = options.host ?? "127.0.0.1";
  const responseStatus = options.responseStatus ?? 200;
  const responseBody = options.responseBody ?? { healthy: true, version: "1.15.5" };
  const server = createServer((request, response) => {
    if (request.url === "/global/health") {
      response.writeHead(responseStatus, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
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
    server,
    baseUrl: `http://${host}:${address.port}`,
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

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCode attached runtime manager", () => {
  it("attaches an explicit server URL after OpenCode health succeeds", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_explicit_attached",
    });

    const runtime = await manager.attachRuntime({
      serverUrl: `${fakeOpenCode.baseUrl}/`,
      workspacePath,
    });

    expect(runtime).toMatchObject({
      id: "runtime_explicit_attached",
      providerId: "opencode",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
    });
    expect(runtime.pid).toBeUndefined();
    expect(runtime.metadata[OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]).toMatchObject({
      source: "server-url",
      serverUrl: fakeOpenCode.baseUrl,
      healthPath: "/global/health",
      health: {
        healthy: true,
        version: "1.15.5",
      },
      warnings: [],
    });

    storage.close();
  });

  it("reattaches a healthy OpenCode server discovered from the registry", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_unused",
    });
    manager.registry.register({
      id: "runtime_registry_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      baseUrl: fakeOpenCode.baseUrl,
      hostname: "127.0.0.1",
      port: fakeOpenCode.port,
      workspacePath,
      metadata: {
        existing: "metadata",
      },
    });

    const runtime = await manager.attachFromRegistry({ workspacePath });

    expect(runtime).toMatchObject({
      id: "runtime_registry_attached",
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
      workspacePath,
      metadata: {
        existing: "metadata",
      },
    });
    expect(runtime.metadata[OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]).toMatchObject({
      source: "registry",
      health: {
        healthy: true,
        version: "1.15.5",
      },
    });

    storage.close();
  });

  it("rejects explicit attached runtime ids that collide with active managed records", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_unused",
    });
    manager.registry.register({
      id: "runtime_managed_collision",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      baseUrl: "http://127.0.0.1:4096",
      hostname: "127.0.0.1",
      port: 4096,
      pid: 12345,
      workspacePath,
      metadata: {
        owner: "managed",
      },
    });

    await expect(
      manager.attachRuntime({
        id: "runtime_managed_collision",
        serverUrl: fakeOpenCode.baseUrl,
        workspacePath,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.attach",
    });

    expect(storage.runtimes.get("runtime_managed_collision")).toMatchObject({
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      pid: 12345,
      metadata: {
        owner: "managed",
      },
    });

    storage.close();
  });

  it("rejects concurrent explicit attachments with the same runtime id", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_unused",
    });

    const results = await Promise.allSettled([
      manager.attachRuntime({
        id: "runtime_concurrent_attached",
        serverUrl: fakeOpenCode.baseUrl,
        workspacePath,
      }),
      manager.attachRuntime({
        id: "runtime_concurrent_attached",
        serverUrl: fakeOpenCode.baseUrl,
        workspacePath,
      }),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof manager.attachRuntime>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: "RUNTIME_START_FAILED",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.attach",
    });
    expect(storage.runtimes.get("runtime_concurrent_attached")).toMatchObject({
      mode: "attached",
      status: "healthy",
      baseUrl: fakeOpenCode.baseUrl,
    });

    storage.close();
  });

  it("rejects a health endpoint that does not look like OpenCode", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeServer = await startFakeOpenCodeServer({
      responseBody: { ok: true },
    });
    const manager = createManager({
      storage,
      runtimeId: "runtime_not_opencode",
    });

    await expect(
      manager.attachRuntime({
        serverUrl: fakeServer.baseUrl,
        workspacePath,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_HEALTH_FAILED",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.healthCheck",
    });
    expect(storage.runtimes.get("runtime_not_opencode")).toMatchObject({
      mode: "attached",
      status: "failed",
      baseUrl: fakeServer.baseUrl,
    });
    expect(
      storage.runtimes.get("runtime_not_opencode")?.metadata[
        OPENCODE_ATTACHED_RUNTIME_METADATA_KEY
      ],
    ).toMatchObject({
      failureReason: "unexpected_health_response",
    });

    storage.close();
  });

  it("does not attach successfully when the signal is already aborted", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_pre_aborted",
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.attachRuntime({
        serverUrl: fakeOpenCode.baseUrl,
        workspacePath,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "RUNTIME_HEALTH_FAILED",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.healthCheck",
    });
    expect(storage.runtimes.get("runtime_pre_aborted")).toBeUndefined();

    storage.close();
  });

  it("records and emits a warning for non-localhost attached servers", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer({ host: "0.0.0.0" });
    const warnings: unknown[] = [];
    const manager = createManager({
      storage,
      runtimeId: "runtime_remote_warning",
      onWarning: (warning) => warnings.push(warning),
    });

    const runtime = await manager.attachRuntime({
      serverUrl: `${fakeOpenCode.baseUrl}?token=secret-token-value`,
      workspacePath,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: "NON_LOCALHOST_ATTACHED_RUNTIME",
      hostname: "0.0.0.0",
      serverUrl: fakeOpenCode.baseUrl,
    });
    expect(JSON.stringify(warnings)).not.toContain("secret-token-value");
    expect(runtime.metadata[OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]).toMatchObject({
      warnings: [
        {
          code: "NON_LOCALHOST_ATTACHED_RUNTIME",
          hostname: "0.0.0.0",
          serverUrl: fakeOpenCode.baseUrl,
        },
      ],
    });
    expect(JSON.stringify(runtime.metadata)).not.toContain("secret-token-value");

    storage.close();
  });

  it("stopping an attached runtime only detaches local metadata", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_detach_only",
    });
    const runtime = await manager.attachRuntime({
      serverUrl: fakeOpenCode.baseUrl,
      workspacePath,
    });

    const detached = await manager.stopAttachedRuntime(runtime.id);

    expect(detached).toMatchObject({
      id: "runtime_detach_only",
      mode: "attached",
      status: "detached",
      baseUrl: fakeOpenCode.baseUrl,
    });
    expect(detached.stoppedAt).toEqual(expect.any(String));
    expect(detached.metadata[OPENCODE_ATTACHED_RUNTIME_METADATA_KEY]).toMatchObject({
      stopAction: "detach_only",
      stopRequested: true,
    });

    const response = await fetch(`${fakeOpenCode.baseUrl}/global/health`);
    expect(response.ok).toBe(true);
    expect(await response.json()).toMatchObject({
      healthy: true,
      version: "1.15.5",
    });

    storage.close();
  });

  it("does not detach attached runtime records for other providers", async () => {
    const { storage, workspacePath } = await createTestContext();
    const manager = createManager({
      storage,
      runtimeId: "runtime_unused",
    });
    manager.registry.register({
      id: "runtime_other_provider",
      providerId: "mock",
      mode: "attached",
      status: "healthy",
      baseUrl: "http://127.0.0.1:9999",
      hostname: "127.0.0.1",
      port: 9999,
      workspacePath,
      metadata: {
        source: "mock",
      },
    });

    await expect(manager.stopAttachedRuntime("runtime_other_provider")).rejects.toMatchObject({
      code: "CAPABILITY_UNSUPPORTED",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.stop",
    });

    expect(storage.runtimes.get("runtime_other_provider")).toMatchObject({
      providerId: "mock",
      mode: "attached",
      status: "healthy",
    });

    storage.close();
  });

  it("rejects attached server URLs with credentials without leaking the secret", async () => {
    const { storage, workspacePath } = await createTestContext();
    const fakeOpenCode = await startFakeOpenCodeServer();
    const manager = createManager({
      storage,
      runtimeId: "runtime_reject_credentials",
    });

    await expect(
      manager.attachRuntime({
        serverUrl: `http://user:secret-token-value@127.0.0.1:${fakeOpenCode.port}`,
        workspacePath,
      }),
    ).rejects.toBeInstanceOf(AgentProxyError);

    try {
      await manager.attachRuntime({
        serverUrl: `http://user:secret-token-value@127.0.0.1:${fakeOpenCode.port}`,
        workspacePath,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      expect(JSON.stringify(error)).not.toContain("secret-token-value");
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("CONFIG_INVALID");
        expect(error.message).not.toContain("secret-token-value");
        expect(JSON.stringify(error.details)).not.toContain("secret-token-value");
      }
    }

    storage.close();
  });

  it("rejects invalid attached server URLs without leaking the raw input through cause", async () => {
    const { storage, workspacePath } = await createTestContext();
    const manager = createManager({
      storage,
      runtimeId: "runtime_invalid_url",
    });

    await expect(
      manager.attachRuntime({
        serverUrl: "http://user:secret-token-value@",
        workspacePath,
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      providerId: "opencode",
      operation: "opencode.attachedRuntime.parseServerUrl",
    });

    try {
      await manager.attachRuntime({
        serverUrl: "http://user:secret-token-value@",
        workspacePath,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      expect(JSON.stringify(error)).not.toContain("secret-token-value");
      if (error instanceof AgentProxyError) {
        expect(error.cause).toBeUndefined();
        expect(error.message).not.toContain("secret-token-value");
        expect(JSON.stringify(error.details) ?? "").not.toContain("secret-token-value");
      }
    }

    storage.close();
  });
});
