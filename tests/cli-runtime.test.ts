import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { createOutputWriters } from "../src/logging/index.js";
import { RuntimeRegistry } from "../src/runtimes/index.js";
import { openAgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];

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
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-runtime-test-"));
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

function seedRuntimeRegistry(workspace: TestWorkspace): void {
  const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
  try {
    const registry = new RuntimeRegistry({
      storage,
      now: () => new Date("2026-05-21T07:00:00.000Z"),
    });
    registry.register({
      id: "runtime_other_workspace",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      baseUrl: "http://127.0.0.1:4999",
      workspacePath: workspace.otherWorkspacePath,
      startedAt: "2026-05-21T06:40:00.000Z",
    });
    registry.register({
      id: "runtime_other_provider",
      providerId: "mock",
      mode: "managed",
      status: "healthy",
      baseUrl: "http://127.0.0.1:5999",
      workspacePath: workspace.workspacePath,
      startedAt: "2026-05-21T06:45:00.000Z",
    });
    registry.register({
      id: "runtime_attached",
      providerId: "opencode",
      mode: "attached",
      status: "attached",
      baseUrl: "http://user:token-secret@127.0.0.1:7777/path?api_key=sk-url-secret#frag",
      hostname: "127.0.0.1",
      port: 7777,
      pid: 2222,
      workspacePath: workspace.workspacePath,
      startedAt: "2026-05-21T06:50:00.000Z",
      metadata: {
        authorization: "Bearer sk-runtime-secret",
        display: "\u001B[31mowned token=runtime-secret\u001B[0m",
      },
    });
    registry.register({
      id: "\u001B[31mruntime-token=runtime-id-secret\u001B[0m",
      providerId: "opencode",
      mode: "managed",
      status: "healthy",
      baseUrl: "http://127.0.0.1:8888",
      hostname: "127.0.0.1",
      port: 8888,
      pid: 3333,
      workspacePath: workspace.workspacePath,
      startedAt: "2026-05-21T06:55:00.000Z",
    });
  } finally {
    storage.close();
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy runtime CLI", () => {
  it("prints one JSON runtime list report without the planned placeholder", async () => {
    const workspace = await createTestWorkspace();
    seedRuntimeRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["runtime", "list", "--json", "--config", workspace.configPath],
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
      runtimes: [
        {
          providerId: "opencode",
          mode: "managed",
          status: "healthy",
          baseUrl: "http://127.0.0.1:8888",
          pid: 3333,
        },
        {
          id: "runtime_attached",
          providerId: "opencode",
          mode: "attached",
          status: "attached",
          baseUrl: "http://127.0.0.1:7777/path",
          pid: 2222,
        },
      ],
    });
    expect(report.runtimes).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain("runtime_other_workspace");
    expect(JSON.stringify(report)).not.toContain("runtime_other_provider");
    expect(JSON.stringify(report)).not.toContain("token-secret");
    expect(JSON.stringify(report)).not.toContain("sk-url-secret");
    expect(JSON.stringify(report)).not.toContain("runtime-secret");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("prints terminal-safe human runtime list output", async () => {
    const workspace = await createTestWorkspace();
    seedRuntimeRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["runtime", "list", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("AgentProxy runtimes: 2");
    expect(result.stdout).toContain("runtime_attached");
    expect(result.stdout).toContain("attached/attached");
    expect(result.stdout).toContain("http://127.0.0.1:7777/path");
    expect(result.stdout).not.toContain("token-secret");
    expect(result.stdout).not.toContain("sk-url-secret");
    expect(result.stdout).not.toContain("runtime-secret");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("succeeds with an empty list when the registry database is absent", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["runtime", "list", "--json", "--config", workspace.configPath],
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
      runtimes: [],
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("maps invalid and disabled provider errors without leaking controls", async () => {
    const enabledWorkspace = await createTestWorkspace();
    const disabledWorkspace = await createTestWorkspace({ enabled: false });

    const missing = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "runtime",
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
        "runtime",
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

    const disabled = await runCli({
      workspace: disabledWorkspace,
      argv: ["runtime", "list", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabled.exitCode).toBe(4);
    expect(JSON.parse(disabled.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });
  });

  it("leaves runtime stop, sessions, and config as planned placeholders", async () => {
    const workspace = await createTestWorkspace();

    for (const argv of [
      ["runtime", "stop", "runtime_123", "--config", workspace.configPath],
      ["sessions", "list", "--config", workspace.configPath],
      ["config", "get", "--config", workspace.configPath],
    ]) {
      const result = await runCli({ workspace, argv });

      expect(result.exitCode).toBe(6);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("CAPABILITY_UNSUPPORTED");
      expect(result.stderr).toContain("planned for a later phase");
    }
  });
});
