import { createAgentProxyError } from "../../core/errors.js";
import type { ProviderSession } from "../../sessions/types.js";
import type {
  ProviderContext,
  ResumeSessionRequest,
  SessionQuery,
  StartSessionRequest,
} from "../types.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import {
  cancelResponseBody,
  type OpenCodeProviderOptions,
  normalizeRuntimeBaseUrl,
  resolveRuntimeBaseUrl,
  validateRequestTimeout,
  withRequestTimeout,
} from "./probe.js";

const DEFAULT_SESSION_LIST_REQUEST_TIMEOUT_MS = 1_000;
const DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS = 1_000;
const OPENCODE_SESSION_LIST_PATH = "/session";
const OPENCODE_SESSION_STATUS_PATH = "/session/status";
const OPENCODE_LIST_SESSIONS_OPERATION = "opencode.provider.listSessions";
const OPENCODE_GET_SESSION_OPERATION = "opencode.provider.getSession";
const OPENCODE_START_SESSION_OPERATION = "opencode.provider.startSession";
const OPENCODE_RESUME_SESSION_OPERATION = "opencode.provider.resumeSession";

interface OpenCodeSessionListItem {
  id: string;
  title?: string;
  directory?: string;
  projectId?: string;
  parentId?: string;
  version?: string;
  model?: OpenCodeSessionModel;
  shared?: boolean;
  createdAt?: string;
  updatedAt?: string;
  compactingAt?: string;
}

interface OpenCodeSessionModel {
  id: string;
  providerId?: string;
}

interface OpenCodeSessionStatusItem {
  type?: string;
}

interface OpenCodeSessionPromptModel {
  providerID: string;
  modelID: string;
}

export async function listOpenCodeSessions(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
  query: SessionQuery = { metadata: {} },
): Promise<ProviderSession[]> {
  const requestTimeoutMs = validateRequestTimeout(
    options.requestTimeoutMs ?? DEFAULT_SESSION_LIST_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveSessionListBaseUrl(options, context);
  const workspacePath = query.workspacePath ?? context.workspacePath;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sessions = await fetchOpenCodeSessionList({
    baseUrl,
    workspacePath,
    requestTimeoutMs,
    fetchImplementation,
    signal: context.signal,
  });
  const statuses = await fetchOpenCodeSessionStatuses({
    baseUrl,
    requestTimeoutMs,
    fetchImplementation,
    signal: context.signal,
  });

  return sessions
    .filter(
      (session) =>
        workspacePath === undefined ||
        session.directory === undefined ||
        session.directory === workspacePath,
    )
    .map((session) => mapOpenCodeSession(session, statuses.get(session.id)))
    .sort(compareProviderSessions);
}

export async function getOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
  providerSessionId: string,
): Promise<ProviderSession> {
  return fetchAndMapOpenCodeSession({
    options,
    context,
    providerSessionId,
    operation: OPENCODE_GET_SESSION_OPERATION,
  });
}

export async function startOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: StartSessionRequest,
): Promise<ProviderSession> {
  if (context.prompt !== undefined && context.prompt.trim() !== "") {
    parsePromptModel(context.model, OPENCODE_START_SESSION_OPERATION);
  }
  const requestTimeoutMs = validateRequestTimeout(
    options.requestTimeoutMs ?? DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveSessionMutationBaseUrl(options, context, OPENCODE_START_SESSION_OPERATION);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const session = await fetchOpenCodeSessionMutation({
    baseUrl,
    path: OPENCODE_SESSION_LIST_PATH,
    method: "POST",
    body: createSessionRequestBody(context),
    workspacePath: context.workspacePath,
    requestTimeoutMs,
    fetchImplementation,
    signal: context.signal,
    operation: OPENCODE_START_SESSION_OPERATION,
  });
  const providerSession = mapOpenCodeSession(session, undefined);

  return context.prompt === undefined || context.prompt.trim() === ""
    ? providerSession
    : trySendOpenCodePromptAsync({
        baseUrl,
        providerSession,
        prompt: context.prompt,
        model: context.model,
        workspacePath: context.workspacePath,
        requestTimeoutMs,
        fetchImplementation,
        signal: context.signal,
        operation: OPENCODE_START_SESSION_OPERATION,
      });
}

export async function resumeOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: ResumeSessionRequest,
): Promise<ProviderSession> {
  const providerSession = await fetchAndMapOpenCodeSession({
    options,
    context,
    providerSessionId: context.providerSessionId,
    operation: OPENCODE_RESUME_SESSION_OPERATION,
  });

  return context.prompt === undefined || context.prompt.trim() === ""
    ? providerSession
    : sendOpenCodePromptAsync({
        baseUrl: resolveSessionMutationBaseUrl(options, context, OPENCODE_RESUME_SESSION_OPERATION),
        providerSession,
        prompt: context.prompt,
        model: context.model,
        workspacePath: context.workspacePath ?? providerSession.workspacePath,
        requestTimeoutMs: validateRequestTimeout(
          options.requestTimeoutMs ?? DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS,
        ),
        fetchImplementation: options.fetchImplementation ?? fetch,
        signal: context.signal,
        operation: OPENCODE_RESUME_SESSION_OPERATION,
      });
}

async function trySendOpenCodePromptAsync(
  input: Parameters<typeof sendOpenCodePromptAsync>[0],
): Promise<ProviderSession> {
  try {
    return await sendOpenCodePromptAsync(input);
  } catch (error) {
    return markPromptRejected(input.providerSession, {
      model: input.model,
      failureReason: readPromptFailureReason(error),
      status: readPromptFailureStatus(error),
    });
  }
}

async function fetchAndMapOpenCodeSession(input: {
  options: OpenCodeProviderOptions;
  context: ProviderContext;
  providerSessionId: string;
  operation: string;
}): Promise<ProviderSession> {
  const requestTimeoutMs = validateRequestTimeout(
    input.options.requestTimeoutMs ?? DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveSessionMutationBaseUrl(input.options, input.context, input.operation);
  const fetchImplementation = input.options.fetchImplementation ?? fetch;
  const session = await fetchOpenCodeSessionMutation({
    baseUrl,
    path: `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(input.providerSessionId)}`,
    method: "GET",
    workspacePath: input.context.workspacePath,
    requestTimeoutMs,
    fetchImplementation,
    signal: input.context.signal,
    operation: input.operation,
    providerSessionId: input.providerSessionId,
  });
  if (session.id !== input.providerSessionId) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: input.operation,
      message: "OpenCode returned a different session id than requested.",
      failureReason: "session_id_mismatch",
      providerSessionId: input.providerSessionId,
      suggestion: "Restart or upgrade OpenCode, then retry the session operation.",
    });
  }
  const statuses = await fetchOpenCodeSessionStatuses({
    baseUrl,
    requestTimeoutMs,
    fetchImplementation,
    signal: input.context.signal,
  });

  return mapOpenCodeSession(session, statuses.get(session.id));
}

function resolveSessionListBaseUrl(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
): string {
  const rawBaseUrl = resolveRuntimeBaseUrl(options, context);
  if (rawBaseUrl === undefined) {
    throw createSessionListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode runtime base URL is required to list sessions.",
      failureReason: "missing_base_url",
      suggestion:
        "Start or attach an OpenCode runtime before listing sessions, then pass its base URL in provider context metadata.",
    });
  }

  const normalized = normalizeRuntimeBaseUrl(rawBaseUrl);
  if (normalized.failureReason !== undefined) {
    throw createSessionListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode runtime base URL is invalid for session listing.",
      failureReason: normalized.failureReason,
      suggestion: "Use an http(s) OpenCode runtime URL without credentials, query, or fragment.",
    });
  }

  return normalized.baseUrl;
}

function resolveSessionMutationBaseUrl(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
  operation: string,
): string {
  const rawBaseUrl = resolveRuntimeBaseUrl(options, context);
  if (rawBaseUrl === undefined) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation,
      message: "OpenCode runtime base URL is required for session operations.",
      failureReason: "missing_base_url",
      suggestion:
        "Start or attach an OpenCode runtime before creating or resuming sessions, then pass its base URL in provider context metadata.",
    });
  }

  const normalized = normalizeRuntimeBaseUrl(rawBaseUrl);
  if (normalized.failureReason !== undefined) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation,
      message: "OpenCode runtime base URL is invalid for session operations.",
      failureReason: normalized.failureReason,
      suggestion: "Use an http(s) OpenCode runtime URL without credentials, query, or fragment.",
    });
  }

  return normalized.baseUrl;
}

async function fetchOpenCodeSessionList(input: {
  baseUrl: string;
  workspacePath: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<OpenCodeSessionListItem[]> {
  const { response, responseBody } = await fetchJson({
    url: buildSessionListUrl(input.baseUrl, input.workspacePath),
    requestTimeoutMs: input.requestTimeoutMs,
    fetchImplementation: input.fetchImplementation,
    signal: input.signal,
  });

  if (response.status === 401 || response.status === 403) {
    throw createSessionListError({
      code: "PERMISSION_DENIED",
      message: "OpenCode session list requires authentication.",
      failureReason: "authentication_required",
      status: response.status,
      suggestion: "Authenticate OpenCode and try listing sessions again.",
    });
  }

  if (!response.ok) {
    throw createSessionListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode session list endpoint returned an unhealthy response.",
      failureReason: "unhealthy_response",
      status: response.status,
      suggestion: "Check the OpenCode runtime status before listing sessions.",
    });
  }

  const parsed = parseSessionListResponse(responseBody);
  if (parsed === undefined) {
    throw createSessionListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode session list response was not in the expected shape.",
      failureReason: "unexpected_session_response",
      suggestion: "Upgrade or restart OpenCode, then rerun session synchronization.",
    });
  }

  return parsed;
}

async function fetchOpenCodeSessionMutation(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown> | undefined;
  workspacePath: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
  operation: string;
  providerSessionId?: string | undefined;
}): Promise<OpenCodeSessionListItem> {
  const { response, responseBody } = await fetchSessionJson({
    url: buildSessionOperationUrl(input.baseUrl, input.path, input.workspacePath),
    method: input.method,
    body: input.body,
    requestTimeoutMs: input.requestTimeoutMs,
    fetchImplementation: input.fetchImplementation,
    signal: input.signal,
    operation: input.operation,
    providerSessionId: input.providerSessionId,
  });

  if (!response.ok) {
    throw createSessionResponseError({
      operation: input.operation,
      status: response.status,
      providerSessionId: input.providerSessionId,
    });
  }

  const parsed = parseSessionListItem(responseBody);
  if (parsed === undefined) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: input.operation,
      message: "OpenCode session response was not in the expected shape.",
      failureReason: "unexpected_session_response",
      providerSessionId: input.providerSessionId,
      suggestion: "Upgrade or restart OpenCode, then retry the session operation.",
    });
  }

  return parsed;
}

async function sendOpenCodePromptAsync(input: {
  baseUrl: string;
  providerSession: ProviderSession;
  prompt: string;
  model?: string | undefined;
  workspacePath: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
  operation: string;
}): Promise<ProviderSession> {
  const promptModel = parsePromptModel(input.model, input.operation);
  const { response } = await fetchSessionJson({
    url: buildSessionOperationUrl(
      input.baseUrl,
      `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(input.providerSession.providerSessionId)}/prompt_async`,
      input.workspacePath,
    ),
    method: "POST",
    body: {
      ...(promptModel !== undefined ? { model: promptModel } : {}),
      parts: [
        {
          type: "text",
          text: input.prompt,
        },
      ],
    },
    requestTimeoutMs: input.requestTimeoutMs,
    fetchImplementation: input.fetchImplementation,
    signal: input.signal,
    operation: input.operation,
    providerSessionId: input.providerSession.providerSessionId,
  });

  if (!response.ok) {
    throw createSessionResponseError({
      operation: input.operation,
      status: response.status,
      providerSessionId: input.providerSession.providerSessionId,
      failureReason: "prompt_async_failed",
    });
  }

  return markPromptAccepted(input.providerSession, input.model);
}

async function fetchSessionJson(input: {
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown> | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
  operation: string;
  providerSessionId?: string | undefined;
}): Promise<{ response: Response; responseBody: unknown }> {
  try {
    return await withRequestTimeout(
      async (requestSignal) => {
        const response = await input.fetchImplementation(input.url, {
          method: input.method,
          headers: {
            accept: "application/json",
            ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
          signal: requestSignal,
        });

        if (!response.ok || response.status === 204) {
          await cancelResponseBody(response);
          return {
            response,
            responseBody: undefined,
          };
        }

        return {
          response,
          responseBody: await response.json(),
        };
      },
      input.requestTimeoutMs,
      input.signal,
    );
  } catch {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: input.operation,
      message: "OpenCode session operation request failed.",
      failureReason: "request_failed",
      providerSessionId: input.providerSessionId,
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    });
  }
}

async function fetchOpenCodeSessionStatuses(input: {
  baseUrl: string;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<Map<string, OpenCodeSessionStatusItem>> {
  try {
    const { response, responseBody } = await fetchJson({
      url: `${input.baseUrl}${OPENCODE_SESSION_STATUS_PATH}`,
      requestTimeoutMs: input.requestTimeoutMs,
      fetchImplementation: input.fetchImplementation,
      signal: input.signal,
    });

    if (!response.ok) {
      return new Map();
    }

    return parseSessionStatusResponse(responseBody) ?? new Map();
  } catch {
    return new Map();
  }
}

async function fetchJson(input: {
  url: string;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<{ response: Response; responseBody: unknown }> {
  try {
    return await withRequestTimeout(
      async (requestSignal) => {
        const response = await input.fetchImplementation(input.url, {
          headers: {
            accept: "application/json",
          },
          signal: requestSignal,
        });

        if (!response.ok) {
          await cancelResponseBody(response);
          return {
            response,
            responseBody: undefined,
          };
        }

        return {
          response,
          responseBody: await response.json(),
        };
      },
      input.requestTimeoutMs,
      input.signal,
    );
  } catch {
    throw createSessionListError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode session list request failed.",
      failureReason: "request_failed",
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    });
  }
}

function buildSessionListUrl(baseUrl: string, workspacePath: string | undefined): string {
  const url = new URL(`${baseUrl}${OPENCODE_SESSION_LIST_PATH}`);
  if (workspacePath !== undefined && workspacePath.trim() !== "") {
    url.searchParams.set("directory", workspacePath);
  }

  return url.href;
}

function buildSessionOperationUrl(
  baseUrl: string,
  path: string,
  workspacePath: string | undefined,
): string {
  const url = new URL(`${baseUrl}${path}`);
  if (workspacePath !== undefined && workspacePath.trim() !== "") {
    url.searchParams.set("directory", workspacePath);
  }

  return url.href;
}

function createSessionRequestBody(context: StartSessionRequest): Record<string, unknown> {
  const parentProviderSessionId = readNonEmptyString(context.metadata.parentProviderSessionId);
  const title = readNonEmptyString(context.metadata.title);

  return {
    ...(parentProviderSessionId !== undefined ? { parentID: parentProviderSessionId } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

function parseSessionListResponse(value: unknown): OpenCodeSessionListItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sessions = value.map(parseSessionListItem);
  if (sessions.some((session) => session === undefined)) {
    return undefined;
  }

  return sessions as OpenCodeSessionListItem[];
}

function parseSessionListItem(value: unknown): OpenCodeSessionListItem | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = readNonEmptyString(value.id) ?? readNonEmptyString(value.sessionID);
  if (id === undefined) {
    return undefined;
  }

  const title = readNonEmptyString(value.title);
  const directory = readNonEmptyString(value.directory);
  const projectId = readNonEmptyString(value.projectID) ?? readNonEmptyString(value.projectId);
  const parentId = readNonEmptyString(value.parentID) ?? readNonEmptyString(value.parentId);
  const version = readNonEmptyString(value.version);
  const model = parseSessionModel(value.model);
  const time = isPlainObject(value.time) ? value.time : {};
  const createdAt = parseTimestamp(time.created ?? value.createdAt);
  const updatedAt = parseTimestamp(time.updated ?? value.updatedAt);
  const compactingAt = parseTimestamp(time.compacting);
  const shared = isPlainObject(value.share);

  return {
    id,
    ...(title !== undefined ? { title } : {}),
    ...(directory !== undefined ? { directory } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(shared ? { shared } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(compactingAt !== undefined ? { compactingAt } : {}),
  };
}

function parseSessionModel(value: unknown): OpenCodeSessionModel | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return {
      id: value,
    };
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = readNonEmptyString(value.id) ?? readNonEmptyString(value.modelID);
  if (id === undefined) {
    return undefined;
  }

  const providerId =
    readNonEmptyString(value.providerID) ??
    readNonEmptyString(value.providerId) ??
    readNonEmptyString(value.provider);

  return {
    id,
    ...(providerId !== undefined ? { providerId } : {}),
  };
}

function parseSessionStatusResponse(
  value: unknown,
): Map<string, OpenCodeSessionStatusItem> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const statuses = new Map<string, OpenCodeSessionStatusItem>();
  for (const [sessionId, status] of Object.entries(value)) {
    if (!isPlainObject(status)) {
      continue;
    }
    const type = readNonEmptyString(status.type);
    statuses.set(sessionId, {
      ...(type !== undefined ? { type } : {}),
    });
  }

  return statuses;
}

function mapOpenCodeSession(
  session: OpenCodeSessionListItem,
  status: OpenCodeSessionStatusItem | undefined,
): ProviderSession {
  return {
    providerId: OPENCODE_PROVIDER_ID,
    providerSessionId: session.id,
    ...(session.directory !== undefined ? { workspacePath: session.directory } : {}),
    ...(session.title !== undefined ? { title: session.title } : {}),
    status: mapOpenCodeSessionStatus(status?.type),
    ...(session.createdAt !== undefined ? { createdAt: session.createdAt } : {}),
    ...(session.updatedAt !== undefined ? { updatedAt: session.updatedAt } : {}),
    ...(session.updatedAt !== undefined ? { lastRunAt: session.updatedAt } : {}),
    ...(session.model !== undefined ? { model: formatSessionModelId(session.model) } : {}),
    ...(session.parentId !== undefined ? { parentProviderSessionId: session.parentId } : {}),
    metadata: {
      opencode: {
        session: {
          ...(session.projectId !== undefined ? { projectId: session.projectId } : {}),
          ...(session.directory !== undefined ? { directory: session.directory } : {}),
          ...(session.version !== undefined ? { version: session.version } : {}),
          ...(session.model !== undefined ? { model: session.model } : {}),
          ...(session.shared !== undefined ? { shared: session.shared } : {}),
          ...(session.compactingAt !== undefined ? { compactingAt: session.compactingAt } : {}),
        },
        ...(status?.type !== undefined
          ? {
              status: {
                type: status.type,
              },
            }
          : {}),
      },
    },
  };
}

function markPromptAccepted(session: ProviderSession, model: string | undefined): ProviderSession {
  return withPromptMetadata(
    session,
    {
      accepted: true,
      ...(model !== undefined ? { requestedModel: model } : {}),
    },
    "running",
  );
}

function markPromptRejected(
  session: ProviderSession,
  input: {
    model?: string | undefined;
    failureReason: string;
    status?: number | undefined;
  },
): ProviderSession {
  return withPromptMetadata(session, {
    accepted: false,
    failureReason: input.failureReason,
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.model !== undefined ? { requestedModel: input.model } : {}),
  });
}

function withPromptMetadata(
  session: ProviderSession,
  promptAsync: Record<string, unknown>,
  status?: ProviderSession["status"],
): ProviderSession {
  const opencodeMetadata = isPlainObject(session.metadata.opencode)
    ? session.metadata.opencode
    : {};

  return {
    ...session,
    ...(status !== undefined ? { status } : {}),
    metadata: {
      ...session.metadata,
      opencode: {
        ...opencodeMetadata,
        promptAsync,
      },
    },
  };
}

function formatSessionModelId(model: OpenCodeSessionModel): string {
  return model.providerId === undefined ? model.id : `${model.providerId}/${model.id}`;
}

function parsePromptModel(
  value: string | undefined,
  operation: string,
): OpenCodeSessionPromptModel | undefined {
  if (value === undefined) {
    return undefined;
  }

  const separatorIndex = value.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw createSessionOperationError({
      code: "CONFIG_INVALID",
      operation,
      message: "OpenCode prompt model must use the provider/model format.",
      failureReason: "invalid_model",
      suggestion:
        "Pass a model id returned by OpenCodeProvider.listModels(), such as provider/model.",
    });
  }

  return {
    providerID: value.slice(0, separatorIndex),
    modelID: value.slice(separatorIndex + 1),
  };
}

function mapOpenCodeSessionStatus(value: string | undefined): ProviderSession["status"] {
  switch (value) {
    case "idle":
      return "idle";
    case "busy":
    case "running":
      return "running";
    case "retry":
    case "queued":
    case "waiting":
      return "waiting";
    case "failed":
    case "error":
      return "failed";
    case "completed":
    case "done":
      return "completed";
    default:
      return "unknown";
  }
}

function compareProviderSessions(left: ProviderSession, right: ProviderSession): number {
  const rightUpdated = Date.parse(right.updatedAt ?? right.lastRunAt ?? right.createdAt ?? "");
  const leftUpdated = Date.parse(left.updatedAt ?? left.lastRunAt ?? left.createdAt ?? "");
  const byUpdated = safeTime(rightUpdated) - safeTime(leftUpdated);
  if (byUpdated !== 0) {
    return byUpdated;
  }

  return left.providerSessionId.localeCompare(right.providerSessionId);
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function parseTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function createSessionListError(input: {
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
    operation: OPENCODE_LIST_SESSIONS_OPERATION,
    details: {
      failureReason: input.failureReason,
      ...(input.status !== undefined ? { status: input.status } : {}),
      suggestion: input.suggestion,
    },
  });
}

function createSessionResponseError(input: {
  operation: string;
  status: number;
  providerSessionId?: string | undefined;
  failureReason?: string | undefined;
}): Error {
  switch (input.status) {
    case 400:
      return createSessionOperationError({
        code: "CONFIG_INVALID",
        operation: input.operation,
        message: "OpenCode rejected the session operation request.",
        failureReason: input.failureReason ?? "bad_request",
        status: input.status,
        providerSessionId: input.providerSessionId,
        suggestion: "Check the session id, workspace path, prompt, and model selection.",
      });
    case 401:
    case 403:
      return createSessionOperationError({
        code: "PERMISSION_DENIED",
        operation: input.operation,
        message: "OpenCode session operation requires authentication.",
        failureReason: input.failureReason ?? "authentication_required",
        status: input.status,
        providerSessionId: input.providerSessionId,
        suggestion: "Authenticate OpenCode and retry the session operation.",
      });
    case 404:
      return createSessionOperationError({
        code: "SESSION_NOT_FOUND",
        operation: input.operation,
        message: "OpenCode session was not found.",
        failureReason: input.failureReason ?? "session_not_found",
        status: input.status,
        providerSessionId: input.providerSessionId,
        suggestion: "Sync sessions and retry with an existing provider session id.",
      });
    default:
      return createSessionOperationError({
        code: "PROVIDER_UNAVAILABLE",
        operation: input.operation,
        message: "OpenCode session endpoint returned an unhealthy response.",
        failureReason: input.failureReason ?? "unhealthy_response",
        status: input.status,
        providerSessionId: input.providerSessionId,
        suggestion: "Check the OpenCode runtime status before retrying the session operation.",
      });
  }
}

function readPromptFailureReason(error: unknown): string {
  if (isPlainObject(error) && isPlainObject(error.details)) {
    const failureReason = error.details.failureReason;
    if (typeof failureReason === "string" && failureReason.trim() !== "") {
      return failureReason;
    }
  }

  return "prompt_async_failed";
}

function readPromptFailureStatus(error: unknown): number | undefined {
  if (isPlainObject(error) && isPlainObject(error.details)) {
    const status = error.details.status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }
  }

  return undefined;
}

function createSessionOperationError(input: {
  code: "CONFIG_INVALID" | "PROVIDER_UNAVAILABLE" | "PERMISSION_DENIED" | "SESSION_NOT_FOUND";
  operation: string;
  message: string;
  failureReason: string;
  status?: number | undefined;
  providerSessionId?: string | undefined;
  suggestion: string;
}): Error {
  return createAgentProxyError({
    code: input.code,
    message: input.message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: input.operation,
    details: {
      failureReason: input.failureReason,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.providerSessionId !== undefined
        ? { providerSessionId: input.providerSessionId }
        : {}),
      suggestion: input.suggestion,
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
