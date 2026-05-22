import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { createOutputWriters } from "../src/logging/index.js";

const tempRoots: string[] = [];

interface MemorySink {
  chunks: string[];
  write(chunk: string): boolean;
}

interface TestWorkspace {
  root: string;
  workspacePath: string;
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

async function createTestWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-config-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const configPath = path.join(root, "agentproxy.json");
  const storagePath = path.join(root, "data", "agentproxy.sqlite3");
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(homeDir, { recursive: true }),
  ]);

  await writeConfig({ configPath, workspacePath, storagePath });

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
}): Promise<void> {
  await writeFile(
    input.configPath,
    `${JSON.stringify(
      {
        defaultProvider: "opencode",
        workspacePath: input.workspacePath,
        storage: {
          path: input.storagePath,
        },
        providers: {
          opencode: {
            enabled: true,
            binary: "\u001B]0;token=sk-binary-secret000000000000\u0007./bin/opencode",
            runtime: {
              mode: "attached",
              hostname: "127.0.0.1",
              port: 4917,
              baseUrl: "http://user:pass@127.0.0.1:4917/opencode?token=base-secret#frag",
            },
            passthroughEnv: {
              OPENCODE_SERVER_PASSWORD: "server-password-secret",
              OPENCODE_CONFIG_CONTENT: '{"token":"config-content-secret"}',
            },
          },
        },
        logging: {
          level: "debug",
          redact: true,
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
      PATH: "",
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

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy config CLI", () => {
  it("prints one redacted JSON config report without touching storage", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["config", "get", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("planned for a later phase");
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);

    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      config: {
        defaultProvider: "opencode",
        workspacePath: workspace.workspacePath,
        storage: {
          path: workspace.storagePath,
        },
        providers: {
          opencode: {
            enabled: true,
            runtime: {
              mode: "attached",
              hostname: "127.0.0.1",
              port: 4917,
              baseUrl: "http://127.0.0.1:4917/opencode",
            },
            passthroughEnv: {
              OPENCODE_SERVER_PASSWORD: "[REDACTED]",
              OPENCODE_CONFIG_CONTENT: "[REDACTED]",
            },
          },
        },
        logging: {
          level: "debug",
          redact: true,
        },
      },
      sources: [{ kind: "builtin" }, { kind: "explicit", path: workspace.configPath }],
      paths: {
        explicitConfigPath: workspace.configPath,
      },
    });
    expect(JSON.stringify(report)).not.toContain("server-password-secret");
    expect(JSON.stringify(report)).not.toContain("config-content-secret");
    expect(JSON.stringify(report)).not.toContain("sk-binary-secret");
    expect(JSON.stringify(report)).not.toContain("user:pass");
    expect(JSON.stringify(report)).not.toContain("base-secret");
    expect(result.stdout).not.toContain("\u001B]");
    expect(result.stdout).not.toContain("\u0007");
  });

  it("prints only the requested key and applies env plus CLI precedence", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "get",
        "workspacePath",
        "--json",
        "--workspace",
        "./cli-workspace",
        "--config",
        workspace.configPath,
      ],
      env: {
        AGENTPROXY_WORKSPACE: "~/env-workspace",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      key: "workspacePath",
      value: path.join(workspace.workspacePath, "cli-workspace"),
    });
    expect(report.config).toBeUndefined();
    expect(report.sources.map((source: { kind: string }) => source.kind)).toEqual([
      "builtin",
      "explicit",
      "env",
      "cli",
    ]);
  });

  it("prints a terminal-safe human key value", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "get",
        "providers.opencode.runtime.baseUrl",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "providers.opencode.runtime.baseUrl: http://127.0.0.1:4917/opencode",
    );
    expect(result.stdout).not.toContain("user:pass");
    expect(result.stdout).not.toContain("base-secret");
    expect(result.stdout).not.toContain("\u001B]");
    expect(result.stdout).not.toContain("\u0007");
  });

  it("rejects unsupported keys with stable redacted CONFIG_INVALID output", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "get",
        "providers.opencode.runtime.apiKey=sk-invalid-key-secret000000000000",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("sk-invalid-key-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.get",
      },
    });
  });

  it("rejects prototype-derived keys instead of reading inherited properties", async () => {
    const workspace = await createTestWorkspace();

    for (const key of ["constructor", "toString", "__proto__"]) {
      const result = await runCli({
        workspace,
        argv: ["config", "get", key, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("[Function]");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "CONFIG_INVALID",
          operation: "config.get",
        },
      });
    }
  });

  it("removes terminal controls from JSON config error output", async () => {
    const workspace = await createTestWorkspace();
    await writeFile(
      workspace.configPath,
      `${JSON.stringify({
        "\u009B31munknown": "token=hidden-secret",
      })}\n`,
      "utf8",
    );

    const result = await runCli({
      workspace,
      argv: ["config", "get", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("\u009B");
    expect(result.stdout).not.toContain("hidden-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.validate",
      },
    });
  });

  it("keeps explicit missing config mapped to CONFIG_INVALID", async () => {
    const workspace = await createTestWorkspace();
    const missingConfigPath = path.join(workspace.root, "missing-agentproxy.json");

    const result = await runCli({
      workspace,
      argv: ["config", "get", "--json", "--config", missingConfigPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.validate",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("leaves config set as a planned placeholder", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.enabled",
        "true",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CAPABILITY_UNSUPPORTED");
    expect(result.stderr).toContain("agentproxy config set is planned");
  });
});
