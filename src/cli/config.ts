import type { AgentProxyCliConfigOverrides, AgentProxyConfigSource } from "../config/index.js";
import { resolveAgentProxyConfig } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { AGENTPROXY_REDACTED_VALUE } from "../logging/index.js";
import { normalizeRuntimeBaseUrl } from "../providers/opencode/index.js";
import { sanitizeHumanInline, sanitizeStructuredOutput } from "./run.js";

export interface RunAgentProxyConfigGetOptions {
  key?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
}

export interface AgentProxyConfigGetRuntimeSummary {
  mode: string;
  hostname: string;
  port: number;
  baseUrl?: string;
}

export interface AgentProxyConfigGetReportConfig {
  defaultProvider: string;
  workspacePath: string;
  storage: {
    path: string;
  };
  providers: {
    opencode: {
      enabled: boolean;
      binary: string;
      runtime: AgentProxyConfigGetRuntimeSummary;
      passthroughEnv: Record<string, string>;
    };
  };
  logging: {
    level: string;
    redact: boolean;
  };
}

export interface AgentProxyConfigGetPaths {
  globalConfigPath: string;
  projectConfigPath: string;
  explicitConfigPath?: string;
}

export interface AgentProxyConfigGetFullReport {
  ok: true;
  config: AgentProxyConfigGetReportConfig;
  sources: AgentProxyConfigGetSource[];
  paths: AgentProxyConfigGetPaths;
}

export interface AgentProxyConfigGetKeyReport {
  ok: true;
  key: string;
  value: unknown;
  sources: AgentProxyConfigGetSource[];
  paths: AgentProxyConfigGetPaths;
}

export interface AgentProxyConfigGetSource {
  kind: AgentProxyConfigSource["kind"];
  path?: string;
}

export type AgentProxyConfigGetReport =
  | AgentProxyConfigGetFullReport
  | AgentProxyConfigGetKeyReport;

const CONFIG_GET_OPERATION = "config.get";
const CONFIG_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_]+$/u;

export async function getAgentProxyConfig(
  options: RunAgentProxyConfigGetOptions = {},
): Promise<AgentProxyConfigGetReport> {
  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = summarizeConfig(resolvedConfig.config);
  const common = {
    sources: resolvedConfig.sources.map(summarizeSource),
    paths: sanitizeStructuredOutput(resolvedConfig.paths) as AgentProxyConfigGetPaths,
  };

  if (options.key === undefined) {
    return sanitizeStructuredOutput({
      ok: true,
      config,
      ...common,
    }) as AgentProxyConfigGetFullReport;
  }

  const key = validateConfigKey(options.key);
  const value = readConfigKey(config, key);
  if (value === undefined) {
    throw createUnsupportedConfigKeyError(key);
  }

  return sanitizeStructuredOutput({
    ok: true,
    key,
    value,
    ...common,
  }) as AgentProxyConfigGetKeyReport;
}

export function formatConfigGetHumanReport(report: AgentProxyConfigGetReport): string {
  if ("key" in report) {
    return `${sanitizeHumanInline(report.key)}: ${formatHumanValue(report.value)}`;
  }

  const config = report.config;
  const opencode = config.providers.opencode;
  const passthroughEnvCount = Object.keys(opencode.passthroughEnv).length;
  const lines = [
    "AgentProxy config:",
    `Default provider: ${sanitizeHumanInline(config.defaultProvider)}`,
    `Workspace: ${sanitizeHumanInline(config.workspacePath)}`,
    `Storage: ${sanitizeHumanInline(config.storage.path)}`,
    `OpenCode: ${opencode.enabled ? "enabled" : "disabled"}`,
    `OpenCode binary: ${sanitizeHumanInline(opencode.binary)}`,
    `OpenCode runtime: ${sanitizeHumanInline(formatRuntime(opencode.runtime))}`,
    `OpenCode passthrough env: ${passthroughEnvCount.toString()} value(s) redacted`,
    `Logging: ${sanitizeHumanInline(config.logging.level)}, redact=${String(config.logging.redact)}`,
    "Sources:",
    ...report.sources.map((source) =>
      source.path === undefined
        ? `- ${sanitizeHumanInline(source.kind)}`
        : `- ${sanitizeHumanInline(source.kind)}: ${sanitizeHumanInline(source.path)}`,
    ),
  ];

  return lines.join("\n");
}

function summarizeConfig(
  config: Awaited<ReturnType<typeof resolveAgentProxyConfig>>["config"],
): AgentProxyConfigGetReportConfig {
  return {
    defaultProvider: sanitizeMachineString(config.defaultProvider),
    workspacePath: sanitizeMachineString(config.workspacePath),
    storage: {
      path: sanitizeMachineString(config.storage.path),
    },
    providers: {
      opencode: {
        enabled: config.providers.opencode.enabled,
        binary: sanitizeMachineString(config.providers.opencode.binary),
        runtime: summarizeRuntime(config.providers.opencode.runtime),
        passthroughEnv: Object.fromEntries(
          Object.keys(config.providers.opencode.passthroughEnv).map((key) => [
            sanitizeMachineString(key),
            AGENTPROXY_REDACTED_VALUE,
          ]),
        ),
      },
    },
    logging: {
      level: sanitizeMachineString(config.logging.level),
      redact: config.logging.redact,
    },
  };
}

function summarizeRuntime(
  runtime: Awaited<
    ReturnType<typeof resolveAgentProxyConfig>
  >["config"]["providers"]["opencode"]["runtime"],
): AgentProxyConfigGetRuntimeSummary {
  return {
    mode: sanitizeMachineString(runtime.mode),
    hostname: sanitizeMachineString(runtime.hostname),
    port: runtime.port,
    ...(runtime.baseUrl !== undefined
      ? optionalField("baseUrl", sanitizeBaseUrl(runtime.baseUrl))
      : {}),
  };
}

function summarizeSource(source: AgentProxyConfigSource): AgentProxyConfigGetSource {
  return {
    kind: source.kind,
    ...(source.path !== undefined ? { path: sanitizeMachineString(source.path) } : {}),
  };
}

function optionalField<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Record<TKey, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<TKey, string>);
}

function sanitizeBaseUrl(value: string): string | undefined {
  const normalized = normalizeRuntimeBaseUrl(value);
  if (normalized.baseUrl !== "") {
    return sanitizeMachineString(normalized.baseUrl);
  }

  return undefined;
}

function validateConfigKey(rawKey: string): string {
  const key = rawKey.trim();
  const parts = key.split(".");
  if (key === "" || parts.some((part) => part === "" || !CONFIG_KEY_SEGMENT_PATTERN.test(part))) {
    throw createUnsupportedConfigKeyError(sanitizeMachineString(key));
  }

  return key;
}

function readConfigKey(config: AgentProxyConfigGetReportConfig, key: string): unknown {
  let current: unknown = config;
  for (const part of key.split(".")) {
    if (!isPlainObject(current) || !Object.hasOwn(current, part)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function createUnsupportedConfigKeyError(key: string): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Unsupported AgentProxy config key.",
    operation: CONFIG_GET_OPERATION,
    details: {
      key,
      suggestion:
        "Use agentproxy config get without a key to inspect supported AgentProxy config paths.",
    },
  });
}

function formatRuntime(runtime: AgentProxyConfigGetRuntimeSummary): string {
  const endpoint = runtime.baseUrl ?? `${runtime.hostname}:${runtime.port.toString()}`;
  return `${runtime.mode} (${endpoint})`;
}

function formatHumanValue(value: unknown): string {
  if (typeof value === "string") {
    return sanitizeHumanInline(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return sanitizeHumanInline(JSON.stringify(value));
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanInline(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
