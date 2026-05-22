import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setAgentProxyConfig } from "../src/cli/config.js";
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

async function createConfigSetWorkspace(): Promise<TestWorkspace> {
  const workspace = await createTestWorkspace();
  await writeConfigSetSafe({
    configPath: workspace.configPath,
    workspacePath: workspace.workspacePath,
    storagePath: workspace.storagePath,
  });
  return workspace;
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

async function writeConfigSetSafe(input: {
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
            binary: "./bin/opencode",
            runtime: {
              mode: "attached",
              hostname: "127.0.0.1",
              port: 4917,
              baseUrl: "http://127.0.0.1:4917/opencode",
            },
            passthroughEnv: {},
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

  it("sets an explicit config leaf key with redacted JSON output", async () => {
    const workspace = await createConfigSetWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.enabled",
        "false",
        "--json",
        "--config",
        workspace.configPath,
        "--workspace",
        "./cli-workspace",
      ],
      env: {
        AGENTPROXY_WORKSPACE: "~/env-workspace",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);

    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      key: "providers.opencode.enabled",
      value: false,
      target: {
        kind: "explicit",
        path: workspace.configPath,
        created: false,
      },
    });

    const written = JSON.parse(await readFile(workspace.configPath, "utf8"));
    expect(written.providers.opencode.enabled).toBe(false);
    expect(written.workspacePath).toBe(workspace.workspacePath);
    expect(JSON.stringify(written)).not.toContain("env-workspace");
  });

  it("creates a missing explicit config file when --config targets a new file", async () => {
    const workspace = await createTestWorkspace();
    const explicitConfigPath = path.join(workspace.root, "nested", "agentproxy.json");

    const result = await runCli({
      workspace,
      argv: ["config", "set", "logging.redact", "false", "--json", "--config", explicitConfigPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      key: "logging.redact",
      value: false,
      target: {
        kind: "explicit",
        path: explicitConfigPath,
        created: true,
      },
    });

    const written = JSON.parse(await readFile(explicitConfigPath, "utf8"));
    expect(written).toMatchObject({
      $schema: "https://agentproxy.local/config.schema.json",
      logging: {
        redact: false,
      },
    });
  });

  it("creates the project config file when no explicit config path is provided", async () => {
    const workspace = await createTestWorkspace();
    const projectConfigPath = path.join(workspace.workspacePath, ".agentproxy", "config.json");

    const result = await runCli({
      workspace,
      argv: ["config", "set", "logging.level", "warn", "--json"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(existsSync(projectConfigPath)).toBe(true);
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);

    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: true,
      key: "logging.level",
      value: "warn",
      target: {
        kind: "project",
        path: projectConfigPath,
        created: true,
      },
    });

    const written = JSON.parse(await readFile(projectConfigPath, "utf8"));
    expect(written).toMatchObject({
      $schema: "https://agentproxy.local/config.schema.json",
      logging: {
        level: "warn",
      },
    });
  });

  it("parses scalar values and prints terminal-safe human output", async () => {
    const workspace = await createConfigSetWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.runtime.port",
        "65535",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Set providers.opencode.runtime.port");
    expect(result.stdout).toContain("Value: 65535");
    expect(result.stdout).not.toContain("\u001B]");
    expect(result.stdout).not.toContain("\u0007");

    const written = JSON.parse(await readFile(workspace.configPath, "utf8"));
    expect(written.providers.opencode.runtime.port).toBe(65535);
    expect(written.providers.opencode.runtime.mode).toBe("attached");
    expect(written.providers.opencode.runtime.hostname).toBe("127.0.0.1");
    expect(written.providers.opencode.runtime.baseUrl).toBe("http://127.0.0.1:4917/opencode");
  });

  it("normalizes supported runtime base URLs before writing", async () => {
    const workspace = await createConfigSetWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.runtime.baseUrl",
        "http://127.0.0.1:4096/opencode/",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      key: "providers.opencode.runtime.baseUrl",
      value: "http://127.0.0.1:4096/opencode",
    });

    const written = JSON.parse(await readFile(workspace.configPath, "utf8"));
    expect(written.providers.opencode.runtime.baseUrl).toBe("http://127.0.0.1:4096/opencode");
  });

  it("redacts free-form string set values from success output", async () => {
    const workspace = await createConfigSetWorkspace();

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.binary",
        "./bin/other-opencode",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      key: "providers.opencode.binary",
      value: "[REDACTED]",
    });

    const written = JSON.parse(await readFile(workspace.configPath, "utf8"));
    expect(written.providers.opencode.binary).toBe("./bin/other-opencode");
  });

  it("rejects secret-shaped string values without rewriting the file", async () => {
    const workspace = await createConfigSetWorkspace();
    const secretBinary = "\u001B]0;token=sk-set-secret000000000000\u0007./bin/opencode";
    const before = await readFile(workspace.configPath, "utf8");

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.binary",
        secretBinary,
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("sk-set-secret");
    expect(result.stdout).not.toContain("\u001B]");
    expect(result.stdout).not.toContain("\u0007");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.set",
      },
    });
    expect(await readFile(workspace.configPath, "utf8")).toBe(before);
  });

  it("rejects files with existing sensitive config fields before rewriting", async () => {
    const workspace = await createTestWorkspace();
    const before = await readFile(workspace.configPath, "utf8");

    const result = await runCli({
      workspace,
      argv: ["config", "set", "logging.level", "warn", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("server-password-secret");
    expect(result.stdout).not.toContain("user:pass");
    expect(result.stdout).not.toContain("base-secret");
    expect(result.stdout).not.toContain("sk-binary-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.set",
      },
    });
    expect(await readFile(workspace.configPath, "utf8")).toBe(before);
  });

  it("rejects existing unsafe top-level strings before rewriting", async () => {
    const workspace = await createConfigSetWorkspace();
    await writeFile(
      workspace.configPath,
      `${JSON.stringify(
        {
          $schema: "https://agentproxy.local/config.schema.json",
          defaultProvider: "token=existing-secret",
          logging: {
            redact: true,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const before = await readFile(workspace.configPath, "utf8");

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "logging.redact",
        "false",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("existing-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.set",
      },
    });
    expect(await readFile(workspace.configPath, "utf8")).toBe(before);
  });

  it("rejects unsupported or secret-bearing config set keys without rewriting the file", async () => {
    const workspace = await createTestWorkspace();
    const before = await readFile(workspace.configPath, "utf8");

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.passthroughEnv.OPENCODE_SERVER_PASSWORD",
        "server-password-secret",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("server-password-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.set",
      },
    });
    expect(await readFile(workspace.configPath, "utf8")).toBe(before);
  });

  it("rejects credential-bearing runtime base URLs without rewriting the file", async () => {
    const workspace = await createTestWorkspace();
    const before = await readFile(workspace.configPath, "utf8");

    const result = await runCli({
      workspace,
      argv: [
        "config",
        "set",
        "providers.opencode.runtime.baseUrl",
        "http://user:secret@127.0.0.1:4096/opencode?token=base-secret#frag",
        "--json",
        "--config",
        workspace.configPath,
      ],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("user:secret");
    expect(result.stdout).not.toContain("base-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.set",
      },
    });
    expect(await readFile(workspace.configPath, "utf8")).toBe(before);
  });

  it("rejects invalid existing target config before writing", async () => {
    const workspace = await createTestWorkspace();
    await writeFile(
      workspace.configPath,
      `${JSON.stringify({
        unknown: "token=existing-secret",
      })}\n`,
      "utf8",
    );

    const result = await runCli({
      workspace,
      argv: ["config", "set", "logging.level", "error", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("existing-secret");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        operation: "config.validate",
      },
    });

    const written = JSON.parse(await readFile(workspace.configPath, "utf8"));
    expect(written).toEqual({
      unknown: "token=existing-secret",
    });
  });

  it("does not attach raw JSON parse errors as config set causes", async () => {
    const workspace = await createTestWorkspace();
    await writeFile(
      workspace.configPath,
      '{"logging":{"level":"info"},"secret":"token=invalid-json-secret",',
      "utf8",
    );

    const error = await setAgentProxyConfig({
      key: "logging.level",
      value: "warn",
      cwd: workspace.workspacePath,
      homeDir: workspace.homeDir,
      cli: {
        configPath: workspace.configPath,
      },
    }).catch((caught: unknown) => caught);

    expect(error).toHaveProperty("code", "CONFIG_INVALID");
    expect(error).toHaveProperty("operation", "config.validate");
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(error instanceof Error ? error.message : String(error)).not.toContain(
      "invalid-json-secret",
    );
  });
});
