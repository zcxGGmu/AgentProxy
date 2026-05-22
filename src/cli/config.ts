import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENTPROXY_CONFIG_SCHEMA_URL,
  AGENTPROXY_PROJECT_CONFIG_PATH,
  type AgentProxyCliConfigOverrides,
  type AgentProxyConfigSource,
  type AgentProxyConfigSourceKind,
  type AgentProxyLogLevel,
  type AgentProxyRuntimeMode,
} from "../config/index.js";
import { resolveAgentProxyConfig, validateAgentProxyConfigInput } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { AGENTPROXY_REDACTED_VALUE, redactString } from "../logging/index.js";
import { normalizeRuntimeBaseUrl } from "../providers/opencode/index.js";
import { sanitizeHumanInline, sanitizeStructuredOutput } from "./run.js";

export interface RunAgentProxyConfigGetOptions {
  key?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
}

export interface RunAgentProxyConfigSetOptions {
  key: string;
  value: string;
  cwd?: string;
  homeDir?: string;
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

export interface AgentProxyConfigSetReport {
  ok: true;
  key: string;
  value: unknown;
  target: {
    kind: "project" | "explicit";
    path: string;
    created: boolean;
  };
}

type ConfigSetValue = string | number | boolean;

interface ConfigSetTarget {
  kind: "project" | "explicit";
  path: string;
}

interface ConfigSetTargetReadResult {
  config: Record<string, unknown>;
  created: boolean;
}

interface ConfigSetDefinition {
  parse(rawValue: string, key: string): ConfigSetValue;
}

const CONFIG_GET_OPERATION = "config.get";
const CONFIG_SET_OPERATION = "config.set";
const CONFIG_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_]+$/u;
const CONFIG_SET_DEFINITIONS = new Map<string, ConfigSetDefinition>([
  ["defaultProvider", { parse: parseDefaultProvider }],
  ["workspacePath", { parse: parseStringConfigValue }],
  ["storage.path", { parse: parseStringConfigValue }],
  ["logging.level", { parse: parseLogLevelConfigValue }],
  ["logging.redact", { parse: parseBooleanConfigValue }],
  ["providers.opencode.enabled", { parse: parseBooleanConfigValue }],
  ["providers.opencode.binary", { parse: parseStringConfigValue }],
  ["providers.opencode.runtime.mode", { parse: parseRuntimeModeConfigValue }],
  ["providers.opencode.runtime.hostname", { parse: parseStringConfigValue }],
  ["providers.opencode.runtime.port", { parse: parseRuntimePortConfigValue }],
  ["providers.opencode.runtime.baseUrl", { parse: parseRuntimeBaseUrlConfigValue }],
]);
const SAFE_STRING_OUTPUT_KEYS = new Set([
  "defaultProvider",
  "logging.level",
  "providers.opencode.runtime.mode",
  "providers.opencode.runtime.baseUrl",
]);
// biome-ignore lint/complexity/useRegexLiterals: String.raw keeps control escapes out of the source.
const CONFIG_SET_ANSI_ESCAPE_PATTERN = new RegExp(
  String.raw`\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|[\[\]()#;?]*(?:[0-?]*[ -/]*[@-~]))|\u009B[0-?]*[ -/]*[@-~]`,
  "u",
);
// biome-ignore lint/complexity/useRegexLiterals: String.raw keeps control escapes out of the source.
const CONFIG_SET_UNSAFE_CONTROL_PATTERN = new RegExp(
  String.raw`[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F-\u009F]`,
  "u",
);
const CONFIG_SET_SECRET_VALUE_PATTERN =
  /\b(?:authorization|credentials?|passwd|password|pwd|secret|token|api[-_\s]?key|apikey|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/iu;

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

export async function setAgentProxyConfig(
  options: RunAgentProxyConfigSetOptions,
): Promise<AgentProxyConfigSetReport> {
  const key = validateConfigKey(options.key, CONFIG_SET_OPERATION);
  const definition = CONFIG_SET_DEFINITIONS.get(key);
  if (definition === undefined) {
    throw createUnsupportedConfigKeyError(key, CONFIG_SET_OPERATION);
  }

  const parsedValue = definition.parse(options.value, key);
  const target = resolveConfigSetTarget(options);
  const existing = await readConfigSetTarget(target);
  const nextConfig = setConfigValue(existing.config, key, parsedValue);
  validateAgentProxyConfigInput(nextConfig, {
    path: target.path,
    source: target.kind,
  });
  validateConfigSetSafety(nextConfig, key);
  await writeConfigFileAtomically(target.path, nextConfig);

  return sanitizeStructuredOutput({
    ok: true,
    key,
    value: summarizeConfigSetValue(key, parsedValue),
    target: {
      kind: target.kind,
      path: sanitizeMachineString(target.path),
      created: existing.created,
    },
  }) as AgentProxyConfigSetReport;
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

export function formatConfigSetHumanReport(report: AgentProxyConfigSetReport): string {
  return [
    `Set ${sanitizeHumanInline(report.key)}`,
    `Target: ${sanitizeHumanInline(report.target.path)} (${report.target.kind}${
      report.target.created ? ", created" : ""
    })`,
    `Value: ${formatHumanValue(report.value)}`,
  ].join("\n");
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

function validateConfigKey(rawKey: string, operation = CONFIG_GET_OPERATION): string {
  const key = rawKey.trim();
  const parts = key.split(".");
  if (key === "" || parts.some((part) => part === "" || !CONFIG_KEY_SEGMENT_PATTERN.test(part))) {
    throw createUnsupportedConfigKeyError(sanitizeMachineString(key), operation);
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

function createUnsupportedConfigKeyError(key: string, operation = CONFIG_GET_OPERATION): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Unsupported AgentProxy config key.",
    operation,
    details: {
      key,
      suggestion:
        operation === CONFIG_SET_OPERATION
          ? "Use agentproxy config get without a key to inspect supported AgentProxy config paths before writing."
          : "Use agentproxy config get without a key to inspect supported AgentProxy config paths.",
    },
  });
}

function resolveConfigSetTarget(options: RunAgentProxyConfigSetOptions): ConfigSetTarget {
  const cwd = normalizeBasePath(options.cwd ?? process.cwd());
  const homeDir = normalizeBasePath(options.homeDir ?? path.resolve(process.env.HOME ?? path.sep));
  if (options.cli?.configPath !== undefined) {
    return {
      kind: "explicit",
      path: normalizePathValue(options.cli.configPath, cwd, homeDir),
    };
  }

  return {
    kind: "project",
    path: path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH),
  };
}

async function readConfigSetTarget(target: ConfigSetTarget): Promise<ConfigSetTargetReadResult> {
  let raw: string;
  try {
    raw = await readFile(target.path, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {
        config: {
          $schema: AGENTPROXY_CONFIG_SCHEMA_URL,
        },
        created: true,
      };
    }

    throw createConfigSetWriteError(target.path, "Unable to read AgentProxy config file.", error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createInvalidConfigFileError(target.path, target.kind, "config must be valid JSON");
  }

  validateAgentProxyConfigInput(parsed, {
    path: target.path,
    source: target.kind,
  });

  return {
    config: clonePlainConfigObject(parsed),
    created: false,
  };
}

function setConfigValue(
  config: Record<string, unknown>,
  key: string,
  value: ConfigSetValue,
): Record<string, unknown> {
  const next = clonePlainConfigObject(config);
  const parts = key.split(".");
  let current = next;

  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing === undefined) {
      const child: Record<string, unknown> = {};
      current[part] = child;
      current = child;
      continue;
    }

    if (!isPlainObject(existing)) {
      throw createUnsupportedConfigKeyError(key, CONFIG_SET_OPERATION);
    }

    current = existing;
  }

  const leaf = parts.at(-1);
  if (leaf === undefined) {
    throw createUnsupportedConfigKeyError(key, CONFIG_SET_OPERATION);
  }
  current[leaf] = value;

  return next;
}

async function writeConfigFileAtomically(
  targetPath: string,
  config: Record<string, unknown>,
): Promise<void> {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid.toString()}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw createConfigSetWriteError(targetPath, "Unable to write AgentProxy config file.", error);
  }
}

function parseStringConfigValue(rawValue: string): string {
  assertSafeConfigSetString(rawValue, "config value");
  return rawValue;
}

function parseDefaultProvider(rawValue: string, key: string): string {
  if (rawValue !== "opencode") {
    throw createInvalidConfigSetValueError(
      key,
      "defaultProvider must remain opencode for AgentProxy v1.",
    );
  }

  return rawValue;
}

function parseBooleanConfigValue(rawValue: string, key: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw createInvalidConfigSetValueError(key, "value must be a boolean.");
}

function parseLogLevelConfigValue(rawValue: string, key: string): AgentProxyLogLevel {
  if (rawValue === "debug" || rawValue === "info" || rawValue === "warn" || rawValue === "error") {
    return rawValue;
  }

  throw createInvalidConfigSetValueError(
    key,
    "logging.level must be one of debug, info, warn, error.",
  );
}

function parseRuntimeModeConfigValue(rawValue: string, key: string): AgentProxyRuntimeMode {
  if (rawValue === "managed" || rawValue === "attached") {
    return rawValue;
  }

  throw createInvalidConfigSetValueError(
    key,
    "providers.opencode.runtime.mode must be managed or attached.",
  );
}

function parseRuntimePortConfigValue(rawValue: string, key: string): number {
  const trimmed = rawValue.trim();
  if (!/^[0-9]+$/u.test(trimmed)) {
    throw createInvalidConfigSetValueError(key, "runtime port must be an integer.");
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw createInvalidConfigSetValueError(
      key,
      "runtime port must be an integer between 1 and 65535.",
    );
  }

  return parsed;
}

function parseRuntimeBaseUrlConfigValue(rawValue: string, key: string): string {
  assertSafeConfigSetString(rawValue, key);
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw createInvalidConfigSetValueError(key, "runtime baseUrl must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createInvalidConfigSetValueError(key, "runtime baseUrl must use http or https.");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw createInvalidConfigSetValueError(
      key,
      "runtime baseUrl must not include credentials, query, or fragment.",
    );
  }

  const normalized = normalizeRuntimeBaseUrl(rawValue);
  if (normalized.baseUrl === "" || normalized.failureReason !== undefined) {
    throw createInvalidConfigSetValueError(key, "runtime baseUrl is not supported.");
  }

  return normalized.baseUrl;
}

function validateConfigSetSafety(config: Record<string, unknown>, key: string): void {
  assertOptionalSafePersistedString(config, "$schema", key);
  assertDefaultProviderSafe(config.defaultProvider, key);

  const storage = readOptionalPlainObject(config, "storage");
  assertOptionalSafePersistedString(config, "workspacePath", key);
  assertOptionalSafePersistedString(storage, "path", key);

  const providers = readOptionalPlainObject(config, "providers");
  const opencode = readOptionalPlainObject(providers, "opencode");
  assertOptionalSafePersistedString(opencode, "binary", key);

  const runtime = readOptionalPlainObject(opencode, "runtime");
  assertOptionalSafePersistedString(runtime, "hostname", key);

  const baseUrl = runtime?.baseUrl;
  if (baseUrl !== undefined) {
    if (typeof baseUrl !== "string") {
      throw createInvalidConfigSetValueError(key, "existing runtime baseUrl must be a string.");
    }
    assertPersistableRuntimeBaseUrl(baseUrl, key);
  }

  const passthroughEnv = opencode?.passthroughEnv;
  if (passthroughEnv !== undefined) {
    if (!isPlainObject(passthroughEnv)) {
      throw createInvalidConfigSetValueError(
        key,
        "existing providers.opencode.passthroughEnv must be an object.",
      );
    }
    if (Object.keys(passthroughEnv).length > 0) {
      throw createInvalidConfigSetValueError(
        key,
        "existing providers.opencode.passthroughEnv must be removed before config set can safely rewrite this file.",
      );
    }
  }
}

function assertDefaultProviderSafe(value: unknown, key: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    throw createInvalidConfigSetValueError(key, "existing defaultProvider must be a string.");
  }
  assertSafeConfigSetString(value, `${key}.defaultProvider`);
  if (value !== "opencode") {
    throw createInvalidConfigSetValueError(
      key,
      "existing defaultProvider must be opencode before config set can rewrite this file.",
    );
  }
}

function assertPersistableRuntimeBaseUrl(value: string, key: string): void {
  assertSafeConfigSetString(value, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw createInvalidConfigSetValueError(key, "existing runtime baseUrl must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createInvalidConfigSetValueError(key, "existing runtime baseUrl must use http or https.");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw createInvalidConfigSetValueError(
      key,
      "existing runtime baseUrl must not include credentials, query, or fragment before config set can rewrite this file.",
    );
  }
}

function assertOptionalSafePersistedString(
  parent: Record<string, unknown> | undefined,
  property: string,
  key: string,
): void {
  const value = parent?.[property];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    throw createInvalidConfigSetValueError(key, `existing ${property} must be a string.`);
  }

  assertSafeConfigSetString(value, `${key}.${property}`);
}

function assertSafeConfigSetString(value: string, key: string): void {
  if (CONFIG_SET_ANSI_ESCAPE_PATTERN.test(value) || CONFIG_SET_UNSAFE_CONTROL_PATTERN.test(value)) {
    throw createInvalidConfigSetValueError(
      key,
      "string values must not contain terminal controls.",
    );
  }
  if (redactString(value) !== value || CONFIG_SET_SECRET_VALUE_PATTERN.test(value)) {
    throw createInvalidConfigSetValueError(
      key,
      "string values must not contain secret-shaped content.",
    );
  }
}

function readOptionalPlainObject(
  parent: Record<string, unknown> | undefined,
  property: string,
): Record<string, unknown> | undefined {
  const value = parent?.[property];
  if (value === undefined) {
    return undefined;
  }

  return isPlainObject(value) ? value : undefined;
}

function createInvalidConfigSetValueError(key: string, reason: string): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Invalid AgentProxy config value.",
    operation: CONFIG_SET_OPERATION,
    details: {
      key: sanitizeMachineString(key),
      reason,
      suggestion: "Run agentproxy config get without a key to inspect current config values.",
    },
  });
}

function createInvalidConfigFileError(
  filePath: string,
  source: AgentProxyConfigSourceKind,
  message: string,
  cause?: unknown,
): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: `Invalid AgentProxy config at ${filePath}: ${message}.`,
    operation: "config.validate",
    rawMessage: source,
    ...(cause !== undefined ? { cause } : {}),
    details: {
      path: filePath,
      source,
      schema: AGENTPROXY_CONFIG_SCHEMA_URL,
    },
  });
}

function summarizeConfigSetValue(key: string, value: ConfigSetValue): ConfigSetValue {
  if (typeof value !== "string") {
    return value;
  }
  if (!SAFE_STRING_OUTPUT_KEYS.has(key)) {
    return AGENTPROXY_REDACTED_VALUE;
  }

  const sanitized = sanitizeMachineString(value);
  return sanitized.includes(AGENTPROXY_REDACTED_VALUE) ? AGENTPROXY_REDACTED_VALUE : sanitized;
}

function createConfigSetWriteError(filePath: string, message: string, cause?: unknown): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: `${message} (${filePath}).`,
    operation: CONFIG_SET_OPERATION,
    ...(cause !== undefined ? { cause } : {}),
    details: {
      path: filePath,
      suggestion: "Check file permissions and the parent directory for the target config path.",
    },
  });
}

function clonePlainConfigObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizePathValue(value: string, cwd: string, homeDir: string): string {
  const expanded = expandHomePath(value, homeDir);
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  return path.normalize(absolute);
}

function normalizeBasePath(value: string): string {
  return path.resolve(value);
}

function expandHomePath(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homeDir, value.slice(2));
  }

  return value;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
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
