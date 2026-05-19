import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  AGENTPROXY_GLOBAL_CONFIG_PATH,
  AGENTPROXY_PROJECT_CONFIG_PATH,
  resolveAgentProxyConfig,
} from "../src/config/index.js";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<{ root: string; homeDir: string; cwd: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-config-test-"));
  tempRoots.push(root);

  const homeDir = path.join(root, "home");
  const cwd = path.join(root, "repo");
  await Promise.all([mkdir(homeDir, { recursive: true }), mkdir(cwd, { recursive: true })]);

  return { root, homeDir, cwd };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AgentProxy config resolver", () => {
  it("uses built-in defaults when global and project config files are missing", async () => {
    const { cwd, homeDir } = await createTempWorkspace();

    const result = await resolveAgentProxyConfig({ cwd, homeDir, env: {} });

    expect(result.config).toEqual({
      defaultProvider: "opencode",
      workspacePath: cwd,
      storage: {
        path: path.join(homeDir, ".local", "share", "agentproxy", "agentproxy.sqlite3"),
      },
      providers: {
        opencode: {
          enabled: true,
          binary: "opencode",
          runtime: {
            mode: "managed",
            hostname: "127.0.0.1",
            port: 4096,
          },
          passthroughEnv: {},
        },
      },
      logging: {
        level: "info",
        redact: true,
      },
    });
    expect(result.sources.map((source) => source.kind)).toEqual(["builtin"]);
    expect(result.paths.globalConfigPath).toBe(path.join(homeDir, AGENTPROXY_GLOBAL_CONFIG_PATH));
    expect(result.paths.projectConfigPath).toBe(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH));
  });

  it("merges config in default, global, project, env, and CLI precedence order", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    await writeJson(path.join(homeDir, AGENTPROXY_GLOBAL_CONFIG_PATH), {
      defaultProvider: "global-provider",
      workspacePath: "~/global-workspace",
      storage: {
        path: "~/global.sqlite",
      },
      providers: {
        opencode: {
          enabled: false,
          binary: "global-opencode",
          runtime: {
            hostname: "127.0.0.2",
            port: 4100,
          },
        },
      },
      logging: {
        level: "warn",
        redact: false,
      },
    });
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      defaultProvider: "project-provider",
      providers: {
        opencode: {
          binary: "project-opencode",
          runtime: {
            port: 4200,
          },
        },
      },
      logging: {
        level: "error",
      },
    });

    const result = await resolveAgentProxyConfig({
      cwd,
      homeDir,
      env: {
        AGENTPROXY_DEFAULT_PROVIDER: "env-provider",
        AGENTPROXY_WORKSPACE: "~/env-workspace",
        AGENTPROXY_STORAGE_PATH: "~/env.sqlite",
        AGENTPROXY_LOG_LEVEL: "debug",
        AGENTPROXY_LOG_REDACT: "true",
        AGENTPROXY_OPENCODE_ENABLED: "true",
        AGENTPROXY_OPENCODE_BINARY: "env-opencode",
        AGENTPROXY_OPENCODE_RUNTIME_HOSTNAME: "localhost",
        AGENTPROXY_OPENCODE_RUNTIME_PORT: "4300",
      },
      cli: {
        defaultProvider: "cli-provider",
        workspacePath: "./cli-workspace",
        storagePath: "~/cli.sqlite",
        logLevel: "info",
        opencodeBinary: "cli-opencode",
        opencodeRuntimePort: 4400,
      },
    });

    expect(result.config.defaultProvider).toBe("cli-provider");
    expect(result.config.workspacePath).toBe(path.join(cwd, "cli-workspace"));
    expect(result.config.storage.path).toBe(path.join(homeDir, "cli.sqlite"));
    expect(result.config.providers.opencode).toEqual({
      enabled: true,
      binary: "cli-opencode",
      runtime: {
        mode: "managed",
        hostname: "localhost",
        port: 4400,
      },
      passthroughEnv: {},
    });
    expect(result.config.logging).toEqual({
      level: "info",
      redact: true,
    });
    expect(result.sources.map((source) => source.kind)).toEqual([
      "builtin",
      "global",
      "project",
      "env",
      "cli",
    ]);
  });

  it("applies explicit config after project config and before env and CLI overrides", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    const explicitConfigPath = "~/explicit-agentproxy-config.json";
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      defaultProvider: "project-provider",
      providers: {
        opencode: {
          binary: "project-opencode",
        },
      },
    });
    await writeJson(path.join(homeDir, "explicit-agentproxy-config.json"), {
      defaultProvider: "explicit-provider",
      providers: {
        opencode: {
          binary: "explicit-opencode",
        },
      },
    });

    const result = await resolveAgentProxyConfig({
      cwd,
      homeDir,
      env: {
        AGENTPROXY_OPENCODE_BINARY: "env-opencode",
      },
      cli: {
        configPath: explicitConfigPath,
        defaultProvider: "cli-provider",
      },
    });

    expect(result.config.defaultProvider).toBe("cli-provider");
    expect(result.config.providers.opencode.binary).toBe("env-opencode");
    expect(result.sources.map((source) => source.kind)).toEqual([
      "builtin",
      "project",
      "explicit",
      "env",
      "cli",
    ]);
  });

  it("maps invalid config to CONFIG_INVALID without echoing secret-like values", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      logging: {
        level: "super-secret-token-value",
      },
    });

    await expect(resolveAgentProxyConfig({ cwd, homeDir, env: {} })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });

    try {
      await resolveAgentProxyConfig({ cwd, homeDir, env: {} });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.message).toContain("logging.level");
        expect(error.message).not.toContain("super-secret-token-value");
        expect(JSON.stringify(error.details)).not.toContain("super-secret-token-value");
      }
    }
  });

  it("fails when an explicit CLI config path is missing", async () => {
    const { cwd, homeDir } = await createTempWorkspace();

    await expect(
      resolveAgentProxyConfig({
        cwd,
        homeDir,
        env: {},
        cli: {
          configPath: "~/missing-agentproxy-config.json",
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });
  });

  it("rejects invalid runtime ports from file, env, and CLI config", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      providers: {
        opencode: {
          runtime: {
            port: 70000,
          },
        },
      },
    });

    await expect(resolveAgentProxyConfig({ cwd, homeDir, env: {} })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });

    await rm(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), { force: true });

    await expect(
      resolveAgentProxyConfig({
        cwd,
        homeDir,
        env: {
          AGENTPROXY_OPENCODE_RUNTIME_PORT: "",
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });

    await expect(
      resolveAgentProxyConfig({
        cwd,
        homeDir,
        env: {},
        cli: {
          opencodeRuntimePort: 0,
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });
  });

  it("rejects OpenCode native config mixed into AgentProxy config", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      opencode: {
        config: "native-opencode-secret-config",
      },
    });

    await expect(resolveAgentProxyConfig({ cwd, homeDir, env: {} })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });

    try {
      await resolveAgentProxyConfig({ cwd, homeDir, env: {} });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.message).toContain("opencode");
        expect(error.message).not.toContain("native-opencode-secret-config");
      }
    }
  });

  it("rejects OpenCode native config nested under provider config without echoing values", async () => {
    const { cwd, homeDir } = await createTempWorkspace();
    await writeJson(path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH), {
      providers: {
        opencode: {
          config: "native-opencode-secret-config",
        },
      },
    });

    await expect(resolveAgentProxyConfig({ cwd, homeDir, env: {} })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "config.validate",
    });

    try {
      await resolveAgentProxyConfig({ cwd, homeDir, env: {} });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.message).toContain("providers.opencode");
        expect(error.message).not.toContain("native-opencode-secret-config");
        expect(JSON.stringify(error.details)).not.toContain("native-opencode-secret-config");
      }
    }
  });

  it("does not treat OpenCode native environment variables as AgentProxy config", async () => {
    const { cwd, homeDir } = await createTempWorkspace();

    const result = await resolveAgentProxyConfig({
      cwd,
      homeDir,
      env: {
        OPENCODE_CONFIG: "~/opencode/config.json",
        OPENCODE_SERVER_PASSWORD: "native-password",
      },
    });

    const serializedConfig = JSON.stringify(result.config);
    expect(serializedConfig).not.toContain("opencode/config.json");
    expect(serializedConfig).not.toContain("native-password");
    expect(result.config.providers.opencode.passthroughEnv).toEqual({});
  });
});
