import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAgentProxyError } from "../core/index.js";
import { AGENTPROXY_CONFIG_SCHEMA_URL, createDefaultAgentProxyConfig } from "./defaults.js";
import { AGENTPROXY_GLOBAL_CONFIG_PATH, AGENTPROXY_PROJECT_CONFIG_PATH } from "./paths.js";
import type {
  AgentProxyCliConfigOverrides,
  AgentProxyConfig,
  AgentProxyConfigInput,
  AgentProxyConfigSource,
  AgentProxyConfigSourceKind,
  AgentProxyLoggingConfig,
  AgentProxyProviderRuntimeConfig,
  AgentProxyProvidersConfig,
  AgentProxyRuntimeMode,
  AgentProxyStorageConfig,
  OpenCodePassthroughEnv,
  OpenCodeProviderConfigInput,
  ResolvedAgentProxyConfig,
} from "./types.js";
import { OPENCODE_PASSTHROUGH_ENV_NAMES } from "./types.js";

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "$schema",
  "defaultProvider",
  "workspacePath",
  "storage",
  "providers",
  "logging",
]);
const ALLOWED_STORAGE_KEYS = new Set(["path"]);
const ALLOWED_LOGGING_KEYS = new Set(["level", "redact"]);
const ALLOWED_PROVIDER_KEYS = new Set(["enabled", "binary", "runtime", "passthroughEnv"]);
const ALLOWED_RUNTIME_KEYS = new Set(["mode", "hostname", "port", "baseUrl"]);
const ALLOWED_PASSTHROUGH_ENV_KEYS = new Set<string>(OPENCODE_PASSTHROUGH_ENV_NAMES);
const ALLOWED_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);
const ALLOWED_RUNTIME_MODES = new Set<AgentProxyRuntimeMode>(["managed", "attached"]);

export interface ResolveAgentProxyConfigOptions {
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
}

export async function resolveAgentProxyConfig(
  options: ResolveAgentProxyConfigOptions = {},
): Promise<ResolvedAgentProxyConfig> {
  const cwd = normalizeBasePath(options.cwd ?? process.cwd());
  const homeDir = normalizeBasePath(options.homeDir ?? path.resolve(process.env.HOME ?? path.sep));
  const globalConfigPath = path.join(homeDir, AGENTPROXY_GLOBAL_CONFIG_PATH);
  const projectConfigPath = path.join(cwd, AGENTPROXY_PROJECT_CONFIG_PATH);
  const env = options.env ?? process.env;
  const cli = options.cli ?? {};

  const sources: AgentProxyConfigSource[] = [{ kind: "builtin" }];
  let resolved = createDefaultAgentProxyConfig();

  const globalConfig = await loadConfigFile(globalConfigPath, "global");
  if (globalConfig !== undefined) {
    resolved = mergeAgentProxyConfig(resolved, globalConfig);
    sources.push({ kind: "global", path: globalConfigPath });
  }

  const projectConfig = await loadConfigFile(projectConfigPath, "project");
  if (projectConfig !== undefined) {
    resolved = mergeAgentProxyConfig(resolved, projectConfig);
    sources.push({ kind: "project", path: projectConfigPath });
  }

  if (cli.configPath !== undefined) {
    const explicitConfigPath = normalizePathValue(cli.configPath, cwd, homeDir);
    const explicitConfig = await loadConfigFile(explicitConfigPath, "explicit", {
      required: true,
    });
    if (explicitConfig !== undefined) {
      resolved = mergeAgentProxyConfig(resolved, explicitConfig);
      sources.push({ kind: "explicit", path: explicitConfigPath });
    }
  }

  const envConfig = createConfigInputFromEnv(env);
  if (!isEmptyConfigInput(envConfig)) {
    resolved = mergeAgentProxyConfig(resolved, envConfig);
    sources.push({ kind: "env" });
  }

  const cliConfig = createConfigInputFromCli(cli);
  if (!isEmptyConfigInput(cliConfig)) {
    resolved = mergeAgentProxyConfig(resolved, cliConfig);
    sources.push({ kind: "cli" });
  }

  const finalConfig = finalizeAgentProxyConfig(resolved, cwd, homeDir);

  return {
    config: finalConfig,
    sources,
    paths: {
      globalConfigPath,
      projectConfigPath,
      ...(cli.configPath !== undefined
        ? { explicitConfigPath: normalizePathValue(cli.configPath, cwd, homeDir) }
        : {}),
    },
  };
}

export function validateAgentProxyConfigInput(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): AgentProxyConfigInput {
  return validateConfigInput(value, context);
}

async function loadConfigFile(
  filePath: string,
  sourceKind: AgentProxyConfigSourceKind,
  options: { required?: boolean } = {},
): Promise<AgentProxyConfigInput | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw invalidConfig(
        "config.validate",
        "config must be valid JSON",
        { path: filePath, source: sourceKind },
        error,
      );
    }

    return validateConfigInput(parsed, { path: filePath, source: sourceKind });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      if (options.required === true) {
        throw invalidConfig("config.validate", "explicit config file was not found", {
          path: filePath,
          source: sourceKind,
        });
      }

      return undefined;
    }

    throw error;
  }
}

function createConfigInputFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AgentProxyConfigInput {
  const input: AgentProxyConfigInput = {};

  if (env.AGENTPROXY_DEFAULT_PROVIDER !== undefined) {
    input.defaultProvider = env.AGENTPROXY_DEFAULT_PROVIDER;
  }

  if (env.AGENTPROXY_WORKSPACE !== undefined) {
    input.workspacePath = env.AGENTPROXY_WORKSPACE;
  }

  if (env.AGENTPROXY_STORAGE_PATH !== undefined) {
    input.storage = { path: env.AGENTPROXY_STORAGE_PATH };
  }

  if (env.AGENTPROXY_LOG_LEVEL !== undefined || env.AGENTPROXY_LOG_REDACT !== undefined) {
    input.logging = {
      ...(env.AGENTPROXY_LOG_LEVEL !== undefined
        ? { level: parseLogLevel(env.AGENTPROXY_LOG_LEVEL, "AGENTPROXY_LOG_LEVEL") }
        : {}),
      ...(env.AGENTPROXY_LOG_REDACT !== undefined
        ? { redact: parseBoolean(env.AGENTPROXY_LOG_REDACT, "AGENTPROXY_LOG_REDACT") }
        : {}),
    };
  }

  const opencodeInput: OpenCodeProviderConfigInput = {};
  if (env.AGENTPROXY_OPENCODE_ENABLED !== undefined) {
    opencodeInput.enabled = parseBoolean(
      env.AGENTPROXY_OPENCODE_ENABLED,
      "AGENTPROXY_OPENCODE_ENABLED",
    );
  }
  if (env.AGENTPROXY_OPENCODE_BINARY !== undefined) {
    opencodeInput.binary = env.AGENTPROXY_OPENCODE_BINARY;
  }
  if (env.AGENTPROXY_OPENCODE_RUNTIME_MODE !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      mode: parseRuntimeMode(
        env.AGENTPROXY_OPENCODE_RUNTIME_MODE,
        "AGENTPROXY_OPENCODE_RUNTIME_MODE",
      ),
    };
  }
  if (env.AGENTPROXY_OPENCODE_RUNTIME_HOSTNAME !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      hostname: env.AGENTPROXY_OPENCODE_RUNTIME_HOSTNAME,
    };
  }
  if (env.AGENTPROXY_OPENCODE_RUNTIME_PORT !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      port: parsePort(env.AGENTPROXY_OPENCODE_RUNTIME_PORT, "AGENTPROXY_OPENCODE_RUNTIME_PORT"),
    };
  }
  if (env.AGENTPROXY_OPENCODE_RUNTIME_BASE_URL !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      baseUrl: env.AGENTPROXY_OPENCODE_RUNTIME_BASE_URL,
    };
  }

  if (!isEmptyOpenCodeInput(opencodeInput)) {
    input.providers = { opencode: opencodeInput };
  }

  return input;
}

function createConfigInputFromCli(cli: AgentProxyCliConfigOverrides): AgentProxyConfigInput {
  const input: AgentProxyConfigInput = {};

  if (cli.defaultProvider !== undefined) {
    input.defaultProvider = cli.defaultProvider;
  }

  if (cli.workspacePath !== undefined) {
    input.workspacePath = cli.workspacePath;
  }

  if (cli.storagePath !== undefined) {
    input.storage = { path: cli.storagePath };
  }

  if (cli.logLevel !== undefined || cli.logRedact !== undefined) {
    input.logging = {
      ...(cli.logLevel !== undefined ? { level: cli.logLevel } : {}),
      ...(cli.logRedact !== undefined ? { redact: cli.logRedact } : {}),
    };
  }

  const opencodeInput: OpenCodeProviderConfigInput = {};
  if (cli.opencodeEnabled !== undefined) {
    opencodeInput.enabled = cli.opencodeEnabled;
  }
  if (cli.opencodeBinary !== undefined) {
    opencodeInput.binary = cli.opencodeBinary;
  }
  if (cli.opencodeRuntimeMode !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      mode: cli.opencodeRuntimeMode,
    };
  }
  if (cli.opencodeRuntimeHostname !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      hostname: cli.opencodeRuntimeHostname,
    };
  }
  if (cli.opencodeRuntimePort !== undefined) {
    validatePortValue(cli.opencodeRuntimePort, "opencodeRuntimePort", {
      path: "opencodeRuntimePort",
      source: "cli",
    });
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      port: cli.opencodeRuntimePort,
    };
  }
  if (cli.opencodeRuntimeBaseUrl !== undefined) {
    opencodeInput.runtime = {
      ...(opencodeInput.runtime ?? {}),
      baseUrl: cli.opencodeRuntimeBaseUrl,
    };
  }

  if (!isEmptyOpenCodeInput(opencodeInput)) {
    input.providers = { opencode: opencodeInput };
  }

  return input;
}

function finalizeAgentProxyConfig(
  config: AgentProxyConfig,
  cwd: string,
  homeDir: string,
): AgentProxyConfig {
  return withSchema(config.$schema, {
    defaultProvider: config.defaultProvider,
    workspacePath: normalizeWorkspacePath(config.workspacePath, cwd, homeDir),
    storage: {
      path: normalizePathValue(config.storage.path, cwd, homeDir),
    },
    providers: {
      opencode: {
        enabled: config.providers.opencode.enabled,
        binary: normalizePathOrCommand(config.providers.opencode.binary, cwd, homeDir),
        runtime: normalizeRuntimeConfig(config.providers.opencode.runtime),
        passthroughEnv: {
          ...config.providers.opencode.passthroughEnv,
        },
      },
    },
    logging: {
      level: config.logging.level,
      redact: config.logging.redact,
    },
  });
}

function mergeAgentProxyConfig(
  base: AgentProxyConfig,
  overlay: AgentProxyConfigInput,
): AgentProxyConfig {
  const providers = mergeProviderConfig(base.providers, overlay.providers);
  return withSchema(overlay.$schema ?? base.$schema, {
    defaultProvider: overlay.defaultProvider ?? base.defaultProvider,
    workspacePath: overlay.workspacePath ?? base.workspacePath,
    storage: {
      path: overlay.storage?.path ?? base.storage.path,
    },
    providers,
    logging: {
      level: overlay.logging?.level ?? base.logging.level,
      redact: overlay.logging?.redact ?? base.logging.redact,
    },
  });
}

function mergeProviderConfig(
  base: AgentProxyProvidersConfig,
  overlay?: AgentProxyConfigInput["providers"],
): AgentProxyProvidersConfig {
  const opencode = overlay?.opencode;
  if (opencode === undefined) {
    return {
      opencode: {
        enabled: base.opencode.enabled,
        binary: base.opencode.binary,
        runtime: {
          mode: base.opencode.runtime.mode,
          hostname: base.opencode.runtime.hostname,
          port: base.opencode.runtime.port,
          ...(base.opencode.runtime.baseUrl !== undefined
            ? { baseUrl: base.opencode.runtime.baseUrl }
            : {}),
        },
        passthroughEnv: { ...base.opencode.passthroughEnv },
      },
    };
  }

  return {
    opencode: {
      enabled: opencode.enabled ?? base.opencode.enabled,
      binary: opencode.binary ?? base.opencode.binary,
      runtime: {
        mode: opencode.runtime?.mode ?? base.opencode.runtime.mode,
        hostname: opencode.runtime?.hostname ?? base.opencode.runtime.hostname,
        port: opencode.runtime?.port ?? base.opencode.runtime.port,
        ...(opencode.runtime?.baseUrl !== undefined
          ? { baseUrl: opencode.runtime.baseUrl }
          : base.opencode.runtime.baseUrl !== undefined
            ? { baseUrl: base.opencode.runtime.baseUrl }
            : {}),
      },
      passthroughEnv: {
        ...base.opencode.passthroughEnv,
        ...(opencode.passthroughEnv ?? {}),
      },
    },
  };
}

function normalizeRuntimeConfig(
  runtime: AgentProxyProviderRuntimeConfig,
): AgentProxyProviderRuntimeConfig {
  return {
    mode: runtime.mode,
    hostname: runtime.hostname,
    port: runtime.port,
    ...(runtime.baseUrl !== undefined ? { baseUrl: runtime.baseUrl } : {}),
  };
}

function validateConfigInput(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): AgentProxyConfigInput {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "config must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw invalidConfig("config.validate", `unknown top-level key "${key}"`, context);
    }
  }

  const input: AgentProxyConfigInput = {};

  if ("$schema" in value) {
    input.$schema = validateString(value.$schema, "$schema", context);
  }
  if ("defaultProvider" in value) {
    input.defaultProvider = validateString(value.defaultProvider, "defaultProvider", context);
  }
  if ("workspacePath" in value) {
    input.workspacePath = validateString(value.workspacePath, "workspacePath", context);
  }
  if ("storage" in value) {
    input.storage = validateStorageConfig(value.storage, context);
  }
  if ("providers" in value) {
    input.providers = validateProvidersConfig(value.providers, context);
  }
  if ("logging" in value) {
    input.logging = validateLoggingConfig(value.logging, context);
  }

  return input;
}

function validateStorageConfig(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): Partial<AgentProxyStorageConfig> {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "storage must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_STORAGE_KEYS.has(key)) {
      throw invalidConfig("config.validate", `unknown storage key "${key}"`, context);
    }
  }

  return {
    ...(value.path !== undefined
      ? { path: validateString(value.path, "storage.path", context) }
      : {}),
  };
}

function validateLoggingConfig(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): Partial<AgentProxyLoggingConfig> {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "logging must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_LOGGING_KEYS.has(key)) {
      throw invalidConfig("config.validate", `unknown logging key "${key}"`, context);
    }
  }

  const output: Partial<AgentProxyLoggingConfig> = {};
  if (value.level !== undefined) {
    const level = validateString(value.level, "logging.level", context);
    if (!ALLOWED_LOG_LEVELS.has(level)) {
      throw invalidConfig(
        "config.validate",
        "logging.level must be one of debug, info, warn, error",
        context,
      );
    }

    output.level = level as AgentProxyLoggingConfig["level"];
  }

  if (value.redact !== undefined) {
    output.redact = validateBoolean(value.redact, "logging.redact", context);
  }

  return output;
}

function validateProvidersConfig(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): NonNullable<AgentProxyConfigInput["providers"]> {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "providers must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (key !== "opencode") {
      throw invalidConfig("config.validate", `unknown provider config "${key}"`, context);
    }
  }

  return {
    ...(value.opencode !== undefined
      ? { opencode: validateOpenCodeProviderConfig(value.opencode, context) }
      : {}),
  };
}

function validateOpenCodeProviderConfig(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): OpenCodeProviderConfigInput {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "providers.opencode must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_PROVIDER_KEYS.has(key)) {
      throw invalidConfig("config.validate", `unknown providers.opencode key "${key}"`, context);
    }
  }

  const output: OpenCodeProviderConfigInput = {};

  if (value.enabled !== undefined) {
    output.enabled = validateBoolean(value.enabled, "providers.opencode.enabled", context);
  }
  if (value.binary !== undefined) {
    output.binary = validateString(value.binary, "providers.opencode.binary", context);
  }
  if (value.runtime !== undefined) {
    output.runtime = validateRuntimeConfig(value.runtime, context);
  }
  if (value.passthroughEnv !== undefined) {
    output.passthroughEnv = validatePassthroughEnv(value.passthroughEnv, context);
  }

  return output;
}

function validateRuntimeConfig(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): NonNullable<OpenCodeProviderConfigInput["runtime"]> {
  if (!isPlainObject(value)) {
    throw invalidConfig("config.validate", "providers.opencode.runtime must be an object", context);
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_RUNTIME_KEYS.has(key)) {
      throw invalidConfig(
        "config.validate",
        `unknown providers.opencode.runtime key "${key}"`,
        context,
      );
    }
  }

  const output: NonNullable<OpenCodeProviderConfigInput["runtime"]> = {};
  if (value.mode !== undefined) {
    const mode = validateString(value.mode, "providers.opencode.runtime.mode", context);
    if (!ALLOWED_RUNTIME_MODES.has(mode as AgentProxyRuntimeMode)) {
      throw invalidConfig(
        "config.validate",
        "providers.opencode.runtime.mode must be managed or attached",
        context,
      );
    }
    output.mode = mode as AgentProxyRuntimeMode;
  }
  if (value.hostname !== undefined) {
    output.hostname = validateString(
      value.hostname,
      "providers.opencode.runtime.hostname",
      context,
    );
  }
  if (value.port !== undefined) {
    output.port = validatePort(value.port, "providers.opencode.runtime.port", context);
  }
  if (value.baseUrl !== undefined) {
    output.baseUrl = validateString(value.baseUrl, "providers.opencode.runtime.baseUrl", context);
  }

  return output;
}

function validatePassthroughEnv(
  value: unknown,
  context: { path: string; source: AgentProxyConfigSourceKind },
): OpenCodePassthroughEnv {
  if (!isPlainObject(value)) {
    throw invalidConfig(
      "config.validate",
      "providers.opencode.passthroughEnv must be an object",
      context,
    );
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_PASSTHROUGH_ENV_KEYS.has(key)) {
      throw invalidConfig(
        "config.validate",
        `unknown providers.opencode.passthroughEnv key "${key}"`,
        context,
      );
    }
  }

  const output: OpenCodePassthroughEnv = {};
  for (const key of OPENCODE_PASSTHROUGH_ENV_NAMES) {
    const candidate = value[key];
    if (candidate !== undefined) {
      output[key] = validateString(candidate, `providers.opencode.passthroughEnv.${key}`, context);
    }
  }

  return output;
}

function validateString(
  value: unknown,
  fieldPath: string,
  context: { path: string; source: AgentProxyConfigSourceKind },
): string {
  if (typeof value !== "string") {
    throw invalidConfig("config.validate", `${fieldPath} must be a string`, context);
  }

  return value;
}

function validateBoolean(
  value: unknown,
  fieldPath: string,
  context: { path: string; source: AgentProxyConfigSourceKind },
): boolean {
  if (typeof value !== "boolean") {
    throw invalidConfig("config.validate", `${fieldPath} must be a boolean`, context);
  }

  return value;
}

function validatePort(
  value: unknown,
  fieldPath: string,
  context: { path: string; source: AgentProxyConfigSourceKind },
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalidConfig("config.validate", `${fieldPath} must be an integer`, context);
  }

  return validatePortValue(value, fieldPath, context);
}

function parseBoolean(value: string, envName: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw invalidConfig("config.validate", `${envName} must be a boolean`, {
    path: envName,
    source: "env",
  });
}

function validatePortValue(
  value: number,
  fieldPath: string,
  context: { path: string; source: AgentProxyConfigSourceKind },
): number {
  if (value < 1 || value > 65535) {
    throw invalidConfig(
      "config.validate",
      `${fieldPath} must be an integer between 1 and 65535`,
      context,
    );
  }

  return value;
}

function parsePort(value: string, envName: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(parsed)) {
    throw invalidConfig("config.validate", `${envName} must be an integer`, {
      path: envName,
      source: "env",
    });
  }

  return validatePortValue(parsed, envName, {
    path: envName,
    source: "env",
  });
}

function parseRuntimeMode(value: string, envName: string): AgentProxyRuntimeMode {
  if (value === "managed" || value === "attached") {
    return value;
  }

  throw invalidConfig("config.validate", `${envName} must be managed or attached`, {
    path: envName,
    source: "env",
  });
}

function withSchema(
  schema: string | undefined,
  config: Omit<AgentProxyConfig, "$schema">,
): AgentProxyConfig {
  return {
    ...(schema !== undefined ? { $schema: schema } : {}),
    ...config,
  };
}

function parseLogLevel(value: string, envName: string): AgentProxyLoggingConfig["level"] {
  if (ALLOWED_LOG_LEVELS.has(value)) {
    return value as AgentProxyLoggingConfig["level"];
  }

  throw invalidConfig("config.validate", `${envName} must be one of debug, info, warn, error`, {
    path: envName,
    source: "env",
  });
}

function invalidConfig(
  operation: string,
  message: string,
  context: { path: string; source: AgentProxyConfigSourceKind },
  cause?: unknown,
) {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: `Invalid AgentProxy config at ${context.path}: ${message}.`,
    operation,
    rawMessage: context.source,
    cause,
    details: {
      path: context.path,
      source: context.source,
      schema: AGENTPROXY_CONFIG_SCHEMA_URL,
    },
  });
}

function normalizeWorkspacePath(value: string, cwd: string, homeDir: string): string {
  return normalizePathValue(value, cwd, homeDir);
}

function normalizePathOrCommand(value: string, cwd: string, homeDir: string): string {
  if (!value.startsWith("~")) {
    return value;
  }

  return normalizePathValue(value, cwd, homeDir);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptyOpenCodeInput(value: OpenCodeProviderConfigInput): boolean {
  return (
    value.enabled === undefined &&
    value.binary === undefined &&
    value.runtime === undefined &&
    value.passthroughEnv === undefined
  );
}

function isEmptyConfigInput(value: AgentProxyConfigInput): boolean {
  return (
    value.$schema === undefined &&
    value.defaultProvider === undefined &&
    value.workspacePath === undefined &&
    value.storage === undefined &&
    value.providers === undefined &&
    value.logging === undefined
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
