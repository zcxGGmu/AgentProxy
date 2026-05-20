import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY,
  RuntimeRegistry,
} from "../src/runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];

async function createStorage(): Promise<{
  storage: AgentProxyStorage;
  workspacePath: string;
  otherWorkspacePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-runtime-registry-test-"));
  tempRoots.push(root);

  const dataDir = path.join(root, "data");
  const workspacePath = path.join(root, "workspace");
  const otherWorkspacePath = path.join(root, "other-workspace");
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(otherWorkspacePath, { recursive: true }),
  ]);

  return {
    storage: openAgentProxyStorage({ databasePath: path.join(dataDir, "agentproxy.sqlite3") }),
    workspacePath,
    otherWorkspacePath,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Runtime Registry", () => {
  it("persists managed and attached runtime metadata with distinct modes", async () => {
    const { storage, workspacePath } = await createStorage();
    const registry = new RuntimeRegistry({
      storage,
      now: () => new Date("2026-05-20T04:00:00.000Z"),
    });

    const managed = registry.register({
      id: "runtime_managed",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      baseUrl: "http://127.0.0.1:4096",
      hostname: "127.0.0.1",
      port: 4096,
      pid: 1111,
      workspacePath,
      startedAt: "2026-05-20T03:59:00.000Z",
      metadata: {
        owner: "agentproxy",
      },
    });
    const attached = registry.register({
      id: "runtime_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      baseUrl: "http://127.0.0.1:5096",
      hostname: "127.0.0.1",
      port: 5096,
      pid: 2222,
      workspacePath,
      metadata: {
        source: "server-url",
      },
    });

    expect(storage.runtimes.get("runtime_managed")).toEqual(managed);
    expect(storage.runtimes.get("runtime_attached")).toEqual(attached);
    expect(registry.list({ mode: "managed" })).toEqual([managed]);
    expect(registry.list({ mode: "attached" })).toEqual([attached]);
    expect(managed.metadata[AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY]).toEqual({
      registeredAt: "2026-05-20T04:00:00.000Z",
      updatedAt: "2026-05-20T04:00:00.000Z",
      stale: false,
    });
    expect(attached).toEqual({
      id: "runtime_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      baseUrl: "http://127.0.0.1:5096",
      hostname: "127.0.0.1",
      port: 5096,
      pid: 2222,
      workspacePath,
      startedAt: "2026-05-20T04:00:00.000Z",
      metadata: {
        source: "server-url",
        [AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY]: {
          registeredAt: "2026-05-20T04:00:00.000Z",
          updatedAt: "2026-05-20T04:00:00.000Z",
          stale: false,
        },
      },
    });

    storage.close();
  });

  it("lists runtimes by provider, workspace, mode, and state-machine status", async () => {
    const { storage, workspacePath, otherWorkspacePath } = await createStorage();
    const registry = new RuntimeRegistry({
      storage,
      now: () => new Date("2026-05-20T05:00:00.000Z"),
    });

    const healthyManaged = registry.register({
      id: "runtime_healthy_managed",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      workspacePath,
    });
    const detachedAttached = registry.register({
      id: "runtime_detached_attached",
      providerId: "opencode",
      mode: "attached",
      status: "detached",
      workspacePath,
    });
    registry.register({
      id: "runtime_other_workspace",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      workspacePath: otherWorkspacePath,
    });
    registry.register({
      id: "runtime_other_provider",
      providerId: "mock",
      mode: "managed",
      status: "failed",
      workspacePath,
    });

    expect(
      registry
        .list({
          providerId: "opencode",
          workspacePath,
          mode: ["managed", "attached"],
          status: ["healthy", "detached"],
        })
        .map((runtime) => runtime.id),
    ).toEqual(["runtime_detached_attached", "runtime_healthy_managed"]);
    expect(registry.list({ mode: "attached" })).toEqual([detachedAttached]);
    expect(registry.list({ status: "healthy", workspacePath })).toEqual([healthyManaged]);

    storage.close();
  });

  it("updates state-machine status while preserving registry registration metadata", async () => {
    const { storage, workspacePath } = await createStorage();
    let now = new Date("2026-05-20T05:30:00.000Z");
    const registry = new RuntimeRegistry({
      storage,
      now: () => now,
    });

    registry.register({
      id: "runtime_starting",
      providerId: "opencode",
      mode: "managed",
      status: "starting",
      workspacePath,
      metadata: {
        launchKind: "future-managed-start",
      },
    });

    now = new Date("2026-05-20T05:31:00.000Z");
    const updated = registry.register({
      id: "runtime_starting",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      workspacePath,
    });

    expect(updated).toEqual({
      id: "runtime_starting",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      workspacePath,
      startedAt: "2026-05-20T05:30:00.000Z",
      metadata: {
        launchKind: "future-managed-start",
        [AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY]: {
          registeredAt: "2026-05-20T05:30:00.000Z",
          updatedAt: "2026-05-20T05:31:00.000Z",
          stale: false,
        },
      },
    });
    expect(registry.list({ status: "healthy" })).toEqual([updated]);

    storage.close();
  });

  it("clears stopped timestamps when a runtime becomes active again", async () => {
    const { storage, workspacePath } = await createStorage();
    let now = new Date("2026-05-20T05:45:00.000Z");
    const registry = new RuntimeRegistry({
      storage,
      now: () => now,
    });

    registry.register({
      id: "runtime_restarted",
      providerId: "opencode",
      mode: "managed",
      status: "stopped",
      workspacePath,
      stoppedAt: "2026-05-20T05:45:30.000Z",
    });

    now = new Date("2026-05-20T05:46:00.000Z");
    const restarted = registry.register({
      id: "runtime_restarted",
      providerId: "opencode",
      mode: "managed",
      status: "starting",
      workspacePath,
    });

    expect(restarted.stoppedAt).toBeUndefined();
    expect(storage.runtimes.get("runtime_restarted")?.stoppedAt).toBeUndefined();

    storage.close();
  });

  it("marks stale active metadata without deleting records or stopping attached runtimes", async () => {
    const { storage, workspacePath } = await createStorage();
    let now = new Date("2026-05-20T06:00:00.000Z");
    const registry = new RuntimeRegistry({
      storage,
      now: () => now,
    });

    registry.register({
      id: "runtime_old_managed",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      pid: 3333,
      workspacePath,
    });
    registry.register({
      id: "runtime_old_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      pid: 4444,
      workspacePath,
    });
    registry.register({
      id: "runtime_old_stopped",
      providerId: "opencode",
      mode: "managed",
      status: "stopped",
      pid: 5555,
      workspacePath,
    });

    now = new Date("2026-05-20T08:45:00.000Z");
    registry.register({
      id: "runtime_recent_managed",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      pid: 6666,
      workspacePath,
    });

    now = new Date("2026-05-20T09:00:00.000Z");
    const result = registry.cleanupStale({
      staleAfterMs: 60 * 60 * 1000,
      reason: "startup_reconciliation",
    });

    expect(result.checked).toBe(4);
    expect(result.markedStale.map((runtime) => runtime.id).sort()).toEqual([
      "runtime_old_attached",
      "runtime_old_managed",
    ]);
    expect(storage.runtimes.get("runtime_old_managed")).toMatchObject({
      id: "runtime_old_managed",
      mode: "managed",
      status: "failed",
      pid: 3333,
    });
    expect(storage.runtimes.get("runtime_old_attached")).toMatchObject({
      id: "runtime_old_attached",
      mode: "attached",
      status: "detached",
      pid: 4444,
    });
    expect(storage.runtimes.get("runtime_old_stopped")).toMatchObject({
      id: "runtime_old_stopped",
      status: "stopped",
      pid: 5555,
    });
    expect(storage.runtimes.get("runtime_recent_managed")).toMatchObject({
      id: "runtime_recent_managed",
      status: "healthy",
      pid: 6666,
    });
    expect(
      storage.runtimes.get("runtime_old_attached")?.metadata[
        AGENTPROXY_RUNTIME_REGISTRY_METADATA_KEY
      ],
    ).toMatchObject({
      stale: true,
      staleMarkedAt: "2026-05-20T09:00:00.000Z",
      staleReason: "startup_reconciliation",
      previousStatus: "attached",
      staleAction: "detach_metadata_only",
    });
    expect(registry.list({ status: ["healthy", "attached"], workspacePath })).toEqual([
      storage.runtimes.get("runtime_recent_managed"),
    ]);

    storage.close();
  });

  it("rejects invalid stale cleanup thresholds", async () => {
    const { storage, workspacePath } = await createStorage();
    const registry = new RuntimeRegistry({
      storage,
      now: () => new Date("2026-05-20T10:00:00.000Z"),
    });

    registry.register({
      id: "runtime_fresh",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      workspacePath,
    });

    for (const staleAfterMs of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(() => registry.cleanupStale({ staleAfterMs })).toThrow(AgentProxyError);
      try {
        registry.cleanupStale({ staleAfterMs });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentProxyError);
        if (error instanceof AgentProxyError) {
          expect(error.code).toBe("CONFIG_INVALID");
          expect(error.operation).toBe("runtimeRegistry.cleanupStale");
        }
      }
    }

    expect(storage.runtimes.get("runtime_fresh")).toMatchObject({
      id: "runtime_fresh",
      status: "healthy",
    });

    storage.close();
  });
});
