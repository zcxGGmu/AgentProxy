import { describe, expect, it } from "vitest";
import type { Command } from "commander";
import { AGENTPROXY_VERSION, createProgram, normalizeCliArgv } from "../src/cli/index.js";
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

  it("writes planned command diagnostics through the configured stderr writer", async () => {
    const originalExitCode = process.exitCode;
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "doctor"]);

      expect(process.exitCode).toBe(1);
      expect(stdout.chunks.join("")).toBe("");
      expect(stderr.chunks.join("")).toBe(
        "agentproxy doctor is planned for a later phase and is not implemented yet.\n",
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
