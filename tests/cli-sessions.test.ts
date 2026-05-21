import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { createOutputWriters } from "../src/logging/index.js";
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
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-sessions-test-"));
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

function seedSessionRegistry(workspace: TestWorkspace): void {
  const storage = openAgentProxyStorage({ databasePath: workspace.storagePath });
  try {
    storage.sessions.upsert({
      id: "apx_other_workspace",
      providerId: "opencode",
      providerSessionId: "ses_other_workspace",
      workspacePath: workspace.otherWorkspacePath,
      title: "Other workspace",
      status: "completed",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T08:30:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_other_provider",
      providerId: "mock",
      providerSessionId: "ses_other_provider",
      workspacePath: workspace.workspacePath,
      title: "Other provider",
      status: "completed",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T08:00:00.000Z",
      metadata: {},
    });
    storage.sessions.upsert({
      id: "apx_deleted",
      providerId: "opencode",
      providerSessionId: "ses_deleted",
      workspacePath: workspace.workspacePath,
      title: "Deleted token=deleted-secret",
      status: "idle",
      createdAt: "2026-05-21T05:00:00.000Z",
      updatedAt: "2026-05-21T09:00:00.000Z",
      deletedAt: "2026-05-21T09:10:00.000Z",
      tombstoneReason: "provider_deleted",
      metadata: {
        secret: "deleted-metadata-secret",
      },
    });
    storage.sessions.upsert({
      id: "apx_recent",
      providerId: "opencode",
      providerSessionId: "ses_recent_token=provider-secret",
      workspacePath: workspace.workspacePath,
      title: "\u001B[31mLatest token=title-secret\u001B[0m",
      status: "running",
      model: "anthropic/claude-sonnet-4-5",
      runtimeId: "runtime_1",
      parentSessionId: "apx_parent",
      createdAt: "2026-05-21T06:00:00.000Z",
      updatedAt: "2026-05-21T07:30:00.000Z",
      lastRunAt: "2026-05-21T07:35:00.000Z",
      lastSyncAt: "2026-05-21T07:36:00.000Z",
      lastError: "Authorization: Bearer sk-last-error-secret",
      metadata: {
        authorization: "Bearer sk-session-metadata-secret",
        transcript: "do not print provider transcript",
      },
    });
    storage.sessions.upsert({
      id: "apx_older",
      providerId: "opencode",
      providerSessionId: "ses_older",
      workspacePath: workspace.workspacePath,
      title: "Older session",
      status: "completed",
      model: "openai/gpt-5",
      createdAt: "2026-05-21T05:30:00.000Z",
      updatedAt: "2026-05-21T06:30:00.000Z",
      lastRunAt: "2026-05-21T06:45:00.000Z",
      metadata: {},
    });
  } finally {
    storage.close();
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy sessions CLI", () => {
  it("prints one JSON sessions list report without the planned placeholder", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--json", "--config", workspace.configPath],
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
      sessions: [
        {
          id: "apx_recent",
          providerId: "opencode",
          providerSessionId: "ses_recent_token=[REDACTED]",
          title: "Latest token=[REDACTED]",
          status: "running",
          model: "anthropic/claude-sonnet-4-5",
          runtimeId: "runtime_1",
          parentSessionId: "apx_parent",
          lastError: "Authorization: [REDACTED]",
        },
        {
          id: "apx_older",
          providerId: "opencode",
          providerSessionId: "ses_older",
          title: "Older session",
          status: "completed",
          model: "openai/gpt-5",
        },
      ],
    });
    expect(report.sessions).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain("apx_other_workspace");
    expect(JSON.stringify(report)).not.toContain("apx_other_provider");
    expect(JSON.stringify(report)).not.toContain("apx_deleted");
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-last-error-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("prints terminal-safe human sessions list output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("AgentProxy sessions: 2");
    expect(result.stdout).toContain("apx_recent");
    expect(result.stdout).toContain("running");
    expect(result.stdout).toContain("Latest token=[REDACTED]");
    expect(result.stdout).toContain("ses_recent_token=[REDACTED]");
    expect(result.stdout).not.toContain("apx_deleted");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("prints one JSON sessions show report without the planned placeholder", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_recent", "--json", "--config", workspace.configPath],
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
      session: {
        id: "apx_recent",
        providerId: "opencode",
        providerSessionId: "ses_recent_token=[REDACTED]",
        workspacePath: workspace.workspacePath,
        title: "Latest token=[REDACTED]",
        status: "running",
        model: "anthropic/claude-sonnet-4-5",
        runtimeId: "runtime_1",
        parentSessionId: "apx_parent",
        createdAt: "2026-05-21T06:00:00.000Z",
        updatedAt: "2026-05-21T07:30:00.000Z",
        lastRunAt: "2026-05-21T07:35:00.000Z",
        lastSyncAt: "2026-05-21T07:36:00.000Z",
        lastError: "Authorization: [REDACTED]",
        sourceOfTruth: "provider_content_agentproxy_index",
      },
    });
    expect(JSON.stringify(report)).not.toContain("provider-secret");
    expect(JSON.stringify(report)).not.toContain("title-secret");
    expect(JSON.stringify(report)).not.toContain("sk-last-error-secret");
    expect(JSON.stringify(report)).not.toContain("sk-session-metadata-secret");
    expect(JSON.stringify(report)).not.toContain("provider transcript");
    expect(JSON.stringify(report)).not.toContain("\u001B[31m");
  });

  it("prints terminal-safe human sessions show output", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_recent", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("AgentProxy session: apx_recent");
    expect(result.stdout).toContain("Status: running");
    expect(result.stdout).toContain("Title: Latest token=[REDACTED]");
    expect(result.stdout).toContain("Provider session: ses_recent_token=[REDACTED]");
    expect(result.stdout).toContain("Source of truth: provider_content_agentproxy_index");
    expect(result.stdout).not.toContain("provider-secret");
    expect(result.stdout).not.toContain("title-secret");
    expect(result.stdout).not.toContain("sk-session-metadata-secret");
    expect(result.stdout).not.toContain("provider transcript");
    expect(result.stdout).not.toContain("\u001B[31m");
  });

  it("succeeds with an empty list when the session registry database is absent", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "list", "--json", "--config", workspace.configPath],
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
      sessions: [],
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("does not create storage and reports SESSION_NOT_FOUND when showing from an absent database", async () => {
    const workspace = await createTestWorkspace();

    const result = await runCli({
      workspace,
      argv: ["sessions", "show", "apx_missing", "--json", "--config", workspace.configPath],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        providerId: "opencode",
        operation: "sessions.show",
      },
    });
    expect(existsSync(workspace.storagePath)).toBe(false);
    expect(existsSync(path.dirname(workspace.storagePath))).toBe(false);
  });

  it("treats missing, tombstoned, wrong-workspace, and wrong-provider sessions as not found", async () => {
    const workspace = await createTestWorkspace();
    seedSessionRegistry(workspace);

    for (const sessionId of [
      "apx_missing",
      "apx_deleted",
      "apx_other_workspace",
      "apx_other_provider",
    ]) {
      const result = await runCli({
        workspace,
        argv: ["sessions", "show", sessionId, "--json", "--config", workspace.configPath],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          providerId: "opencode",
          operation: "sessions.show",
        },
      });
      expect(result.stdout).not.toContain("deleted-secret");
      expect(result.stdout).not.toContain("deleted-metadata-secret");
      expect(result.stdout).not.toContain("Other workspace");
      expect(result.stdout).not.toContain("Other provider");
    }
  });

  it("maps invalid and disabled provider errors without leaking controls", async () => {
    const enabledWorkspace = await createTestWorkspace();
    const disabledWorkspace = await createTestWorkspace({ enabled: false });

    const missing = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
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
        "sessions",
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

    const missingShow = await runCli({
      workspace: enabledWorkspace,
      argv: [
        "sessions",
        "show",
        "apx_recent",
        "--provider",
        "\u001B[31mmissing-token=provider-secret\u001B[0m",
        "--json",
        "--config",
        enabledWorkspace.configPath,
      ],
    });
    expect(missingShow.exitCode).toBe(4);
    expect(JSON.parse(missingShow.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        providerId: "missing-token=[REDACTED]",
        operation: "sessions.show",
      },
    });
    expect(missingShow.stdout).not.toContain("\u001B[31m");
    expect(missingShow.stdout).not.toContain("provider-secret");

    const disabled = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "list", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabled.exitCode).toBe(4);
    expect(JSON.parse(disabled.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
      },
    });

    const disabledShow = await runCli({
      workspace: disabledWorkspace,
      argv: ["sessions", "show", "apx_recent", "--json", "--config", disabledWorkspace.configPath],
    });
    expect(disabledShow.exitCode).toBe(4);
    expect(JSON.parse(disabledShow.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        providerId: "opencode",
        operation: "sessions.show",
      },
    });
  });

  it("leaves later mutating session commands, runtime stop, and config as planned placeholders", async () => {
    const workspace = await createTestWorkspace();

    for (const argv of [
      ["sessions", "resume", "apx_123", "--config", workspace.configPath],
      ["sessions", "abort", "apx_123", "--config", workspace.configPath],
      ["sessions", "delete", "apx_123", "--config", workspace.configPath],
      ["sessions", "export", "apx_123", "--config", workspace.configPath],
      ["sessions", "import", "session.json", "--config", workspace.configPath],
      ["sessions", "share", "apx_123", "--config", workspace.configPath],
      ["sessions", "unshare", "apx_123", "--config", workspace.configPath],
      ["runtime", "stop", "runtime_123", "--config", workspace.configPath],
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
