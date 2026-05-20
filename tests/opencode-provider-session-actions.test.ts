import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../src/providers/index.js";

const servers: Server[] = [];
const tempRoots: string[] = [];

async function startFakeOpenCodeServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: string }> {
  const server = createServer(handler);
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
  };
}

async function createFakeOpenCodeBinary(root: string): Promise<string> {
  const binaryDirectory = path.join(root, "bin");
  await mkdir(binaryDirectory, { recursive: true });
  const binaryPath = path.join(binaryDirectory, "opencode");
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2)

if (args[0] === "--version") {
  console.log("OpenCode 1.16.0")
  process.exit(0)
}

if (args[0] === "export") {
  const sanitized = args.includes("--sanitize")
  console.log(JSON.stringify({
    id: args[1],
    sanitized,
    transcript: sanitized ? "[sanitized]" : "raw transcript secret-token"
  }))
  process.exit(0)
}

if (args[0] === "import") {
  console.log(JSON.stringify({
    id: "ses_imported",
    directory: process.cwd(),
    title: "Imported provider session",
    version: "1.16.0",
    time: {
      created: Date.parse("2026-05-20T21:00:00.000Z"),
      updated: Date.parse("2026-05-20T21:00:01.000Z")
    }
  }))
  process.exit(0)
}

console.error("unexpected args " + args.join(" "))
process.exit(64)
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections();
  }

  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );

  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCodeProvider session operations", () => {
  it("aborts, deletes, shares, and unshares sessions through the OpenCode server API", async () => {
    const workspacePath = "/tmp/agentproxy-session-actions";
    const calls: string[] = [];
    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      calls.push(`${request.method} ${url.pathname}`);

      if (
        request.method === "POST" &&
        url.pathname === "/session/ses_action/abort" &&
        url.searchParams.get("directory") === workspacePath
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      if (
        request.method === "DELETE" &&
        url.pathname === "/session/ses_action" &&
        url.searchParams.get("directory") === workspacePath
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/session/ses_action/share" &&
        url.searchParams.get("directory") === workspacePath
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            url: "https://share.example.test/session/ses_action?token=share-secret-token",
          }),
        );
        return;
      }

      if (
        request.method === "DELETE" &&
        url.pathname === "/session/ses_action/share" &&
        url.searchParams.get("directory") === workspacePath
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found secret-token" }));
    });
    const provider = new OpenCodeProvider({ baseUrl, requestTimeoutMs: 250 });
    const context = {
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_action",
      workspacePath,
      metadata: {},
    };

    await expect(provider.abortSession(context)).resolves.toBeUndefined();
    await expect(provider.deleteSession(context)).resolves.toBeUndefined();
    const share = await provider.shareSession(context);
    await expect(provider.unshareSession(context)).resolves.toBeUndefined();

    expect(calls).toEqual([
      "POST /session/ses_action/abort",
      "DELETE /session/ses_action",
      "POST /session/ses_action/share",
      "DELETE /session/ses_action/share",
    ]);
    expect(share).toEqual({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_action",
      url: "https://share.example.test/session/ses_action?token=share-secret-token",
      metadata: {
        opencode: {
          share: {
            shared: true,
          },
        },
      },
    });
    expect(JSON.stringify(share.metadata)).not.toContain("share-secret-token");
  });

  it("maps session operation failures to stable sanitized errors", async () => {
    const missingRuntimeProvider = new OpenCodeProvider({ requestTimeoutMs: 250 });

    await expect(
      missingRuntimeProvider.deleteSession({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_missing_runtime",
        metadata: {},
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      operation: "opencode.provider.deleteSession",
    });

    const { baseUrl } = await startFakeOpenCodeServer((request, response) => {
      if (request.method === "POST" && request.url === "/session/ses_forbidden/share") {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "auth failed secret-token" }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found secret-token" }));
    });
    const provider = new OpenCodeProvider({
      baseUrl: `${baseUrl}?token=secret-token`,
      requestTimeoutMs: 250,
    });

    let error: unknown;
    try {
      await provider.shareSession({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_forbidden",
        metadata: {},
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AgentProxyError);
    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      operation: "opencode.provider.shareSession",
    });
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });

  it("exports sanitized data by default and requires explicit confirmation for raw export", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-actions-test-"));
    tempRoots.push(root);
    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, { recursive: true });
    const binaryPath = await createFakeOpenCodeBinary(workspacePath);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      cwd: workspacePath,
      requestTimeoutMs: 250,
    });

    const sanitized = await provider.exportSession({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_exported",
      workspacePath,
      metadata: {},
    });

    expect(sanitized).toEqual({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_exported",
      sanitized: true,
      data: {
        id: "ses_exported",
        sanitized: true,
        transcript: "[sanitized]",
      },
      metadata: {
        opencode: {
          export: {
            sanitized: true,
            source: "cli",
          },
        },
      },
    });

    await expect(
      provider.exportSession({
        providerId: OPENCODE_PROVIDER_ID,
        providerSessionId: "ses_exported",
        workspacePath,
        raw: true,
        metadata: {},
      }),
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      operation: "opencode.provider.exportSession",
      details: {
        failureReason: "raw_export_requires_confirmation",
      },
    });

    const raw = await provider.exportSession({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_exported",
      workspacePath,
      raw: true,
      rawConfirmed: true,
      metadata: {},
    });

    expect(raw.sanitized).toBe(false);
    expect(raw.data).toMatchObject({
      id: "ses_exported",
      sanitized: false,
      transcript: "raw transcript secret-token",
    });
  });

  it("imports a session through native OpenCode import and maps the returned provider session", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-import-test-"));
    tempRoots.push(root);
    const workspacePath = path.join(root, "workspace");
    await mkdir(workspacePath, { recursive: true });
    const binaryPath = await createFakeOpenCodeBinary(workspacePath);
    const provider = new OpenCodeProvider({
      binary: binaryPath,
      cwd: workspacePath,
      requestTimeoutMs: 250,
    });

    const imported = await provider.importSession({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath,
      source: "https://share.example.test/import?token=source-secret-token",
      metadata: {},
    });

    expect(imported).toMatchObject({
      providerId: OPENCODE_PROVIDER_ID,
      providerSessionId: "ses_imported",
      title: "Imported provider session",
      status: "unknown",
      createdAt: "2026-05-20T21:00:00.000Z",
      updatedAt: "2026-05-20T21:00:01.000Z",
      lastRunAt: "2026-05-20T21:00:01.000Z",
      metadata: {
        opencode: {
          session: {
            version: "1.16.0",
          },
          import: {
            source: "cli",
          },
        },
      },
    });
    expect(imported.workspacePath).toMatch(/workspace$/u);
    expect(imported.metadata.opencode).toMatchObject({
      session: {
        directory: imported.workspacePath,
      },
    });
    expect(JSON.stringify(imported)).not.toContain("source-secret-token");
  });
});
