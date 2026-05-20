import { createRequire } from "node:module";
import {
  createAgentProxyError,
  isAgentProxyError,
  type ProviderMetadata,
} from "../../core/index.js";
import {
  OPENCODE_EVENT_STREAM_PATH,
  OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
} from "../../runtimes/index.js";
import type { ProviderCapabilities, ProviderContext, ProviderHealth } from "../types.js";
import { CAPABILITY_SCHEMA_VERSION, normalizeProviderCapabilities } from "../types.js";
import {
  probeOpenCodeBinary,
  type OpenCodeBinaryProbe,
  type ProbeOpenCodeBinaryOptions,
} from "./binary.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";

export const OPENCODE_PROVIDER_PROBE_METADATA_KEY = "agentproxyOpenCodeProviderProbe";
export const OPENCODE_SDK_MODULE_NAME = "@opencode-ai/sdk";

export interface OpenCodeProviderOptions {
  binary?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd?: string;
  requestTimeoutMs?: number;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  sdkResolver?: OpenCodeSdkResolver;
}

export type OpenCodeSdkResolver = (
  moduleName: string,
) => OpenCodeSdkProbe | Promise<OpenCodeSdkProbe>;

export interface OpenCodeSdkProbe {
  moduleName: string;
  available: boolean;
  version?: string;
  resolvedPath?: string;
  error?: ProviderMetadata;
}

export interface OpenCodeProviderProbeReport {
  checkedAt: string;
  health: ProviderHealth;
  capabilities: ProviderCapabilities;
  metadata: ProviderMetadata;
}

interface OpenCodeBinaryProbeMetadata {
  available: boolean;
  binary?: string;
  resolvedPath?: string;
  source?: OpenCodeBinaryProbe["source"];
  version?: string;
  minimumSupportedVersion?: string;
  errorCode?: string;
  message?: string;
  suggestion?: string;
}

interface OpenCodeRuntimeProbeMetadata {
  available: boolean;
  baseUrl?: string;
  version?: string;
  failureReason?: string;
  health?: EndpointProbeMetadata;
  endpoints: Record<OpenCodeProviderEndpointId, EndpointProbeMetadata>;
}

interface EndpointProbeMetadata {
  supported: boolean;
  path: string;
  method: string;
  status?: number;
  mediaType?: string;
  allowMethods?: string[];
  version?: string;
  failureReason?: string;
}

export interface NormalizedRuntimeUrl {
  baseUrl: string;
  failureReason?: string;
}

interface EndpointProbeInput {
  id: OpenCodeProviderEndpointId;
  path: string;
  method?: string;
  expectedMediaType?: string;
  requiredAllowMethod?: string;
}

type OpenCodeProviderEndpointId =
  | "openApi"
  | "eventStream"
  | "sessionList"
  | "sessionCreate"
  | "sessionGet"
  | "sessionStatus"
  | "sessionDelete"
  | "sessionFork"
  | "sessionShare"
  | "sessionDiff"
  | "sessionTodo"
  | "sessionRevert"
  | "messageSend"
  | "permissionResponse"
  | "tuiPromptPrefill"
  | "providerList"
  | "slashCommands"
  | "mcp"
  | "lsp"
  | "formatters"
  | "customAgents";

const DEFAULT_REQUEST_TIMEOUT_MS = 1_000;
const PROBE_SESSION_ID = "__agentproxy_probe__";
const PROBE_PERMISSION_ID = "__permission_probe__";

const requireFromModule = createRequire(import.meta.url);

export async function probeOpenCodeProvider(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
  providerMetadata: ProviderMetadata,
): Promise<OpenCodeProviderProbeReport> {
  const now = options.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const requestTimeoutMs = validateRequestTimeout(
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const binary = probeBinary(options, context);
  const sdk = await probeSdk(options.sdkResolver);
  const runtime = await probeRuntime({
    baseUrl: resolveRuntimeBaseUrl(options, context),
    requestTimeoutMs,
    fetchImplementation,
    signal: context.signal,
  });
  const providerVersion = runtime.version ?? binary.version;
  const probeMetadata = {
    ...providerMetadata,
    [OPENCODE_PROVIDER_PROBE_METADATA_KEY]: {
      checkedAt,
      binary,
      runtime,
      sdk,
    },
  };

  return {
    checkedAt,
    metadata: probeMetadata,
    health: buildHealth({
      context,
      checkedAt,
      providerVersion,
      metadata: probeMetadata,
      binary,
      runtime,
    }),
    capabilities: buildCapabilities({
      providerVersion,
      metadata: probeMetadata,
      binary,
      runtime,
      sdk,
    }),
  };
}

function probeBinary(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
): OpenCodeBinaryProbeMetadata {
  try {
    const probeOptions: ProbeOpenCodeBinaryOptions = {
      env: createEffectiveEnvironment(options.env),
    };
    if (options.binary !== undefined) {
      probeOptions.binary = options.binary;
    }
    const cwd = context.workspacePath ?? options.cwd;
    if (cwd !== undefined) {
      probeOptions.cwd = cwd;
    }

    const probe = probeOpenCodeBinary(probeOptions);
    return {
      available: true,
      binary: probe.binary,
      resolvedPath: probe.resolvedPath,
      source: probe.source,
      version: probe.version,
      minimumSupportedVersion: probe.minimumSupportedVersion,
    };
  } catch (error) {
    return {
      available: false,
      ...formatBinaryProbeError(error),
    };
  }
}

async function probeSdk(resolver: OpenCodeSdkResolver | undefined): Promise<OpenCodeSdkProbe> {
  try {
    return await (resolver ?? defaultOpenCodeSdkResolver)(OPENCODE_SDK_MODULE_NAME);
  } catch (error) {
    return {
      moduleName: OPENCODE_SDK_MODULE_NAME,
      available: false,
      error: formatError(error),
    };
  }
}

async function probeRuntime(input: {
  baseUrl: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<OpenCodeRuntimeProbeMetadata> {
  const endpoints = emptyEndpointProbeMap();
  if (input.baseUrl === undefined) {
    return {
      available: false,
      failureReason: "missing_base_url",
      endpoints,
    };
  }

  const normalized = normalizeRuntimeBaseUrl(input.baseUrl);
  if (normalized.failureReason !== undefined) {
    return {
      available: false,
      baseUrl: normalized.baseUrl,
      failureReason: normalized.failureReason,
      endpoints,
    };
  }

  const health = await probeHealthEndpoint({
    baseUrl: normalized.baseUrl,
    requestTimeoutMs: input.requestTimeoutMs,
    fetchImplementation: input.fetchImplementation,
    signal: input.signal,
  });
  if (!health.supported || health.version === undefined) {
    return {
      available: false,
      baseUrl: normalized.baseUrl,
      failureReason: health.failureReason ?? "health_check_failed",
      health,
      endpoints,
    };
  }

  const endpointResults = await Promise.all(
    endpointProbeInputs().map(async (endpoint) => [
      endpoint.id,
      await probeEndpoint({
        ...endpoint,
        baseUrl: normalized.baseUrl,
        requestTimeoutMs: input.requestTimeoutMs,
        fetchImplementation: input.fetchImplementation,
        signal: input.signal,
      }),
    ]),
  );

  return {
    available: true,
    baseUrl: normalized.baseUrl,
    version: health.version,
    health,
    endpoints: Object.fromEntries(endpointResults) as Record<
      OpenCodeProviderEndpointId,
      EndpointProbeMetadata
    >,
  };
}

async function probeHealthEndpoint(input: {
  baseUrl: string;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<EndpointProbeMetadata> {
  try {
    const { response, body } = await withRequestTimeout(
      async (requestSignal) => {
        const healthResponse = await input.fetchImplementation(
          `${input.baseUrl}${OPENCODE_MANAGED_RUNTIME_HEALTH_PATH}`,
          {
            headers: {
              accept: "application/json",
            },
            signal: requestSignal,
          },
        );
        if (!healthResponse.ok) {
          await cancelResponseBody(healthResponse);
          return {
            response: healthResponse,
            body: undefined,
          };
        }

        return {
          response: healthResponse,
          body: await healthResponse.json(),
        };
      },
      input.requestTimeoutMs,
      input.signal,
    );
    const baseResult = endpointResultFromResponse(response, {
      path: OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
      method: "GET",
    });

    if (!response.ok) {
      return {
        ...baseResult,
        supported: false,
        failureReason: "unhealthy_response",
      };
    }

    const version = readOpenCodeHealthVersion(body);
    if (version === undefined) {
      return {
        ...baseResult,
        supported: false,
        failureReason: "unexpected_health_response",
      };
    }

    return {
      ...baseResult,
      supported: true,
      version,
    };
  } catch {
    return {
      supported: false,
      path: OPENCODE_MANAGED_RUNTIME_HEALTH_PATH,
      method: "GET",
      failureReason: "request_failed",
    };
  }
}

async function probeEndpoint(
  input: EndpointProbeInput & {
    baseUrl: string;
    requestTimeoutMs: number;
    fetchImplementation: typeof fetch;
    signal: AbortSignal | undefined;
  },
): Promise<EndpointProbeMetadata> {
  const method = input.method ?? "GET";
  try {
    const response = await withRequestTimeout(
      async (requestSignal) =>
        await input.fetchImplementation(`${input.baseUrl}${input.path}`, {
          headers: {
            accept: input.expectedMediaType ?? "application/json",
          },
          method,
          signal: requestSignal,
        }),
      input.requestTimeoutMs,
      input.signal,
    );
    const result = endpointResultFromResponse(response, {
      path: input.path,
      method,
    });
    const supportInput: { expectedMediaType?: string; requiredAllowMethod?: string } = {};
    if (input.expectedMediaType !== undefined) {
      supportInput.expectedMediaType = input.expectedMediaType;
    }
    if (input.requiredAllowMethod !== undefined) {
      supportInput.requiredAllowMethod = input.requiredAllowMethod;
    }
    const supported = endpointIsSupported(response, supportInput);
    await cancelResponseBody(response);
    return {
      ...result,
      supported,
      ...(supported ? {} : { failureReason: unsupportedEndpointReason(response, input) }),
    };
  } catch {
    return {
      supported: false,
      path: input.path,
      method,
      failureReason: "request_failed",
    };
  }
}

function buildHealth(input: {
  context: ProviderContext;
  checkedAt: string;
  providerVersion: string | undefined;
  metadata: ProviderMetadata;
  binary: OpenCodeBinaryProbeMetadata;
  runtime: OpenCodeRuntimeProbeMetadata;
}): ProviderHealth {
  if (input.runtime.available) {
    return {
      providerId: input.context.providerId,
      status: "healthy",
      checkedAt: input.checkedAt,
      message: "OpenCode runtime is healthy.",
      ...(input.providerVersion !== undefined ? { providerVersion: input.providerVersion } : {}),
      metadata: input.metadata,
    };
  }

  if (input.binary.available) {
    return {
      providerId: input.context.providerId,
      status: "degraded",
      checkedAt: input.checkedAt,
      message:
        input.runtime.failureReason === "missing_base_url"
          ? "No OpenCode runtime base URL was available for provider probing."
          : "OpenCode binary is available, but runtime probing did not pass.",
      ...(input.providerVersion !== undefined ? { providerVersion: input.providerVersion } : {}),
      metadata: input.metadata,
    };
  }

  return {
    providerId: input.context.providerId,
    status: "unhealthy",
    checkedAt: input.checkedAt,
    message: "OpenCode binary is unavailable and no healthy runtime was detected.",
    ...(input.providerVersion !== undefined ? { providerVersion: input.providerVersion } : {}),
    metadata: input.metadata,
  };
}

function buildCapabilities(input: {
  providerVersion: string | undefined;
  metadata: ProviderMetadata;
  binary: OpenCodeBinaryProbeMetadata;
  runtime: OpenCodeRuntimeProbeMetadata;
  sdk: OpenCodeSdkProbe;
}): ProviderCapabilities {
  const runtimeEndpoint = (id: OpenCodeProviderEndpointId): boolean =>
    input.runtime.endpoints[id]?.supported === true;
  const binaryAvailable = input.binary.available;
  const runtimeAvailable = input.runtime.available;

  return normalizeProviderCapabilities({
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    ...(input.providerVersion !== undefined ? { providerVersion: input.providerVersion } : {}),
    runtime: {
      serve: binaryAvailable,
      attach: binaryAvailable || runtimeAvailable,
      managedLifecycle: binaryAvailable,
      openApi: runtimeEndpoint("openApi"),
      sse: runtimeEndpoint("eventStream"),
      sdk: input.sdk.available,
    },
    sessions: {
      list: runtimeEndpoint("sessionList"),
      create: runtimeEndpoint("sessionCreate"),
      resume: runtimeEndpoint("sessionGet"),
      fork: false,
      delete: false,
      export: false,
      import: false,
      share: false,
      diff: false,
      revert: false,
      todo: false,
    },
    interaction: {
      nativeTui: false,
      headlessRun:
        runtimeEndpoint("eventStream") &&
        runtimeEndpoint("sessionCreate") &&
        runtimeEndpoint("sessionGet") &&
        runtimeEndpoint("messageSend"),
      promptPrefill: false,
      slashCommands: false,
      permissions: false,
    },
    ecosystem: {
      mcp: runtimeEndpoint("mcp"),
      lsp: runtimeEndpoint("lsp"),
      formatters: runtimeEndpoint("formatters"),
      customAgents: runtimeEndpoint("customAgents"),
      customCommands: runtimeEndpoint("slashCommands"),
      plugins: false,
    },
    metadata: input.metadata,
  });
}

function endpointProbeInputs(): EndpointProbeInput[] {
  return [
    {
      id: "openApi",
      path: "/doc",
    },
    {
      id: "eventStream",
      path: OPENCODE_EVENT_STREAM_PATH,
      expectedMediaType: "text/event-stream",
    },
    {
      id: "sessionList",
      path: "/session",
    },
    {
      id: "sessionCreate",
      path: "/session",
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "sessionGet",
      path: `/session/${PROBE_SESSION_ID}`,
      method: "OPTIONS",
      requiredAllowMethod: "GET",
    },
    {
      id: "sessionStatus",
      path: "/session/status",
    },
    {
      id: "sessionDelete",
      path: `/session/${PROBE_SESSION_ID}`,
      method: "OPTIONS",
      requiredAllowMethod: "DELETE",
    },
    {
      id: "sessionFork",
      path: `/session/${PROBE_SESSION_ID}/fork`,
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "sessionShare",
      path: `/session/${PROBE_SESSION_ID}/share`,
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "sessionDiff",
      path: `/session/${PROBE_SESSION_ID}/diff`,
      method: "OPTIONS",
      requiredAllowMethod: "GET",
    },
    {
      id: "sessionTodo",
      path: `/session/${PROBE_SESSION_ID}/todo`,
      method: "OPTIONS",
      requiredAllowMethod: "GET",
    },
    {
      id: "sessionRevert",
      path: `/session/${PROBE_SESSION_ID}/revert`,
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "messageSend",
      path: `/session/${PROBE_SESSION_ID}/message`,
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "permissionResponse",
      path: `/session/${PROBE_SESSION_ID}/permissions/${PROBE_PERMISSION_ID}`,
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "tuiPromptPrefill",
      path: "/tui/append-prompt",
      method: "OPTIONS",
      requiredAllowMethod: "POST",
    },
    {
      id: "providerList",
      path: "/provider",
    },
    {
      id: "slashCommands",
      path: "/command",
    },
    {
      id: "mcp",
      path: "/mcp",
    },
    {
      id: "lsp",
      path: "/lsp",
    },
    {
      id: "formatters",
      path: "/formatter",
    },
    {
      id: "customAgents",
      path: "/agent",
    },
  ];
}

function emptyEndpointProbeMap(): Record<OpenCodeProviderEndpointId, EndpointProbeMetadata> {
  return Object.fromEntries(
    endpointProbeInputs().map((input) => [
      input.id,
      {
        supported: false,
        path: input.path,
        method: input.method ?? "GET",
        failureReason: "not_probed",
      },
    ]),
  ) as Record<OpenCodeProviderEndpointId, EndpointProbeMetadata>;
}

function endpointResultFromResponse(
  response: Response,
  input: { path: string; method: string },
): EndpointProbeMetadata {
  const contentType = response.headers.get("content-type") ?? undefined;
  const allow = response.headers.get("allow") ?? undefined;
  const mediaType = contentType === undefined ? undefined : readMediaType(contentType);
  const allowMethods = allow === undefined ? undefined : parseAllowMethods(allow);

  return {
    supported: false,
    path: input.path,
    method: input.method,
    status: response.status,
    ...(mediaType !== undefined && mediaType !== "" ? { mediaType } : {}),
    ...(allowMethods !== undefined ? { allowMethods } : {}),
  };
}

function endpointIsSupported(
  response: Response,
  input: { expectedMediaType?: string; requiredAllowMethod?: string },
): boolean {
  if (input.expectedMediaType !== undefined) {
    return (
      response.ok &&
      readMediaType(response.headers.get("content-type") ?? "") === input.expectedMediaType
    );
  }

  if (input.requiredAllowMethod !== undefined) {
    const allow = response.headers.get("allow");
    return (
      (response.ok || response.status === 405) &&
      allow !== null &&
      allowHeaderIncludes(allow, input.requiredAllowMethod)
    );
  }

  return response.ok || response.status === 401 || response.status === 403;
}

function unsupportedEndpointReason(response: Response, input: EndpointProbeInput): string {
  if (input.expectedMediaType !== undefined && response.ok) {
    return "unexpected_content_type";
  }
  if (input.requiredAllowMethod !== undefined) {
    return response.headers.get("allow") === null ? "missing_allow_header" : "method_not_allowed";
  }
  if (response.status === 404) {
    return "not_found";
  }

  return "unhealthy_response";
}

function allowHeaderIncludes(allow: string, method: string): boolean {
  return parseAllowMethods(allow).includes(method.toUpperCase());
}

function parseAllowMethods(allow: string): string[] {
  return allow
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(isHttpMethod);
}

function isHttpMethod(value: string): boolean {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(value);
}

export function resolveRuntimeBaseUrl(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
): string | undefined {
  return (
    options.baseUrl ??
    readStringMetadata(context.metadata, "runtimeBaseUrl") ??
    readStringMetadata(context.metadata, "baseUrl") ??
    readStringMetadata(context.metadata, "serverUrl")
  );
}

export function normalizeRuntimeBaseUrl(rawBaseUrl: string): NormalizedRuntimeUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return {
      baseUrl: "",
      failureReason: "invalid_url",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      baseUrl: "",
      failureReason: "unsupported_protocol",
    };
  }

  const sanitized = new URL(parsed.href);
  const hadCredentials = sanitized.username !== "" || sanitized.password !== "";
  sanitized.username = "";
  sanitized.password = "";
  sanitized.search = "";
  sanitized.hash = "";
  const pathname = trimTrailingSlashes(sanitized.pathname);

  return {
    baseUrl: `${sanitized.origin}${pathname === "" ? "" : pathname}`,
    ...(hadCredentials ? { failureReason: "credentials_not_allowed" } : {}),
  };
}

function trimTrailingSlashes(value: string): string {
  if (value === "/") {
    return "";
  }

  return value.replace(/\/+$/u, "");
}

function readStringMetadata(metadata: ProviderMetadata, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readOpenCodeHealthVersion(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const healthy = record.healthy;
  const version = record.version;
  return healthy === true && typeof version === "string" && version.trim() !== ""
    ? version
    : undefined;
}

export async function withRequestTimeout<T>(
  callback: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal?.aborted === true) {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "OpenCode provider probe request was aborted.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.provider.probe",
    });
  }

  const controller = new AbortController();
  const requestTimeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  requestTimeout.unref();

  const abortExternalRequest = (): void => {
    controller.abort();
  };
  signal?.addEventListener("abort", abortExternalRequest, { once: true });

  try {
    return await callback(controller.signal);
  } finally {
    clearTimeout(requestTimeout);
    signal?.removeEventListener("abort", abortExternalRequest);
  }
}

export async function cancelResponseBody(response: Response): Promise<void> {
  try {
    const cancelPromise = response.body?.cancel();
    if (cancelPromise === undefined) {
      return;
    }

    await Promise.race([cancelPromise, sleep(10)]);
  } catch {
    // Best-effort cleanup only.
  }
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, durationMs);
    timeout.unref();
  });
}

function readMediaType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function validateRequestTimeout(value: number): number {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "OpenCode provider probe requestTimeoutMs must be a positive finite number.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.provider.probe.create",
    details: {
      option: "requestTimeoutMs",
      value: Number.isNaN(value) ? "NaN" : value,
    },
  });
}

function createEffectiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

function defaultOpenCodeSdkResolver(moduleName: string): OpenCodeSdkProbe {
  try {
    const packageJsonPath = requireFromModule.resolve(`${moduleName}/package.json`);
    const packageJson = requireFromModule(packageJsonPath) as { version?: unknown };
    return {
      moduleName,
      available: true,
      resolvedPath: packageJsonPath,
      ...(typeof packageJson.version === "string" ? { version: packageJson.version } : {}),
    };
  } catch {
    return {
      moduleName,
      available: false,
      error: {
        message: "OpenCode SDK module is not installed.",
      },
    };
  }
}

function formatBinaryProbeError(error: unknown): ProviderMetadata {
  if (isAgentProxyError(error)) {
    const suggestion = error.details?.suggestion;
    return {
      errorCode: error.code,
      message: error.message,
      ...(typeof suggestion === "string" ? { suggestion } : {}),
    };
  }

  return {
    errorCode: "PROVIDER_UNAVAILABLE",
    ...formatError(error),
  };
}

function formatError(error: unknown): ProviderMetadata {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}
