import { accessSync, constants as fsConstants } from "node:fs";
import { delimiter, dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createAgentProxyError } from "../../core/index.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";

export const OPENCODE_MINIMUM_SUPPORTED_VERSION = "1.0.0";

export type OpenCodeBinarySource = "config" | "path";

export interface ProbeOpenCodeBinaryOptions {
  binary?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd?: string;
  inheritProcessEnv?: boolean;
}

export interface OpenCodeBinaryProbe {
  binary: string;
  resolvedPath: string;
  source: OpenCodeBinarySource;
  version: string;
  rawVersionOutput: string;
  minimumSupportedVersion: string;
}

export interface OpenCodeBinaryResolution {
  binary: string;
  resolvedPath: string;
  source: OpenCodeBinarySource;
}

export function probeOpenCodeBinary(options: ProbeOpenCodeBinaryOptions = {}): OpenCodeBinaryProbe {
  const resolvedBinary = resolveOpenCodeBinary(options);
  const env = createEffectiveEnvironment(options.env, options.inheritProcessEnv);
  const rawVersionOutput = readOpenCodeVersion(resolvedBinary.resolvedPath, env, options.cwd);
  const version = normalizeOpenCodeVersion(rawVersionOutput);

  if (version === undefined) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode version output could not be parsed.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.binary.probe",
      details: {
        binary: resolvedBinary.binary,
        resolvedPath: resolvedBinary.resolvedPath,
        suggestion: "Run `opencode --version` and upgrade OpenCode if the output is unexpected.",
      },
    });
  }

  if (compareSemver(version, OPENCODE_MINIMUM_SUPPORTED_VERSION) < 0) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: `OpenCode version ${version} is below the minimum supported version ${OPENCODE_MINIMUM_SUPPORTED_VERSION}.`,
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.binary.probe",
      details: {
        binary: resolvedBinary.binary,
        resolvedPath: resolvedBinary.resolvedPath,
        version,
        minimumSupportedVersion: OPENCODE_MINIMUM_SUPPORTED_VERSION,
        suggestion: "Upgrade OpenCode with `opencode upgrade` or `npm install -g opencode-ai`.",
      },
    });
  }

  return {
    binary: resolvedBinary.binary,
    resolvedPath: resolvedBinary.resolvedPath,
    source: resolvedBinary.source,
    version,
    rawVersionOutput,
    minimumSupportedVersion: OPENCODE_MINIMUM_SUPPORTED_VERSION,
  };
}

export function resolveOpenCodeBinary(
  options: ProbeOpenCodeBinaryOptions = {},
): OpenCodeBinaryResolution {
  const configuredBinary = options.binary?.trim();
  const binary = configuredBinary || OPENCODE_PROVIDER_ID;
  const env = createEffectiveEnvironment(options.env, options.inheritProcessEnv);
  const source: OpenCodeBinarySource = configuredBinary === undefined ? "path" : "config";
  return resolveOpenCodeBinaryFromEnv(binary, env, source, options.cwd);
}

export function normalizeOpenCodeVersion(output: string): string | undefined {
  const match = output
    .trim()
    .match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/);
  return match?.[1];
}

function resolveOpenCodeBinaryFromEnv(
  binary: string,
  env: Record<string, string | undefined>,
  source: OpenCodeBinarySource,
  cwd?: string,
): OpenCodeBinaryResolution {
  if (isPathLikeBinary(binary)) {
    const resolvedPath = isAbsolute(binary)
      ? normalize(binary)
      : resolve(cwd ?? process.cwd(), binary);
    ensureExecutableBinary(binary, resolvedPath);
    return {
      binary,
      resolvedPath,
      source,
    };
  }

  const pathMatch = findCommandOnPath(binary, getPathValue(env));
  if (pathMatch !== undefined) {
    return {
      binary,
      resolvedPath: pathMatch,
      source,
    };
  }

  throw missingBinaryError(binary);
}

function readOpenCodeVersion(
  resolvedPath: string,
  env: Record<string, string | undefined>,
  cwd?: string,
): string {
  try {
    return execFileSync(resolvedPath, ["--version"], {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode binary could not execute `--version`.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.binary.probe",
      cause: error,
      details: {
        resolvedPath,
        suggestion: "Check that OpenCode is installed and runnable with `opencode --version`.",
      },
    });
  }
}

function ensureExecutableBinary(binary: string, resolvedPath: string): void {
  try {
    accessSync(resolvedPath, fsConstants.X_OK);
  } catch (error) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode binary was not found or is not executable.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.binary.probe",
      cause: error,
      details: {
        binary,
        resolvedPath,
        suggestion:
          "Install OpenCode with `npm install -g opencode-ai` or configure providers.opencode.binary.",
      },
    });
  }
}

function findCommandOnPath(command: string, pathValue: string): string | undefined {
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];

  for (const pathEntry of pathValue.split(delimiter)) {
    if (pathEntry.trim() === "") {
      continue;
    }

    for (const extension of extensions) {
      const candidate = join(pathEntry, `${command}${extension}`);
      try {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Keep searching the rest of PATH.
      }
    }
  }

  return undefined;
}

function createEffectiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
  inheritProcessEnv = true,
): Record<string, string | undefined> {
  if (!inheritProcessEnv) {
    return { ...(env ?? {}) };
  }

  return {
    ...process.env,
    ...(env ?? {}),
  };
}

function getPathValue(env: Record<string, string | undefined>): string {
  return env.PATH ?? env.Path ?? env.path ?? "";
}

function missingBinaryError(binary: string): Error {
  return createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenCode binary was not found.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.binary.probe",
    details: {
      binary,
      suggestion:
        "Install OpenCode with `npm install -g opencode-ai` or configure providers.opencode.binary.",
    },
  });
}

function isPathLikeBinary(binary: string): boolean {
  return (
    isAbsolute(binary) || binary.startsWith(".") || binary.includes(sep) || dirname(binary) !== "."
  );
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseCoreSemver(left);
  const rightParts = parseCoreSemver(right);

  for (const index of [0, 1, 2] as const) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }

  return comparePrerelease(left, right);
}

function parseCoreSemver(version: string): [number, number, number] {
  const core = version.split(/[+-]/)[0] ?? "0.0.0";
  const [major = "0", minor = "0", patch = "0"] = core.split(".");
  return [Number(major), Number(minor), Number(patch)];
}

function comparePrerelease(left: string, right: string): number {
  const leftPrerelease = extractPrerelease(left);
  const rightPrerelease = extractPrerelease(right);

  if (leftPrerelease === rightPrerelease) {
    return 0;
  }
  if (leftPrerelease === undefined) {
    return 1;
  }
  if (rightPrerelease === undefined) {
    return -1;
  }

  return leftPrerelease.localeCompare(rightPrerelease, "en", { numeric: true });
}

function extractPrerelease(version: string): string | undefined {
  return version.match(/^\d+\.\d+\.\d+-([^+]+)/)?.[1];
}
