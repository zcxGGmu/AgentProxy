import { spawn } from "node:child_process";
import { OPENCODE_PASSTHROUGH_ENV_NAMES } from "../../config/types.js";
import { createAgentProxyError } from "../../core/errors.js";
import type { ProviderMetadata } from "../../core/metadata.js";
import { redactCommandArgs } from "../../logging/index.js";
import type { PassthroughRequest, PassthroughResult } from "../types.js";
import { resolveOpenCodeBinary, type OpenCodeBinaryResolution } from "./binary.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import { type OpenCodeProviderOptions, validateRequestTimeout } from "./probe.js";

const OPENCODE_PASSTHROUGH_OPERATION = "opencode.provider.passthrough";

const EXECUTION_ENV_NAMES = [
  "PATH",
  "Path",
  "path",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
] as const;

export async function passthroughOpenCodeCommand(
  options: OpenCodeProviderOptions,
  context: PassthroughRequest,
): Promise<PassthroughResult> {
  const cwd = context.workspacePath ?? options.cwd;
  const env = createOpenCodePassthroughEnv(options.env, options.passthroughEnv);
  const binary = resolveOpenCodePassthroughBinary(options, context, env);
  const requestTimeoutMs =
    options.requestTimeoutMs === undefined
      ? undefined
      : validateRequestTimeout(options.requestTimeoutMs);
  const startedAt = Date.now();
  const result = await runOpenCodePassthroughProcess({
    binary,
    args: context.args,
    cwd,
    env,
    requestTimeoutMs,
    signal: context.signal,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    metadata: createPassthroughMetadata({
      binary,
      args: context.args,
      cwd,
      env,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: Date.now() - startedAt,
    }),
  };
}

function resolveOpenCodePassthroughBinary(
  options: OpenCodeProviderOptions,
  context: PassthroughRequest,
  env: NodeJS.ProcessEnv,
): OpenCodeBinaryResolution {
  try {
    return resolveOpenCodeBinary({
      ...(options.binary !== undefined ? { binary: options.binary } : {}),
      env,
      inheritProcessEnv: false,
      ...(context.workspacePath !== undefined
        ? { cwd: context.workspacePath }
        : options.cwd !== undefined
          ? { cwd: options.cwd }
          : {}),
    });
  } catch {
    throw createPassthroughError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode binary is required for provider passthrough.",
      args: context.args,
      failureReason: "binary_unavailable",
      suggestion: "Install OpenCode or configure providers.opencode.binary before retrying.",
    });
  }
}

function createOpenCodePassthroughEnv(
  sourceEnv: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
  passthroughEnv: Record<string, string | undefined> | undefined,
): NodeJS.ProcessEnv {
  const source = sourceEnv ?? process.env;
  const output: NodeJS.ProcessEnv = {};

  for (const name of EXECUTION_ENV_NAMES) {
    const value = source[name];
    if (value !== undefined) {
      output[name] = value;
    }
  }

  for (const name of OPENCODE_PASSTHROUGH_ENV_NAMES) {
    const value = passthroughEnv?.[name];
    if (value !== undefined) {
      output[name] = value;
    }
  }

  return output;
}

async function runOpenCodePassthroughProcess(input: {
  binary: OpenCodeBinaryResolution;
  args: readonly string[];
  cwd: string | undefined;
  env: NodeJS.ProcessEnv;
  requestTimeoutMs: number | undefined;
  signal: AbortSignal | undefined;
}): Promise<{ exitCode: number; stdout: string; stderr: string; signal?: NodeJS.Signals }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(input.binary.resolvedPath, [...input.args], {
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout =
      input.requestTimeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, input.requestTimeoutMs);
    timeout?.unref();

    const abort = (): void => {
      child.kill("SIGTERM");
    };
    input.signal?.addEventListener("abort", abort, { once: true });

    const cleanup = (): void => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      input.signal?.removeEventListener("abort", abort);
    };

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const appendOutput = (stream: "stdout" | "stderr", chunk: unknown): void => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (stream === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };

    child.stdout?.on("data", (chunk: unknown) => appendOutput("stdout", chunk));
    child.stderr?.on("data", (chunk: unknown) => appendOutput("stderr", chunk));
    child.once("error", () => {
      fail(
        createPassthroughError({
          code: "PASSTHROUGH_FAILED",
          message: "OpenCode provider passthrough process could not be started.",
          args: input.args,
          failureReason: "spawn_failed",
          suggestion: "Verify the OpenCode binary can be executed from the selected workspace.",
        }),
      );
    });
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      if (input.signal?.aborted === true) {
        reject(
          createPassthroughError({
            code: "PASSTHROUGH_FAILED",
            message: "OpenCode provider passthrough was aborted.",
            args: input.args,
            failureReason: "aborted",
            suggestion: "Retry the command if the abort was unintentional.",
          }),
        );
        return;
      }

      if (timedOut) {
        reject(
          createPassthroughError({
            code: "PASSTHROUGH_FAILED",
            message: "OpenCode provider passthrough timed out.",
            args: input.args,
            failureReason: "timeout",
            suggestion: "Retry with a shorter provider command or increase the request timeout.",
          }),
        );
        return;
      }

      resolve({
        exitCode: typeof code === "number" ? code : mapSignalExitCode(signal),
        stdout,
        stderr,
        ...(signal !== null ? { signal } : {}),
      });
    });
  });
}

function mapSignalExitCode(signal: NodeJS.Signals | null): number {
  if (signal === "SIGINT") {
    return 130;
  }
  if (signal === "SIGTERM") {
    return 143;
  }

  return 1;
}

function createPassthroughMetadata(input: {
  binary: OpenCodeBinaryResolution;
  args: readonly string[];
  cwd: string | undefined;
  env: NodeJS.ProcessEnv;
  exitCode: number;
  signal: NodeJS.Signals | undefined;
  durationMs: number;
}): ProviderMetadata {
  return {
    opencode: {
      passthrough: {
        source: "cli",
        binary: input.binary.binary,
        resolvedPath: input.binary.resolvedPath,
        binarySource: input.binary.source,
        args: redactCommandArgs(input.args),
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        injectedEnvKeys: OPENCODE_PASSTHROUGH_ENV_NAMES.filter(
          (name) => input.env[name] !== undefined,
        ),
        exitCode: input.exitCode,
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
        durationMs: input.durationMs,
      },
    },
  };
}

function createPassthroughError(input: {
  code: "PROVIDER_UNAVAILABLE" | "PASSTHROUGH_FAILED";
  message: string;
  args: readonly string[];
  failureReason: string;
  suggestion: string;
}): Error {
  return createAgentProxyError({
    code: input.code,
    message: input.message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: OPENCODE_PASSTHROUGH_OPERATION,
    details: {
      failureReason: input.failureReason,
      args: redactCommandArgs(input.args),
      suggestion: input.suggestion,
    },
  });
}
