import {
  type AgentProxyCliConfigOverrides,
  type AgentProxyConfig,
  resolveAgentProxyConfig,
} from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../providers/opencode/index.js";
import type { AgentProvider } from "../providers/types.js";

export interface ChatLaunchInput {
  providerId: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  sessionId?: string;
}

export interface ChatLaunchResult {
  providerId: string;
  exitCode: number;
}

export async function launchAgentProxyChat(input: ChatLaunchInput): Promise<ChatLaunchResult> {
  assertChatProviderSupported(input.providerId);
  if (input.sessionId !== undefined) {
    throw createAgentProxyError({
      code: "CAPABILITY_UNSUPPORTED",
      message: "agentproxy chat --session is not implemented yet.",
      operation: "chat",
      providerId: input.providerId,
      details: {
        suggestion:
          "Use agentproxy run for headless prompts and await later session-aware chat support.",
      },
    });
  }

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.homeDir !== undefined ? { homeDir: input.homeDir } : {}),
    ...(input.env !== undefined ? { env: input.env } : {}),
    ...(input.cli !== undefined ? { cli: input.cli } : {}),
  });
  const provider = createChatProvider(input.providerId, resolvedConfig.config, input.env);
  const result = await provider.openNativeTui({
    providerId: input.providerId,
    workspacePath: resolvedConfig.config.workspacePath,
    metadata: {},
  });

  return {
    providerId: input.providerId,
    exitCode: result.exitCode,
  };
}

function createChatProvider(
  providerId: string,
  config: AgentProxyConfig,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): AgentProvider {
  if (providerId !== OPENCODE_PROVIDER_ID) {
    throw createProviderNotFound(providerId);
  }

  const opencode = config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: "chat",
      providerId,
      details: {
        suggestion: "Enable providers.opencode.enabled before launching the native TUI.",
      },
    });
  }

  return new OpenCodeProvider({
    binary: opencode.binary,
    cwd: config.workspacePath,
    passthroughEnv: opencode.passthroughEnv,
    ...(env !== undefined ? { env } : {}),
  });
}

function assertChatProviderSupported(providerId: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  throw createProviderNotFound(providerId);
}

function createProviderNotFound(providerId: string): Error {
  return createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${providerId}`,
    operation: "chat",
    providerId,
    details: {
      suggestion: "AgentProxy v1 chat currently supports the opencode provider only.",
    },
  });
}
