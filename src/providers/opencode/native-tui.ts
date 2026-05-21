import { spawn } from "node:child_process";
import { OPENCODE_PASSTHROUGH_ENV_NAMES } from "../../config/types.js";
import { createAgentProxyError } from "../../core/errors.js";
import type { ProviderMetadata } from "../../core/metadata.js";
import type { NativeTuiRequest, NativeTuiResult } from "../types.js";
import { resolveOpenCodeBinary, type OpenCodeBinaryResolution } from "./binary.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import type { OpenCodeProviderOptions } from "./probe.js";

const OPENCODE_NATIVE_TUI_OPERATION = "opencode.provider.openNativeTui";

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
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "FORCE_COLOR",
] as const;

export async function openOpenCodeNativeTui(
  options: OpenCodeProviderOptions,
  context: NativeTuiRequest,
): Promise<NativeTuiResult> {
  if (context.providerSessionId !== undefined || context.prompt !== undefined) {
    throw createNativeTuiError({
      code: "CAPABILITY_UNSUPPORTED",
      message: "OpenCode native TUI launcher does not support session-specific prompt prefill yet.",
      cwd: context.workspacePath,
      failureReason: "session_native_tui_unavailable",
      suggestion:
        "Use agentproxy run for headless prompts or resume a session with later native TUI support.",
    });
  }

  const cwd = context.workspacePath;
  const env = createOpenCodeNativeTuiEnv(options.env, options.passthroughEnv);
  const binary = resolveOpenCodeBinary({
    ...(options.binary !== undefined ? { binary: options.binary } : {}),
    env,
    inheritProcessEnv: false,
    cwd,
  });
  const startedAt = Date.now();
  const result = await runOpenCodeNativeTuiProcess({
    binary,
    cwd,
    env,
    signal: context.signal,
  });

  return {
    launched: true,
    exitCode: result.exitCode,
    metadata: createNativeTuiMetadata({
      binary,
      cwd,
      env,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: Date.now() - startedAt,
    }),
  };
}

function createOpenCodeNativeTuiEnv(
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

async function runOpenCodeNativeTuiProcess(input: {
  binary: OpenCodeBinaryResolution;
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal | undefined;
}): Promise<{ exitCode: number; signal?: NodeJS.Signals }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const child = spawn(input.binary.resolvedPath, [input.cwd], {
      cwd: input.cwd,
      env: input.env,
      stdio: "inherit",
    });

    const abort = (): void => {
      child.kill("SIGTERM");
    };
    input.signal?.addEventListener("abort", abort, { once: true });

    const cleanup = (): void => {
      input.signal?.removeEventListener("abort", abort);
    };

    child.once("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(
        createNativeTuiError({
          code: "RUNTIME_HEALTH_FAILED",
          message: "OpenCode native TUI could not be launched.",
          cwd: input.cwd,
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
          createNativeTuiError({
            code: "EVENT_STREAM_INTERRUPTED",
            message: "OpenCode native TUI launch was aborted.",
            cwd: input.cwd,
            failureReason: "aborted",
            suggestion: "Retry the native TUI launch if the abort was unintentional.",
          }),
        );
        return;
      }

      resolve({
        exitCode: typeof code === "number" ? code : mapSignalExitCode(signal),
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

function createNativeTuiMetadata(input: {
  binary: OpenCodeBinaryResolution;
  cwd: string;
  env: NodeJS.ProcessEnv;
  exitCode: number;
  signal: NodeJS.Signals | undefined;
  durationMs: number;
}): ProviderMetadata {
  return {
    opencode: {
      nativeTui: {
        source: "cli",
        binary: input.binary.binary,
        resolvedPath: input.binary.resolvedPath,
        binarySource: input.binary.source,
        cwd: input.cwd,
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

function createNativeTuiError(input: {
  code: "CAPABILITY_UNSUPPORTED" | "RUNTIME_HEALTH_FAILED" | "EVENT_STREAM_INTERRUPTED";
  message: string;
  cwd: string;
  failureReason: string;
  suggestion: string;
}): Error {
  return createAgentProxyError({
    code: input.code,
    message: input.message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: OPENCODE_NATIVE_TUI_OPERATION,
    details: {
      failureReason: input.failureReason,
      cwd: input.cwd,
      suggestion: input.suggestion,
    },
  });
}
