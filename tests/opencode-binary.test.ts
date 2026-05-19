import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  OPENCODE_MINIMUM_SUPPORTED_VERSION,
  normalizeOpenCodeVersion,
  probeOpenCodeBinary,
} from "../src/providers/opencode/binary.js";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agentproxy-opencode-binary-test-"));
  tempRoots.push(root);
  return root;
}

async function writeFakeOpenCodeBinary(
  directory: string,
  output: string,
  options: { name?: string; exitCode?: number } = {},
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const binaryPath = path.join(directory, options.name ?? "opencode");
  const exitCode = options.exitCode ?? 0;
  await writeFile(
    binaryPath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "${output.replaceAll('"', '\\"')}"
  exit ${exitCode}
fi
printf '%s\\n' "unexpected args: $*" >&2
exit 64
`,
    "utf8",
  );
  await chmod(binaryPath, 0o755);
  return binaryPath;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenCode binary probe", () => {
  it("normalizes common OpenCode version output forms", () => {
    expect(normalizeOpenCodeVersion("1.15.5")).toBe("1.15.5");
    expect(normalizeOpenCodeVersion("v1.15.5")).toBe("1.15.5");
    expect(normalizeOpenCodeVersion("opencode version v1.15.5")).toBe("1.15.5");
    expect(normalizeOpenCodeVersion("opencode 1.15.5-beta.1+build.7")).toBe(
      "1.15.5-beta.1+build.7",
    );
  });

  it("locates the default opencode command from PATH and executes --version", async () => {
    const root = await createTempRoot();
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await writeFakeOpenCodeBinary(binaryDirectory, "opencode version v1.15.5");

    const probe = probeOpenCodeBinary({
      env: { PATH: binaryDirectory },
    });

    expect(probe).toEqual({
      binary: "opencode",
      resolvedPath: binaryPath,
      source: "path",
      version: "1.15.5",
      rawVersionOutput: "opencode version v1.15.5",
      minimumSupportedVersion: OPENCODE_MINIMUM_SUPPORTED_VERSION,
    });
  });

  it("uses a configured binary path before PATH discovery", async () => {
    const root = await createTempRoot();
    const configuredBinary = await writeFakeOpenCodeBinary(
      path.join(root, "configured"),
      "OpenCode 1.16.0",
      { name: "custom-opencode" },
    );

    const probe = probeOpenCodeBinary({
      binary: configuredBinary,
      env: { PATH: path.join(root, "empty-bin") },
    });

    expect(probe.binary).toBe(configuredBinary);
    expect(probe.resolvedPath).toBe(configuredBinary);
    expect(probe.source).toBe("config");
    expect(probe.version).toBe("1.16.0");
  });

  it("keeps configured command names distinct from the default PATH discovery source", async () => {
    const root = await createTempRoot();
    const binaryDirectory = path.join(root, "bin");
    const binaryPath = await writeFakeOpenCodeBinary(binaryDirectory, "OpenCode 1.16.1", {
      name: "custom-opencode",
    });

    const probe = probeOpenCodeBinary({
      binary: "custom-opencode",
      env: { PATH: binaryDirectory },
    });

    expect(probe.binary).toBe("custom-opencode");
    expect(probe.resolvedPath).toBe(binaryPath);
    expect(probe.source).toBe("config");
    expect(probe.version).toBe("1.16.1");
  });

  it("resolves configured relative paths from cwd without falling back to PATH", async () => {
    const root = await createTempRoot();
    const workspace = path.join(root, "workspace");
    const pathBinaryDirectory = path.join(root, "path-bin");
    const configuredBinary = await writeFakeOpenCodeBinary(workspace, "OpenCode 1.17.0");
    await writeFakeOpenCodeBinary(pathBinaryDirectory, "OpenCode 9.9.9");

    const probe = probeOpenCodeBinary({
      binary: "./opencode",
      cwd: workspace,
      env: { PATH: pathBinaryDirectory },
    });

    expect(probe.binary).toBe("./opencode");
    expect(probe.resolvedPath).toBe(configuredBinary);
    expect(probe.source).toBe("config");
    expect(probe.version).toBe("1.17.0");
  });

  it("maps a missing binary to PROVIDER_UNAVAILABLE with an install suggestion", () => {
    expect(() =>
      probeOpenCodeBinary({
        binary: "missing-opencode",
        env: { PATH: "" },
      }),
    ).toThrow(AgentProxyError);

    try {
      probeOpenCodeBinary({
        binary: "missing-opencode",
        env: { PATH: "" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(error.providerId).toBe("opencode");
        expect(error.operation).toBe("opencode.binary.probe");
        expect(error.message).toContain("OpenCode binary was not found");
        expect(error.details?.suggestion).toContain("npm install -g opencode-ai");
        expect(JSON.stringify(error.details)).not.toContain("PATH=");
      }
    }
  });

  it("maps a configured non-executable binary to PROVIDER_UNAVAILABLE", async () => {
    const root = await createTempRoot();
    const binaryPath = path.join(root, "opencode");
    await writeFile(binaryPath, "#!/bin/sh\nprintf '%s\\n' 'OpenCode 1.15.5'\n", "utf8");
    await chmod(binaryPath, 0o644);

    expect(() =>
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      }),
    ).toThrow(AgentProxyError);

    try {
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(error.message).toContain("not found or is not executable");
      }
    }
  });

  it("maps a failing --version command to PROVIDER_UNAVAILABLE", async () => {
    const root = await createTempRoot();
    const binaryPath = await writeFakeOpenCodeBinary(root, "OpenCode 1.15.5", { exitCode: 1 });

    expect(() =>
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      }),
    ).toThrow(AgentProxyError);

    try {
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(error.message).toContain("could not execute");
      }
    }
  });

  it("maps unparseable version output to PROVIDER_UNAVAILABLE", async () => {
    const root = await createTempRoot();
    const binaryPath = await writeFakeOpenCodeBinary(root, "not-a-version");

    expect(() =>
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      }),
    ).toThrow(AgentProxyError);

    try {
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(error.message).toContain("could not be parsed");
        expect(JSON.stringify(error.details)).not.toContain("not-a-version");
      }
    }
  });

  it("maps a lower than supported version to PROVIDER_UNAVAILABLE with an upgrade suggestion", async () => {
    const root = await createTempRoot();
    const binaryPath = await writeFakeOpenCodeBinary(root, "opencode v0.9.0");

    expect(() =>
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      }),
    ).toThrow(AgentProxyError);

    try {
      probeOpenCodeBinary({
        binary: binaryPath,
        env: { PATH: "" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(error.providerId).toBe("opencode");
        expect(error.operation).toBe("opencode.binary.probe");
        expect(error.message).toContain("OpenCode version 0.9.0 is below");
        expect(error.details).toMatchObject({
          version: "0.9.0",
          minimumSupportedVersion: OPENCODE_MINIMUM_SUPPORTED_VERSION,
        });
        expect(error.details?.suggestion).toContain("opencode upgrade");
      }
    }
  });
});
