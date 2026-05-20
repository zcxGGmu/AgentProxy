import { createAgentProxyError } from "../../core/errors.js";
import type { ProviderSession } from "../../sessions/types.js";
import type { ProviderContext, SessionQuery } from "../types.js";
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
const OPENCODE_SESSION_LIST_PATH = "/session";
const OPENCODE_SESSION_STATUS_PATH = "/session/status";
const OPENCODE_LIST_SESSIONS_OPERATION = "opencode.provider.listSessions";

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

function formatSessionModelId(model: OpenCodeSessionModel): string {
  return model.providerId === undefined ? model.id : `${model.providerId}/${model.id}`;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
