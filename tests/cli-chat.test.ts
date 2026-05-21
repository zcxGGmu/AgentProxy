import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { createOutputWriters } from "../src/logging/index.js";

const tempRoots: string[] = [];

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
  logPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-chat-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const configPath = path.join(root, "agentproxy.json");
  const storagePath = path.join(root, "data", "agentproxy.sqlite3");
  const logPath = path.join(root, "native-tui.jsonl");
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
    logPath,
  };
}

async function createFakeOpenCodeNativeTuiBinary(workspacePath: string): Promise<string> {
  const binaryDirectory = path.join(workspacePath, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  const binaryPath = path.join(binaryDirectory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const fs = require("node:fs")

const logPath = process.env.OPENCODE_TUI_CONFIG
if (logPath) {
  fs.appendFileSync(logPath, JSON.stringify({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    env: {
      OPENCODE_TUI_CONFIG: process.env.OPENCODE_TUI_CONFIG,
      OPENCODE_CONFIG_CONTENT: process.env.OPENCODE_CONFIG_CONTENT,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      PATH: process.env.PATH,
      TERM: process.env.TERM,
    },
  }) + "\\n")
}

const exitCode = Number(process.env.OPENCODE_CONFIG_CONTENT ?? "0")
process.exit(Number.isFinite(exitCode) ? exitCode : 0)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function writeConfig(input: {
  configPath: string;
  workspacePath: string;
  storagePath: string;
  logPath: string;
  binary: string;
  exitCode?: number;
  enabled?: boolean;
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
            enabled: input.enabled ?? true,
            binary: input.binary,
            runtime: {
              mode: "attached",
              hostname: "127.0.0.1",
              port: 4096,
            },
            passthroughEnv: {
              OPENCODE_TUI_CONFIG: input.logPath,
              OPENCODE_CONFIG_CONTENT: String(input.exitCode ?? 0),
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
}): Promise<{ stdout: string; stderr: string; exitCode: string | number | undefined }> {
  const originalExitCode = process.exitCode;
  const stdout = createMemorySink();
  const stderr = createMemorySink();
  const program = createProgram({
    cwd: input.cwd,
    homeDir: input.homeDir,
    env: input.env ?? { PATH: "" },
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

function createTestPath(workspacePath: string): string {
  return [path.join(workspacePath, "bin"), process.env.PATH ?? ""].filter(Boolean).join(delimiter);
}

async function readJsonLines(filePath: string): Promise<unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy chat native TUI launcher", () => {
  it("launches the configured OpenCode native TUI for the selected workspace", async () => {
    const { workspacePath, homeDir, configPath, storagePath, logPath } = await createTestRoot();
    const binary = await createFakeOpenCodeNativeTuiBinary(workspacePath);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      logPath,
      binary: "./bin/opencode",
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--config", configPath],
      env: {
        PATH: createTestPath(workspacePath),
        TERM: "xterm-256color",
        OPENAI_API_KEY: "sk-parent-secret",
        AWS_SECRET_ACCESS_KEY: "aws-parent-secret",
      },
    });

    expect(binary).toContain("opencode");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(await readJsonLines(logPath)).toEqual([
      expect.objectContaining({
        args: [workspacePath],
        cwd: expect.stringContaining(path.basename(workspacePath)),
        env: expect.objectContaining({
          OPENCODE_TUI_CONFIG: logPath,
          OPENCODE_CONFIG_CONTENT: "0",
          PATH: expect.stringContaining(path.join(workspacePath, "bin")),
          TERM: "xterm-256color",
        }),
      }),
    ]);
    expect(JSON.stringify(await readJsonLines(logPath))).not.toContain("sk-parent-secret");
    expect(JSON.stringify(await readJsonLines(logPath))).not.toContain("aws-parent-secret");
  });

  it("preserves the OpenCode native TUI process exit code", async () => {
    const { workspacePath, homeDir, configPath, storagePath, logPath } = await createTestRoot();
    await createFakeOpenCodeNativeTuiBinary(workspacePath);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      logPath,
      binary: "./bin/opencode",
      exitCode: 17,
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--config", configPath],
      env: {
        PATH: createTestPath(workspacePath),
      },
    });

    expect(result.exitCode).toBe(17);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(await readJsonLines(logPath)).toHaveLength(1);
  });

  it("rejects non-OpenCode providers with a stable error", async () => {
    const { workspacePath, homeDir } = await createTestRoot();

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--provider", "missing", "--json"],
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing",
        operation: "chat",
      },
    });
  });

  it("rejects JSON mode because chat hands the terminal to the native TUI", async () => {
    const { workspacePath, homeDir } = await createTestRoot();

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--json"],
    });

    expect(result.exitCode).toBe(6);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        operation: "chat",
      },
    });
  });

  it("maps disabled OpenCode provider to a stable provider-unavailable diagnostic", async () => {
    const { workspacePath, homeDir, configPath, storagePath, logPath } = await createTestRoot();
    await createFakeOpenCodeNativeTuiBinary(workspacePath);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      logPath,
      binary: "./bin/opencode",
      enabled: false,
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--config", configPath],
      env: {
        PATH: createTestPath(workspacePath),
        OPENAI_API_KEY: "sk-disabled-secret",
      },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PROVIDER_UNAVAILABLE");
    expect(result.stderr).toContain("OpenCode provider is disabled");
    expect(result.stderr).not.toContain("sk-disabled-secret");
  });

  it("maps missing OpenCode binary to provider unavailable without leaking secrets", async () => {
    const { workspacePath, homeDir, configPath, storagePath, logPath } = await createTestRoot();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      logPath,
      binary: "./bin/opencode-token=sk-binary-secret",
    });

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["chat", "--config", configPath],
      env: {
        PATH: createTestPath(workspacePath),
        AWS_SECRET_ACCESS_KEY: "aws-missing-binary-secret",
      },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PROVIDER_UNAVAILABLE");
    expect(result.stderr).toContain("OpenCode binary was not found or is not executable");
    expect(result.stderr).not.toContain("sk-binary-secret");
    expect(result.stderr).not.toContain("aws-missing-binary-secret");
  });

  it("keeps session-specific native TUI launch explicitly unsupported", async () => {
    const { workspacePath, homeDir } = await createTestRoot();

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
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

  it("keeps later Phase 5 business commands as planned placeholders", async () => {
    const { workspacePath, homeDir } = await createTestRoot();

    const result = await runCli({
      cwd: workspacePath,
      homeDir,
      argv: ["runtime", "stop", "runtime_123"],
    });

    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CAPABILITY_UNSUPPORTED");
    expect(result.stderr).toContain("agentproxy runtime stop is planned");
  });
});
