export type AgentProxyLogLevel = "debug" | "info" | "warn" | "error";

export type AgentProxyRuntimeMode = "managed" | "attached";

export interface AgentProxyStorageConfig {
  path: string;
}

export interface AgentProxyLoggingConfig {
  level: AgentProxyLogLevel;
  redact: boolean;
}

export interface AgentProxyProviderRuntimeConfig {
  mode: AgentProxyRuntimeMode;
  hostname: string;
  port: number;
  baseUrl?: string;
}

export const OPENCODE_PASSTHROUGH_ENV_NAMES = [
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_TUI_CONFIG",
  "OPENCODE_SERVER_PASSWORD",
  "OPENCODE_SERVER_USERNAME",
] as const;

export type OpenCodePassthroughEnvName = (typeof OPENCODE_PASSTHROUGH_ENV_NAMES)[number];

export type OpenCodePassthroughEnv = Partial<Record<OpenCodePassthroughEnvName, string>>;

export interface OpenCodeProviderConfig {
  enabled: boolean;
  binary: string;
  runtime: AgentProxyProviderRuntimeConfig;
  passthroughEnv: OpenCodePassthroughEnv;
}

export interface AgentProxyProvidersConfig {
  opencode: OpenCodeProviderConfig;
}

export interface AgentProxyConfig {
  $schema?: string;
  defaultProvider: string;
  workspacePath: string;
  storage: AgentProxyStorageConfig;
  providers: AgentProxyProvidersConfig;
  logging: AgentProxyLoggingConfig;
}

export interface AgentProxyProviderRuntimeConfigInput {
  mode?: AgentProxyRuntimeMode;
  hostname?: string;
  port?: number;
  baseUrl?: string;
}

export interface OpenCodeProviderConfigInput {
  enabled?: boolean;
  binary?: string;
  runtime?: AgentProxyProviderRuntimeConfigInput;
  passthroughEnv?: OpenCodePassthroughEnv;
}

export interface AgentProxyConfigInput {
  $schema?: string;
  defaultProvider?: string;
  workspacePath?: string;
  storage?: Partial<AgentProxyStorageConfig>;
  providers?: {
    opencode?: OpenCodeProviderConfigInput;
  };
  logging?: Partial<AgentProxyLoggingConfig>;
}

export interface AgentProxyCliConfigOverrides {
  defaultProvider?: string;
  workspacePath?: string;
  configPath?: string;
  storagePath?: string;
  logLevel?: AgentProxyLogLevel;
  logRedact?: boolean;
  opencodeEnabled?: boolean;
  opencodeBinary?: string;
  opencodeRuntimeMode?: AgentProxyRuntimeMode;
  opencodeRuntimeHostname?: string;
  opencodeRuntimePort?: number;
  opencodeRuntimeBaseUrl?: string;
}

export type AgentProxyConfigSourceKind =
  | "builtin"
  | "global"
  | "project"
  | "explicit"
  | "env"
  | "cli";

export interface AgentProxyConfigSource {
  kind: AgentProxyConfigSourceKind;
  path?: string;
}

export interface ResolvedAgentProxyConfig {
  config: AgentProxyConfig;
  sources: AgentProxyConfigSource[];
  paths: {
    globalConfigPath: string;
    projectConfigPath: string;
    explicitConfigPath?: string;
  };
}
