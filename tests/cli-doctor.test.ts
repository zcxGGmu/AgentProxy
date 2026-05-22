import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../src/cli/index.js";
import { mapDoctorReportToExitCode, runAgentProxyDoctor } from "../src/cli/doctor.js";
import { createOutputWriters } from "../src/logging/index.js";
import { openAgentProxyStorage } from "../src/storage/index.js";

const tempRoots: string[] = [];
const servers: Server[] = [];
const eventResponses: ServerResponse[] = [];

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
  binaryDirectory: string;
  configPath: string;
  storagePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-cli-doctor-test-"));
  tempRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  const binaryDirectory = path.join(root, "bin");
  const configPath = path.join(root, "agentproxy.json");
  const storagePath = path.join(root, "data", "agentproxy.sqlite3");
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(binaryDirectory, { recursive: true }),
    mkdir(path.dirname(storagePath), { recursive: true }),
  ]);

  return {
    root,
    workspacePath,
    binaryDirectory,
    configPath,
    storagePath,
  };
}

async function writeVersionOnlyOpenCodeBinary(directory: string): Promise<string> {
  const binaryPath = path.join(directory, "opencode");
  await writeFile(
    binaryPath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "OpenCode 1.15.5"
  exit 0
fi

echo "doctor test binary only supports --version" >&2
exit 64
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function writeFailingStatusGitBinary(directory: string): Promise<string> {
  const binaryPath = path.join(directory, "git");
  await writeFile(
    binaryPath,
    `#!/bin/sh
case "$*" in
  *"--is-inside-work-tree"*)
    echo true
    exit 0
    ;;
  *"--show-toplevel"*)
    echo /fake/git-root
    exit 0
    ;;
  *"--abbrev-ref"*)
    echo main
    exit 0
    ;;
  *"status"*)
    echo status failed >&2
    exit 2
    ;;
esac
exit 64
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function writeFailingProbeGitBinary(directory: string): Promise<string> {
  const binaryPath = path.join(directory, "git");
  await writeFile(
    binaryPath,
    `#!/bin/sh
case "$*" in
  *"--is-inside-work-tree"*)
    echo probe failed >&2
    exit 2
    ;;
esac
exit 64
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

async function writeNotGitRepositoryGitBinary(directory: string): Promise<string> {
  const binaryPath = path.join(directory, "git");
  await writeFile(
    binaryPath,
    `#!/bin/sh
case "$*" in
  *"--is-inside-work-tree"*)
    echo "fatal: not a git repository (or any of the parent directories): .git" >&2
    exit 128
    ;;
esac
exit 64
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
  binary: string;
  baseUrl?: string;
}): Promise<void> {
  await writeFile(
    input.configPath,
    JSON.stringify(
      {
        workspacePath: input.workspacePath,
        storage: {
          path: input.storagePath,
        },
        providers: {
          opencode: {
            enabled: true,
            binary: input.binary,
            runtime: {
              mode: input.baseUrl === undefined ? "managed" : "attached",
              hostname: "127.0.0.1",
              port: 4096,
              ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function registerHealthyRuntime(input: {
  storagePath: string;
  workspacePath: string;
  baseUrl: string;
  port: number;
  status?: "healthy" | "stopped";
}): Promise<void> {
  const storage = openAgentProxyStorage({ databasePath: input.storagePath });
  try {
    storage.runtimes.upsert({
      id: "runtime_cli_doctor_healthy",
      providerId: "opencode",
      mode: "attached",
      status: input.status ?? "healthy",
      baseUrl: input.baseUrl,
      hostname: "127.0.0.1",
      port: input.port,
      workspacePath: input.workspacePath,
      startedAt: "2026-05-21T00:00:00.000Z",
      metadata: {
        source: "cli-doctor-test",
      },
    });
  } finally {
    storage.close();
  }
}

async function startFakeOpenCodeServer(): Promise<{ baseUrl: string; port: number }> {
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const url = request.url ?? "/";

    if (method === "GET" && url === "/global/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "1.16.0" }));
      return;
    }

    if (method === "GET" && url === "/event") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      });
      response.write('data: {"type":"server.connected"}\\n\\n');
      eventResponses.push(response);
      return;
    }

    if (method === "GET" && url === "/doc") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>OpenAPI 3.1</html>");
      return;
    }

    if (method === "GET" && ["/session", "/provider", "/command", "/mcp"].includes(url)) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(url === "/session" ? "[]" : "{}");
      return;
    }

    if (method === "GET" && ["/session/status", "/lsp", "/formatter", "/agent"].includes(url)) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    if (method === "OPTIONS") {
      const allow = allowHeaderForProbePath(url);
      if (allow !== undefined) {
        response.writeHead(204, { allow });
        response.end();
        return;
      }
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  servers.push(server);

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected fake OpenCode server to listen on a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
  };
}

function allowHeaderForProbePath(url: string): string | undefined {
  switch (url) {
    case "/session":
      return "GET, POST";
    case "/session/__agentproxy_probe__":
      return "GET, PATCH, DELETE";
    case "/session/__agentproxy_probe__/abort":
      return "POST";
    case "/session/__agentproxy_probe__/fork":
      return "POST";
    case "/session/__agentproxy_probe__/share":
      return "POST, DELETE";
    case "/session/__agentproxy_probe__/diff":
      return "GET";
    case "/session/__agentproxy_probe__/todo":
      return "GET";
    case "/session/__agentproxy_probe__/revert":
      return "POST";
    case "/session/__agentproxy_probe__/message":
      return "GET, POST";
    case "/session/__agentproxy_probe__/permissions/__permission_probe__":
      return "POST";
    case "/tui/append-prompt":
      return "POST";
    default:
      return undefined;
  }
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

afterEach(async () => {
  for (const response of eventResponses.splice(0)) {
    response.end();
  }

  for (const server of servers) {
    server.closeAllConnections();
  }
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agentproxy doctor CLI", () => {
  it("prints a single JSON doctor report with all core checks", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const binary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    const fakeOpenCode = await startFakeOpenCodeServer();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
      baseUrl: fakeOpenCode.baseUrl,
    });
    await registerHealthyRuntime({
      storagePath,
      workspacePath,
      baseUrl: fakeOpenCode.baseUrl,
      port: fakeOpenCode.port,
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(0);
      expect(stderr.chunks.join("")).toBe("");
      const stdoutText = stdout.chunks.join("");
      expect(stdoutText.trim().split("\n")).toHaveLength(1);
      const report = JSON.parse(stdoutText);
      expect(report.ok).toBe(true);
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "agentproxy.node", status: "passed" }),
          expect.objectContaining({ id: "agentproxy.config", status: "passed" }),
          expect.objectContaining({ id: "agentproxy.storage.sqlite", status: "passed" }),
          expect.objectContaining({ id: "opencode.binary", status: "passed" }),
          expect.objectContaining({ id: "opencode.version", status: "passed" }),
          expect.objectContaining({ id: "opencode.runtime.health", status: "passed" }),
          expect.objectContaining({ id: "opencode.provider.list", status: "passed" }),
          expect.objectContaining({ id: "opencode.mcp.status", status: "passed" }),
          expect.objectContaining({ id: "workspace.git" }),
        ]),
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("reports a missing OpenCode binary without using the planned placeholder", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath, configPath, storagePath } = await createTestRoot();
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary: path.join(root, "missing-opencode"),
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor"]);

      expect(process.exitCode).toBe(4);
      expect(stderr.chunks.join("")).toBe("");
      const stdoutText = stdout.chunks.join("");
      expect(stdoutText).toContain("AgentProxy doctor: failed");
      expect(stdoutText).toContain("OpenCode binary");
      expect(stdoutText).toContain("PROVIDER_UNAVAILABLE");
      expect(stdoutText).not.toContain("planned for a later phase");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("returns a JSON report for config failures", async () => {
    const originalExitCode = process.exitCode;
    const { root, workspacePath } = await createTestRoot();
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync([
        "node",
        "agentproxy",
        "--config",
        path.join(root, "missing-agentproxy.json"),
        "doctor",
        "--json",
      ]);

      expect(process.exitCode).toBe(3);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.ok).toBe(false);
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agentproxy.config",
            status: "failed",
            errorCode: "CONFIG_INVALID",
          }),
          expect.objectContaining({
            id: "agentproxy.storage.sqlite",
            status: "skipped",
          }),
        ]),
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("reports SQLite storage failures as doctor check failures", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath } = await createTestRoot();
    const binary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath: workspacePath,
      binary,
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(10);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.ok).toBe(false);
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agentproxy.storage.sqlite",
            status: "failed",
            errorCode: "STORAGE_ERROR",
          }),
          expect.objectContaining({
            id: "opencode.runtime.registry",
            status: "skipped",
          }),
        ]),
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("does not overwrite or delete existing provider records during the SQLite probe", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const binary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
    });
    const storage = openAgentProxyStorage({ databasePath: storagePath });
    try {
      storage.providers.upsert({
        id: "__agentproxy_doctor__",
        displayName: "User Provider With Conflicting Id",
        enabled: true,
        lastSeenVersion: "user-version",
        metadata: {
          owner: "user",
        },
      });
    } finally {
      storage.close();
    }
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(stderr.chunks.join("")).toBe("");
      const verifyStorage = openAgentProxyStorage({ databasePath: storagePath });
      try {
        expect(verifyStorage.providers.get("__agentproxy_doctor__")).toMatchObject({
          displayName: "User Provider With Conflicting Id",
          enabled: true,
          lastSeenVersion: "user-version",
          metadata: {
            owner: "user",
          },
        });
      } finally {
        verifyStorage.close();
      }
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("skips terminal registered runtimes instead of probing stale URLs by default", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const binary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
    });
    await registerHealthyRuntime({
      storagePath,
      workspacePath,
      baseUrl: "http://127.0.0.1:1",
      port: 1,
      status: "stopped",
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(0);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "opencode.runtime.health",
            status: "skipped",
          }),
          expect.objectContaining({
            id: "opencode.provider.list",
            status: "skipped",
          }),
          expect.objectContaining({
            id: "opencode.mcp.status",
            status: "skipped",
          }),
        ]),
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("maps unsupported Node.js versions to the stable config exit code", async () => {
    const { root, workspacePath } = await createTestRoot();
    const report = await runAgentProxyDoctor({
      agentProxyVersion: "0.1.0",
      cwd: workspacePath,
      homeDir: path.join(root, "home"),
      env: {
        PATH: "",
      },
      nodeVersion: "21.0.0",
    });

    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "agentproxy.node",
          status: "failed",
          errorCode: "CONFIG_INVALID",
        }),
      ]),
    );
    expect(mapDoctorReportToExitCode(report)).toBe(3);
  });

  it("warns when Git status cannot be read instead of reporting a clean workspace", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const [binary] = await Promise.all([
      writeVersionOnlyOpenCodeBinary(binaryDirectory),
      writeFailingStatusGitBinary(binaryDirectory),
    ]);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      env: {
        PATH: binaryDirectory,
      },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(0);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "workspace.git",
            status: "warning",
            message: "Workspace Git status could not be read.",
            details: expect.objectContaining({
              failureReason: "git_status_failed",
            }),
          }),
        ]),
      );
      expect(stdout.chunks.join("")).not.toContain("clean Git repository");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("warns when the initial Git repository probe cannot be read", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const [binary] = await Promise.all([
      writeVersionOnlyOpenCodeBinary(binaryDirectory),
      writeFailingProbeGitBinary(binaryDirectory),
    ]);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      env: {
        PATH: binaryDirectory,
      },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(0);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "workspace.git",
            status: "warning",
            message: "Workspace Git repository probe could not be read.",
            details: expect.objectContaining({
              failureReason: "git_probe_failed",
            }),
          }),
        ]),
      );
      expect(stdout.chunks.join("")).not.toContain("clean Git repository");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("keeps a real non-Git repository probe result separate from Git probe failures", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const [binary] = await Promise.all([
      writeVersionOnlyOpenCodeBinary(binaryDirectory),
      writeNotGitRepositoryGitBinary(binaryDirectory),
    ]);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      env: {
        PATH: binaryDirectory,
      },
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).toBe(0);
      expect(stderr.chunks.join("")).toBe("");
      const report = JSON.parse(stdout.chunks.join(""));
      expect(report.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "workspace.git",
            status: "warning",
            message: "Workspace is not inside a Git repository.",
            details: expect.objectContaining({
              suggestion: "Run AgentProxy from a Git workspace for richer diagnostics.",
            }),
          }),
        ]),
      );
      expect(stdout.chunks.join("")).not.toContain("git_probe_failed");
      expect(stdout.chunks.join("")).not.toContain("clean Git repository");
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("redacts secrets from JSON doctor output", async () => {
    const originalExitCode = process.exitCode;
    const { workspacePath, binaryDirectory, configPath, storagePath } = await createTestRoot();
    const binary = await writeVersionOnlyOpenCodeBinary(binaryDirectory);
    await writeConfig({
      configPath,
      workspacePath,
      storagePath,
      binary,
      baseUrl: "http://user:password@127.0.0.1:1/path?token=super-secret-token#fragment",
    });
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const program = createProgram({
      cwd: workspacePath,
      output: createOutputWriters({ stdout, stderr }),
    });

    try {
      await program.parseAsync(["node", "agentproxy", "--config", configPath, "doctor", "--json"]);

      expect(process.exitCode).not.toBe(0);
      const stdoutText = stdout.chunks.join("");
      expect(stdoutText).not.toContain("user:password");
      expect(stdoutText).not.toContain("super-secret-token");
      expect(stdoutText).not.toContain("?token=");
      expect(stderr.chunks.join("")).toBe("");
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
