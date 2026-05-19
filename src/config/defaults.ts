import { AGENTPROXY_DEFAULT_DATABASE_NAME } from "../storage/index.js";
import type { AgentProxyConfig } from "./types.js";

export const AGENTPROXY_CONFIG_SCHEMA_URL = "https://agentproxy.local/config.schema.json";

export const DEFAULT_AGENTPROXY_CONFIG: AgentProxyConfig = {
  defaultProvider: "opencode",
  workspacePath: ".",
  storage: {
    path: `~/.local/share/agentproxy/${AGENTPROXY_DEFAULT_DATABASE_NAME}`,
  },
  providers: {
    opencode: {
      enabled: true,
      binary: "opencode",
      runtime: {
        mode: "managed",
        hostname: "127.0.0.1",
        port: 4096,
      },
      passthroughEnv: {},
    },
  },
  logging: {
    level: "info",
    redact: true,
  },
};

export function createDefaultAgentProxyConfig(): AgentProxyConfig {
  return {
    defaultProvider: DEFAULT_AGENTPROXY_CONFIG.defaultProvider,
    workspacePath: DEFAULT_AGENTPROXY_CONFIG.workspacePath,
    storage: {
      path: DEFAULT_AGENTPROXY_CONFIG.storage.path,
    },
    providers: {
      opencode: {
        enabled: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.enabled,
        binary: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.binary,
        runtime: {
          mode: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.runtime.mode,
          hostname: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.runtime.hostname,
          port: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.runtime.port,
          ...(DEFAULT_AGENTPROXY_CONFIG.providers.opencode.runtime.baseUrl !== undefined
            ? { baseUrl: DEFAULT_AGENTPROXY_CONFIG.providers.opencode.runtime.baseUrl }
            : {}),
        },
        passthroughEnv: {
          ...DEFAULT_AGENTPROXY_CONFIG.providers.opencode.passthroughEnv,
        },
      },
    },
    logging: {
      level: DEFAULT_AGENTPROXY_CONFIG.logging.level,
      redact: DEFAULT_AGENTPROXY_CONFIG.logging.redact,
    },
  };
}
