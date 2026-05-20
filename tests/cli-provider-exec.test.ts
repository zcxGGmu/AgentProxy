import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function createTempWorkspace(): Promise<{ root: string; workspacePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-provider-exec-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  await mkdir(path.join(workspacePath, ".agentproxy"), { recursive: true });
  return { root, workspacePath };
}

async function createFakeOpenCodeBinary(workspacePath: string): Promise<string> {
  const binaryDirectory = path.join(workspacePath, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  const binaryPath = path.join(binaryDirectory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2)

if (process.env.OPENAI_API_KEY !== undefined || process.env.AWS_SECRET_ACCESS_KEY !== undefined) {
  console.error("parent env leaked into provider exec")
  process.exit(78)
}

if (args[0] === "--version") {
  console.log("OpenCode 1.16.0")
  process.exit(0)
}

if (args[0] === "fail") {
  console.error("provider stderr token=provider-secret")
  process.exit(17)
}

console.error("unexpected args " + args.join(" "))
process.exit(64)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

function createTestPath(workspacePath: string): string {
  return [path.join(workspacePath, "bin"), process.env.PATH ?? ""].filter(Boolean).join(delimiter);
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy provider exec", () => {
  it("runs OpenCode native args after -- and preserves stdout", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath } = await createTempWorkspace();
    await createFakeOpenCodeBinary(workspacePath);
    await writeFile(
      path.join(workspacePath, ".agentproxy", "config.json"),
      JSON.stringify({
        providers: {
          opencode: {
            binary: "./bin/opencode",
          },
        },
      }),
      "utf8",
    );
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir: path.join(root, "home"),
      env: {
        PATH: createTestPath(workspacePath),
        OPENAI_API_KEY: "sk-cli-parent-secret",
        AWS_SECRET_ACCESS_KEY: "aws-cli-parent-secret",
      },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "provider",
        "exec",
        "opencode",
        "--",
        "--version",
      ]);

      expect(process.exitCode).toBe(0);
      expect(stdout.chunks.join("")).toBe("OpenCode 1.16.0\n");
      expect(stderr.chunks.join("")).toBe("");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("preserves provider stderr and non-zero exit codes", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath } = await createTempWorkspace();
    await createFakeOpenCodeBinary(workspacePath);
    await writeFile(
      path.join(workspacePath, ".agentproxy", "config.json"),
      JSON.stringify({
        providers: {
          opencode: {
            binary: "./bin/opencode",
          },
        },
      }),
      "utf8",
    );
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir: path.join(root, "home"),
      env: { PATH: createTestPath(workspacePath) },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "provider",
        "exec",
        "opencode",
        "--",
        "fail",
      ]);

      expect(process.exitCode).toBe(17);
      expect(stdout.chunks.join("")).toBe("");
      expect(stderr.chunks.join("")).toBe("provider stderr token=provider-secret\n");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("redacts AgentProxy diagnostics when provider lookup fails", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath } = await createTempWorkspace();
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir: path.join(root, "home"),
      env: { PATH: process.env.PATH ?? "" },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "provider",
        "exec",
        "missing",
        "--",
        "--api-key=sk-command-secret",
      ]);

      expect(process.exitCode).toBe(4);
      expect(stdout.chunks.join("")).toBe("");
      expect(stderr.chunks.join("")).toContain("PROVIDER_NOT_FOUND");
      expect(stderr.chunks.join("")).not.toContain("sk-command-secret");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("writes AgentProxy errors as redacted JSON on stdout in json mode", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath } = await createTempWorkspace();
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir: path.join(root, "home"),
      env: { PATH: process.env.PATH ?? "" },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "provider",
        "exec",
        "OPENAI_API_KEY=sk-json-secret",
        "--json",
        "--",
        "--version",
      ]);

      expect(process.exitCode).toBe(4);
      expect(stderr.chunks.join("")).toBe("");
      expect(stdout.chunks.join("")).not.toContain("sk-json-secret");
      expect(JSON.parse(stdout.chunks.join(""))).toMatchObject({
        ok: false,
        error: {
          code: "PROVIDER_NOT_FOUND",
          providerId: "OPENAI_API_KEY=[REDACTED]",
          operation: "provider.exec",
        },
      });
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
