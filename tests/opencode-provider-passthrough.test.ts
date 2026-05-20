import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../src/providers/index.js";

const tempRoots: string[] = [];

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createTestPath(binaryDirectory: string): string {
  return [binaryDirectory, process.env.PATH ?? ""].filter(Boolean).join(delimiter);
}

async function createFakeOpenCodeBinary(
  directory: string,
  options: { invocationLogPath?: string } = {},
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const binaryPath = path.join(directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const args = process.argv.slice(2)
const invocationLogPath = ${JSON.stringify(options.invocationLogPath ?? "")}

if (invocationLogPath !== "") {
  fs.appendFileSync(invocationLogPath, JSON.stringify({ args }) + "\\n")
}

if (
  process.env.OPENAI_API_KEY !== undefined ||
  process.env.AWS_SECRET_ACCESS_KEY !== undefined ||
  process.env.OPENCODE_TUI_CONFIG === "not-explicitly-forwarded"
) {
  console.error("parent env leaked into passthrough")
  process.exit(78)
}

if (args[0] === "--version") {
  console.log("OpenCode 1.16.0")
  process.exit(0)
}

if (args[0] === "large") {
  process.stdout.write("x".repeat(17 * 1024 * 1024), () => process.exit(0))
  return
}

if (args[0] === "slow") {
  setTimeout(() => {
    console.log("slow completed")
    process.exit(0)
  }, Number(args[1] ?? 1200))
  return
}

if (args[0] === "signal") {
  process.kill(process.pid, args[1] ?? "SIGTERM")
}

console.log(JSON.stringify({
  args,
  cwd: process.cwd(),
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
    OPENCODE_CONFIG: process.env.OPENCODE_CONFIG ?? null,
    OPENCODE_TUI_CONFIG: process.env.OPENCODE_TUI_CONFIG ?? null,
    OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD ?? null,
    PATH_PRESENT: typeof process.env.PATH === "string" && process.env.PATH.length > 0
  }
}))
console.error("provider stderr token=provider-secret")

if (args[0] === "exit") {
  process.exit(Number(args[1] ?? 1))
}

process.exit(0)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCodeProvider passthrough", () => {
  it("executes native args without interpretation and preserves provider output", async () => {
    const root = await createTempRoot("agentproxy-opencode-passthrough-test-");
    const workspacePath = path.join(root, "workspace");
    const binaryDirectory = path.join(workspacePath, "bin");
    const invocationLogPath = path.join(root, "invocations.jsonl");
    await mkdir(workspacePath, { recursive: true });
    await createFakeOpenCodeBinary(binaryDirectory, { invocationLogPath });
    const provider = new OpenCodeProvider({
      binary: "./bin/opencode",
      env: {
        PATH: createTestPath(binaryDirectory),
        OPENAI_API_KEY: "sk-parent-secret",
        AWS_SECRET_ACCESS_KEY: "aws-parent-secret",
        OPENCODE_TUI_CONFIG: "not-explicitly-forwarded",
      },
      passthroughEnv: {
        OPENCODE_CONFIG: path.join(root, "opencode.json"),
        OPENCODE_SERVER_PASSWORD: "allowed-provider-secret",
      },
    });

    const result = await provider.passthrough({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath,
      args: ["mcp", "list", "--api-key=sk-native-arg-secret"],
      metadata: {},
    });
    const stdout = JSON.parse(result.stdout) as {
      args: string[];
      cwd: string;
      env: Record<string, string | boolean | null>;
    };

    expect(result.exitCode).toBe(0);
    const invocations = (await readFile(invocationLogPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[] });
    expect(invocations).toEqual([
      {
        args: ["mcp", "list", "--api-key=sk-native-arg-secret"],
      },
    ]);
    expect(stdout.args).toEqual(["mcp", "list", "--api-key=sk-native-arg-secret"]);
    expect(stdout.cwd).toBe(await realpath(workspacePath));
    expect(stdout.env.OPENAI_API_KEY).toBeNull();
    expect(stdout.env.OPENCODE_TUI_CONFIG).toBeNull();
    expect(stdout.env.OPENCODE_CONFIG).toBe(path.join(root, "opencode.json"));
    expect(stdout.env.OPENCODE_SERVER_PASSWORD).toBe("allowed-provider-secret");
    expect(stdout.env.PATH_PRESENT).toBe(true);
    expect(result.stderr).toBe("provider stderr token=provider-secret\n");
    expect(result.metadata).toMatchObject({
      opencode: {
        passthrough: {
          source: "cli",
          binarySource: "config",
          cwd: workspacePath,
          exitCode: 0,
          injectedEnvKeys: ["OPENCODE_CONFIG", "OPENCODE_SERVER_PASSWORD"],
        },
      },
    });
    expect(JSON.stringify(result.metadata)).not.toContain("sk-native-arg-secret");
    expect(JSON.stringify(result.metadata)).not.toContain("allowed-provider-secret");
    expect(JSON.stringify(result.metadata)).not.toContain("sk-parent-secret");
    expect(JSON.stringify(result.metadata)).not.toContain("aws-parent-secret");
  });

  it("returns the provider exit code instead of throwing for native command failures", async () => {
    const root = await createTempRoot("agentproxy-opencode-passthrough-exit-test-");
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await createFakeOpenCodeBinary(binaryDirectory);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      env: { PATH: createTestPath(binaryDirectory) },
    });

    const result = await provider.passthrough({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: root,
      args: ["exit", "23"],
      metadata: {},
    });

    expect(result.exitCode).toBe(23);
    expect(result.stderr).toBe("provider stderr token=provider-secret\n");
  });

  it("does not impose a hidden provider output cap", async () => {
    const root = await createTempRoot("agentproxy-opencode-passthrough-large-test-");
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await createFakeOpenCodeBinary(binaryDirectory);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      env: { PATH: createTestPath(binaryDirectory) },
    });

    const result = await provider.passthrough({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: root,
      args: ["large"],
      metadata: {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toHaveLength(17 * 1024 * 1024);
    expect(result.stderr).toBe("");
  });

  it("does not impose a hidden default timeout", async () => {
    const root = await createTempRoot("agentproxy-opencode-passthrough-slow-test-");
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await createFakeOpenCodeBinary(binaryDirectory);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      env: { PATH: createTestPath(binaryDirectory) },
    });

    const result = await provider.passthrough({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: root,
      args: ["slow", "1200"],
      metadata: {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("slow completed\n");
  });

  it("maps signal exits to common shell-compatible exit codes", async () => {
    const root = await createTempRoot("agentproxy-opencode-passthrough-signal-test-");
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await createFakeOpenCodeBinary(binaryDirectory);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      env: { PATH: createTestPath(binaryDirectory) },
    });

    const result = await provider.passthrough({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: root,
      args: ["signal", "SIGTERM"],
      metadata: {},
    });

    expect(result.exitCode).toBe(143);
    expect(result.metadata).toMatchObject({
      opencode: {
        passthrough: {
          signal: "SIGTERM",
        },
      },
    });
  });

  it("maps missing binaries to stable provider unavailable errors", async () => {
    const provider = new OpenCodeProvider({
      binary: "missing-opencode",
      env: { PATH: "" },
      requestTimeoutMs: 500,
    });

    await expect(
      provider.passthrough({
        providerId: OPENCODE_PROVIDER_ID,
        args: ["--version"],
        metadata: {},
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.passthrough",
    });

    await provider
      .passthrough({
        providerId: OPENCODE_PROVIDER_ID,
        args: ["--version"],
        metadata: {},
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(AgentProxyError);
        expect(JSON.stringify(error)).not.toContain("PATH=");
      });
  });
});
