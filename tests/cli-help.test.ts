import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Command } from "commander";
import {
  AGENTPROXY_VERSION,
  createProgram,
  main,
  mapCliErrorToExitCode,
  normalizeCliArgv,
} from "../src/cli/index.js";
import { createAgentProxyError } from "../src/core/index.js";
import { createOutputWriters } from "../src/logging/index.js";

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

function exitOverrideDeep(command: Command): void {
  command.exitOverride();
  for (const child of command.commands) {
    exitOverrideDeep(child);
  }
}

describe("agentproxy CLI placeholder", () => {
  it("prints the product name in help", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("agentproxy");
    expect(help).toContain("Thin control plane");
    expect(help).toContain("doctor");
    expect(help).toContain("provider");
  });

  it("exposes a placeholder version", () => {
    expect(AGENTPROXY_VERSION).toBe("0.1.0");
  });

  it("normalizes the pnpm run argument separator before parsing", () => {
    expect(normalizeCliArgv(["node", "agentproxy", "--", "--help"])).toEqual([
      "node",
      "agentproxy",
      "--help",
    ]);
  });

  it("redacts secret-shaped Commander option parse errors on stderr", async () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      output: createOutputWriters({ stdout, stderr }),
    });
    exitOverrideDeep(program);

    const error = await program
      .parseAsync(["node", "agentproxy", "run", "--api-key=sk-cli-secret"])
      .catch((caught: unknown) => caught);

    expect(error).toHaveProperty("code", "commander.unknownOption");
    expect(stdout.chunks.join("")).toBe("");
    expect(stderr.chunks.join("")).toContain("unknown option '--api-key=[REDACTED]'");
    expect(stderr.chunks.join("")).not.toContain("sk-cli-secret");
  });

  it("maps Commander parse errors to the stable argument exit code", async () => {
    const originalExitCode = process.exitCode;
    const stdout = createMemorySink();
    const stderr = createMemorySink();

    try {
      await main(["node", "agentproxy", "run", "--api-key=sk-cli-secret"], {
        output: createOutputWriters({ stdout, stderr }),
      });

      expect(process.exitCode).toBe(2);
      expect(stdout.chunks.join("")).toBe("");
      expect(stderr.chunks.join("")).toContain("unknown option '--api-key=[REDACTED]'");
      expect(stderr.chunks.join("")).not.toContain("sk-cli-secret");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("redacts secret-shaped Commander unknown command errors on stderr", async () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      output: createOutputWriters({ stdout, stderr }),
    });
    exitOverrideDeep(program);

    const error = await program
      .parseAsync(["node", "agentproxy", "OPENAI_API_KEY=sk-command-secret"])
      .catch((caught: unknown) => caught);

    expect(error).toHaveProperty("code", "commander.unknownCommand");
    expect(stdout.chunks.join("")).toBe("");
    expect(stderr.chunks.join("")).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(stderr.chunks.join("")).not.toContain("sk-command-secret");
  });

  it("removes terminal controls from Commander parse diagnostics", async () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      output: createOutputWriters({ stdout, stderr }),
    });
    exitOverrideDeep(program);

    const error = await program
      .parseAsync([
        "node",
        "agentproxy",
        "run",
        "--bad=\u001B]0;token=sk-osc-secret\u0007\n\tsecond-line",
      ])
      .catch((caught: unknown) => caught);

    expect(error).toHaveProperty("code", "commander.unknownOption");
    expect(stdout.chunks.join("")).toBe("");
    expect(stderr.chunks.join("")).toContain("unknown option '--bad=");
    expect(stderr.chunks.join("")).not.toContain("\u001B]");
    expect(stderr.chunks.join("")).not.toContain("\u0007");
    expect(stderr.chunks.join("")).not.toContain("\t");
    expect(stderr.chunks.join("")).not.toContain("\n\t");
    expect(stderr.chunks.join("")).not.toContain("sk-osc-secret");
  });

  it("runs doctor as a real workflow instead of the planned placeholder", async () => {
    const originalExitCode = process.exitCode;
    const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-help-doctor-test-"));
    const workspacePath = path.join(root, "workspace");
    const homeDir = path.join(root, "home");
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(homeDir, { recursive: true }),
    ]);
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir,
      env: {
        PATH: "",
      },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "doctor"]);

      expect(process.exitCode).not.toBe(6);
      expect(stdout.chunks.join("")).toContain("AgentProxy doctor:");
      expect(stdout.chunks.join("")).not.toContain("planned for a later phase");
      expect(stderr.chunks.join("")).toBe("");
    } finally {
      process.exitCode = originalExitCode;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows every registered command and subcommand to render help", () => {
    const program = createProgram();

    for (const command of collectCommands(program)) {
      expect(() => command.helpInformation()).not.toThrow();
      expect(command.helpInformation()).toContain("Usage:");
    }
  });

  it("parses global flags from nested commands", async () => {
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-help-config-test-"));
    const workspacePath = path.join(root, "workspace");
    const homeDir = path.join(root, "home");
    const configPath = path.join(workspacePath, "agentproxy.json");
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(homeDir, { recursive: true }),
    ]);
    await writeFile(
      configPath,
      JSON.stringify({
        storage: {
          path: path.join(root, "data", "agentproxy.sqlite3"),
        },
      }),
      "utf8",
    );
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      homeDir,
      env: {},
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "config",
        "get",
        "--json",
        "--provider",
        "opencode",
        "--workspace",
        ".",
        "--verbose",
        "--debug",
        "--config",
        "./agentproxy.json",
      ]);

      expect(process.exitCode).toBe(0);
      expect(stdout.chunks.join("")).toContain('"ok":true');
      expect(stderr.chunks.join("")).toBe("");
    } finally {
      process.exitCode = originalExitCode;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps planned command diagnostics on stderr in human mode", async () => {
    const originalExitCode = process.exitCode;
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "config",
        "set",
        "providers.opencode.enabled",
        "true",
      ]);

      expect(process.exitCode).toBe(6);
      expect(stdout.chunks.join("")).toBe("");
      expect(stderr.chunks.join("")).toContain(
        "CAPABILITY_UNSUPPORTED: agentproxy config set is planned",
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("maps AgentProxy errors to the planned stable exit-code table", () => {
    expect(mapCliErrorToExitCode(new Error("generic"))).toBe(1);
    expect(mapCliErrorToExitCode({ code: "commander.unknownOption", exitCode: 1 })).toBe(2);
    expect(
      mapCliErrorToExitCode(createAgentProxyError({ code: "CONFIG_INVALID", message: "config" })),
    ).toBe(3);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "PROVIDER_NOT_FOUND", message: "provider" }),
      ),
    ).toBe(4);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "PROVIDER_UNAVAILABLE", message: "provider" }),
      ),
    ).toBe(4);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "RUNTIME_START_FAILED", message: "runtime" }),
      ),
    ).toBe(5);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "CAPABILITY_UNSUPPORTED", message: "capability" }),
      ),
    ).toBe(6);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "PERMISSION_DENIED", message: "permission" }),
      ),
    ).toBe(8);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "RUNTIME_HEALTH_FAILED", message: "connection" }),
      ),
    ).toBe(9);
    expect(
      mapCliErrorToExitCode(
        createAgentProxyError({ code: "EVENT_STREAM_INTERRUPTED", message: "connection" }),
      ),
    ).toBe(9);
    expect(
      mapCliErrorToExitCode(createAgentProxyError({ code: "STORAGE_ERROR", message: "storage" })),
    ).toBe(10);
  });
});

function collectCommands(command: Command): Command[] {
  return [command, ...command.commands.flatMap((child) => collectCommands(child))];
}
