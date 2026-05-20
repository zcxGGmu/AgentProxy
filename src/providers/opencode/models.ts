import { createAgentProxyError } from "../../core/errors.js";
import { redactValue } from "../../logging/redact.js";
import type { ModelRef, ProviderContext } from "../types.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import {
  cancelResponseBody,
  type OpenCodeProviderOptions,
  normalizeRuntimeBaseUrl,
  resolveRuntimeBaseUrl,
  validateRequestTimeout,
  withRequestTimeout,
} from "./probe.js";

const DEFAULT_MODEL_LIST_REQUEST_TIMEOUT_MS = 1_000;
const OPENCODE_PROVIDER_LIST_PATH = "/provider";
const OPENCODE_LIST_MODELS_OPERATION = "opencode.provider.listModels";

interface OpenCodeProviderListResponse {
  all: OpenCodeProviderListProvider[];
  default: Record<string, string>;
  connected: string[];
}

interface OpenCodeProviderListProvider {
  id: string;
  name: string;
  api?: string;
  env?: string[];
  npm?: string;
  models: Record<string, OpenCodeProviderListModel>;
}

interface OpenCodeProviderListModel {
  id?: string;
  name?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  cost?: unknown;
  limit?: {
    context?: unknown;
    output?: unknown;
  };
  modalities?: unknown;
  experimental?: boolean;
  status?: string;
  provider?: unknown;
}

export async function listOpenCodeModels(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
): Promise<ModelRef[]> {
  const requestTimeoutMs = validateRequestTimeout(
    options.requestTimeoutMs ?? DEFAULT_MODEL_LIST_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveModelListBaseUrl(options, context);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const responseData = await fetchOpenCodeProviderList({
    baseUrl,
    workspacePath: context.workspacePath,
    requestTimeoutMs,
    fetchImplementation,
    signal: context.signal,
  });

  return responseData.all.flatMap((provider) => mapProviderModels(provider, responseData));
}

function resolveModelListBaseUrl(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
): string {
  const rawBaseUrl = resolveRuntimeBaseUrl(options, context);
  if (rawBaseUrl === undefined) {
    throw createModelListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode runtime base URL is required to list models.",
      failureReason: "missing_base_url",
      suggestion:
        "Start or attach an OpenCode runtime before listing models, then pass its base URL in provider context metadata.",
    });
  }

  const normalized = normalizeRuntimeBaseUrl(rawBaseUrl);
  if (normalized.failureReason !== undefined) {
    throw createModelListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode runtime base URL is invalid for model listing.",
      failureReason: normalized.failureReason,
      suggestion: "Use an http(s) OpenCode runtime URL without credentials, query, or fragment.",
    });
  }

  return normalized.baseUrl;
}

async function fetchOpenCodeProviderList(input: {
  baseUrl: string;
  workspacePath: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<OpenCodeProviderListResponse> {
  let response: Response;
  let responseBody: unknown;
  try {
    ({ response, responseBody } = await withRequestTimeout(
      async (requestSignal) => {
        const providerListResponse = await input.fetchImplementation(
          buildProviderListUrl(input.baseUrl, input.workspacePath),
          {
            headers: {
              accept: "application/json",
            },
            signal: requestSignal,
          },
        );

        if (!providerListResponse.ok) {
          await cancelResponseBody(providerListResponse);
          return {
            response: providerListResponse,
            responseBody: undefined,
          };
        }

        return {
          response: providerListResponse,
          responseBody: await providerListResponse.json(),
        };
      },
      input.requestTimeoutMs,
      input.signal,
    ));
  } catch {
    throw createModelListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider list request failed.",
      failureReason: "request_failed",
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw createModelListError({
      code: "PERMISSION_DENIED",
      message: "OpenCode provider list requires authentication.",
      failureReason: "authentication_required",
      status: response.status,
      suggestion: "Authenticate the relevant OpenCode model provider credentials and try again.",
    });
  }

  if (!response.ok) {
    throw createModelListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider list endpoint returned an unhealthy response.",
      failureReason: "unhealthy_response",
      status: response.status,
      suggestion: "Check the OpenCode runtime status before listing models.",
    });
  }

  const parsed = parseProviderListResponse(responseBody);
  if (parsed === undefined) {
    throw createModelListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider list response was not in the expected shape.",
      failureReason: "unexpected_provider_response",
      suggestion: "Upgrade or restart OpenCode, then rerun provider model listing.",
    });
  }

  return parsed;
}

function buildProviderListUrl(baseUrl: string, workspacePath: string | undefined): string {
  const url = new URL(`${baseUrl}${OPENCODE_PROVIDER_LIST_PATH}`);
  if (workspacePath !== undefined && workspacePath.trim() !== "") {
    url.searchParams.set("directory", workspacePath);
  }

  return url.href;
}

function parseProviderListResponse(value: unknown): OpenCodeProviderListResponse | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const all = value.all;
  const defaults = value.default;
  const connected = value.connected;
  if (!Array.isArray(all) || !isStringRecord(defaults) || !isStringArray(connected)) {
    return undefined;
  }

  const providers = all.map(parseProvider).filter((provider) => provider !== undefined);
  if (providers.length !== all.length) {
    return undefined;
  }

  return {
    all: providers,
    default: defaults,
    connected,
  };
}

function parseProvider(value: unknown): OpenCodeProviderListProvider | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = readNonEmptyString(value.id);
  const name = readNonEmptyString(value.name);
  const models = parseModelRecord(value.models);
  if (id === undefined || name === undefined || models === undefined) {
    return undefined;
  }
  const api = readNonEmptyString(value.api);
  const npm = readNonEmptyString(value.npm);

  return {
    id,
    name,
    ...(api !== undefined ? { api } : {}),
    ...(isStringArray(value.env) ? { env: value.env } : {}),
    ...(npm !== undefined ? { npm } : {}),
    models,
  };
}

function parseModelRecord(value: unknown): Record<string, OpenCodeProviderListModel> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const entries = Object.entries(value).map(([key, model]) => {
    if (!isPlainObject(model)) {
      return undefined;
    }
    const id = readNonEmptyString(model.id);
    const name = readNonEmptyString(model.name);
    const releaseDate = readNonEmptyString(model.release_date);
    const status = readNonEmptyString(model.status);
    const limit = parseModelLimit(model.limit);

    return [
      key,
      {
        ...(id !== undefined ? { id } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(releaseDate !== undefined ? { release_date: releaseDate } : {}),
        ...(typeof model.attachment === "boolean" ? { attachment: model.attachment } : {}),
        ...(typeof model.reasoning === "boolean" ? { reasoning: model.reasoning } : {}),
        ...(typeof model.temperature === "boolean" ? { temperature: model.temperature } : {}),
        ...(typeof model.tool_call === "boolean" ? { tool_call: model.tool_call } : {}),
        ...(model.cost !== undefined ? { cost: toJsonReadyRedactedValue(model.cost) } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(model.modalities !== undefined
          ? { modalities: toJsonReadyRedactedValue(model.modalities) }
          : {}),
        ...(typeof model.experimental === "boolean" ? { experimental: model.experimental } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(model.provider !== undefined
          ? { provider: toJsonReadyRedactedValue(model.provider) }
          : {}),
      } satisfies OpenCodeProviderListModel,
    ] as const;
  });

  if (entries.some((entry) => entry === undefined)) {
    return undefined;
  }

  return Object.fromEntries(entries as Array<readonly [string, OpenCodeProviderListModel]>);
}

function parseModelLimit(value: unknown): OpenCodeProviderListModel["limit"] | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const context = readPositiveInteger(value.context);
  const output = readPositiveInteger(value.output);

  return {
    ...(context !== undefined ? { context } : {}),
    ...(output !== undefined ? { output } : {}),
  };
}

function mapProviderModels(
  provider: OpenCodeProviderListProvider,
  response: OpenCodeProviderListResponse,
): ModelRef[] {
  const connectedProviderIds = new Set(response.connected);

  return Object.entries(provider.models).map(([modelKey, model]) => {
    const modelId = readNonEmptyString(model.id) ?? modelKey;
    const contextWindowTokens = readPositiveInteger(model.limit?.context);
    return {
      id: `${provider.id}/${modelId}`,
      providerId: OPENCODE_PROVIDER_ID,
      displayName: readNonEmptyString(model.name) ?? modelId,
      family: provider.name,
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
      metadata: {
        opencode: {
          provider: {
            id: provider.id,
            name: provider.name,
            ...(provider.api !== undefined ? { api: provider.api } : {}),
            ...(provider.npm !== undefined ? { npm: provider.npm } : {}),
            connected: connectedProviderIds.has(provider.id),
            ...(provider.env !== undefined ? { requiredEnv: provider.env } : {}),
          },
          model: {
            key: modelKey,
            id: modelId,
            ...(model.release_date !== undefined ? { releaseDate: model.release_date } : {}),
            ...(model.status !== undefined ? { status: model.status } : {}),
            ...(model.experimental !== undefined ? { experimental: model.experimental } : {}),
            isDefaultForProvider: response.default[provider.id] === modelId,
            capabilities: {
              ...(model.attachment !== undefined ? { attachment: model.attachment } : {}),
              ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
              ...(model.temperature !== undefined ? { temperature: model.temperature } : {}),
              ...(model.tool_call !== undefined ? { toolCall: model.tool_call } : {}),
            },
            ...(model.cost !== undefined ? { cost: model.cost } : {}),
            ...(model.limit !== undefined ? { limit: model.limit } : {}),
            ...(model.modalities !== undefined ? { modalities: model.modalities } : {}),
            ...(model.provider !== undefined ? { provider: model.provider } : {}),
          },
        },
      },
    };
  });
}

function createModelListError(input: {
  code: "PROVIDER_UNAVAILABLE" | "PERMISSION_DENIED";
  message: string;
  failureReason: string;
  status?: number;
  suggestion: string;
}): Error {
  return createAgentProxyError({
    code: input.code,
    message: input.message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: OPENCODE_LIST_MODELS_OPERATION,
    details: {
      failureReason: input.failureReason,
      ...(input.status !== undefined ? { status: input.status } : {}),
      suggestion: input.suggestion,
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function toJsonReadyRedactedValue(value: unknown): unknown {
  return toJsonReadyValue(redactValue(value), new WeakSet<object>());
}

function toJsonReadyValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== "object") {
    return undefined;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => toJsonReadyValue(item, seen) ?? null);
    seen.delete(value);

    return items;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, toJsonReadyValue(entryValue, seen)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  seen.delete(value);

  return Object.fromEntries(entries);
}
