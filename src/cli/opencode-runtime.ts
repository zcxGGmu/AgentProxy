import type { AgentProxyConfig } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import {
  normalizeRuntimeBaseUrl,
  OPENCODE_PROVIDER_ID,
  OpenCodeProvider,
} from "../providers/opencode/index.js";
import {
  OpenCodeManagedRuntimeManager,
  type RuntimeRegistry,
  selectOpenCodeRuntimeBaseUrl,
  type OpenCodeRuntimeBaseUrlSelection,
} from "../runtimes/index.js";
import type { AgentProxyStorage } from "../storage/index.js";

export interface AgentProxyOpenCodeCommandRuntimeSummary {
  source: OpenCodeRuntimeBaseUrlSelection["source"];
  mode: "managed" | "attached";
  startedByCommand: boolean;
  baseUrl: string;
  runtimeId?: string;
}

export interface EnsuredOpenCodeCommandRuntime {
  runtime: AgentProxyOpenCodeCommandRuntimeSummary;
  cleanup?: () => Promise<void>;
}

export async function ensureOpenCodeCommandRuntime(input: {
  config: AgentProxyConfig;
  storage: AgentProxyStorage;
  registry: RuntimeRegistry;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
  operation: string;
}): Promise<EnsuredOpenCodeCommandRuntime> {
  const selected = selectOpenCodeRuntimeBaseUrl(input.config, input.registry);
  if (selected.baseUrl !== undefined) {
    return {
      runtime: {
        source: selected.source,
        mode: selected.mode ?? input.config.providers.opencode.runtime.mode,
        startedByCommand: false,
        baseUrl: normalizeCommandRuntimeBaseUrl(selected.baseUrl, input.operation),
        ...(selected.runtimeId !== undefined ? { runtimeId: selected.runtimeId } : {}),
      },
    };
  }

  const opencode = input.config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: input.operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Enable providers.opencode.enabled before running OpenCode workflows.",
      },
    });
  }

  if (opencode.runtime.mode !== "managed") {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "No OpenCode runtime base URL is available for this AgentProxy command.",
      operation: input.operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        runtimeMode: opencode.runtime.mode,
        suggestion:
          "Set providers.opencode.runtime.baseUrl, register an attached runtime, or switch to managed runtime mode.",
      },
    });
  }

  const manager = new OpenCodeManagedRuntimeManager({
    storage: input.storage,
    binary: opencode.binary,
    inheritParentEnv: false,
    cwd: input.config.workspacePath,
    env: createManagedRuntimeEnv(input.config, input.env),
  });
  const runtime = await manager.startManagedRuntime({
    workspacePath: input.config.workspacePath,
    hostname: opencode.runtime.hostname,
    port: opencode.runtime.port,
  });
  if (runtime.baseUrl === undefined) {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "OpenCode managed runtime started without a base URL.",
      operation: input.operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        runtimeId: runtime.id,
      },
    });
  }

  return {
    runtime: {
      source: "registry",
      mode: "managed",
      startedByCommand: true,
      baseUrl: normalizeCommandRuntimeBaseUrl(runtime.baseUrl, input.operation),
      runtimeId: runtime.id,
    },
    cleanup: async () => {
      await manager.stopManagedRuntime(runtime.id);
    },
  };
}

export function createOpenCodeCommandProvider(input: {
  config: AgentProxyConfig;
  baseUrl: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
  operation: string;
}): OpenCodeProvider {
  const opencode = input.config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: input.operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Enable providers.opencode.enabled before running OpenCode workflows.",
      },
    });
  }

  return new OpenCodeProvider({
    binary: opencode.binary,
    baseUrl: input.baseUrl,
    cwd: input.config.workspacePath,
    passthroughEnv: opencode.passthroughEnv,
    ...(input.env !== undefined ? { env: input.env } : {}),
  });
}

function createManagedRuntimeEnv(
  config: AgentProxyConfig,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  return {
    PATH: env?.PATH ?? process.env.PATH,
    Path: env?.Path ?? process.env.Path,
    HOME: env?.HOME ?? process.env.HOME,
    USER: env?.USER ?? process.env.USER,
    TMPDIR: env?.TMPDIR ?? process.env.TMPDIR,
    ...config.providers.opencode.passthroughEnv,
  };
}

function normalizeCommandRuntimeBaseUrl(baseUrl: string, operation: string): string {
  const normalized = normalizeRuntimeBaseUrl(baseUrl);
  if (normalized.failureReason !== undefined || normalized.baseUrl === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL is invalid for this AgentProxy command.",
      operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        failureReason: normalized.failureReason ?? "invalid_url",
        suggestion: "Use an http(s) OpenCode runtime URL without credentials.",
      },
    });
  }

  return normalized.baseUrl;
}
