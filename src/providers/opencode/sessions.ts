import { execFile } from "node:child_process";
import { createAgentProxyError, isAgentProxyError } from "../../core/errors.js";
import type { AgentEvent } from "../../core/events.js";
import {
  OPENCODE_EVENT_STREAM_PATH,
  streamOpenCodeEventEnvelopesFromResponse,
} from "../../runtimes/events.js";
import type { ProviderSession } from "../../sessions/types.js";
import type {
  ExportResult,
  ExportSessionRequest,
  ImportSessionRequest,
  ProviderContext,
  ResumeSessionRequest,
  SendMessageRequest,
  SessionActionRequest,
  SessionQuery,
  ShareResult,
  StartSessionRequest,
} from "../types.js";
import { probeOpenCodeBinary } from "./binary.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import { createOpenCodePassthroughEnv } from "./passthrough.js";
import {
  cancelResponseBody,
  type OpenCodeProviderOptions,
  normalizeRuntimeBaseUrl,
  resolveRuntimeBaseUrl,
  validateRequestTimeout,
  withRequestTimeout,
} from "./probe.js";

const DEFAULT_SESSION_LIST_REQUEST_TIMEOUT_MS = 1_000;
const DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_EVENT_STREAM_PREFLIGHT_MS = 100;
const OPENCODE_SESSION_LIST_PATH = "/session";
const OPENCODE_SESSION_STATUS_PATH = "/session/status";
const OPENCODE_LIST_SESSIONS_OPERATION = "opencode.provider.listSessions";
const OPENCODE_GET_SESSION_OPERATION = "opencode.provider.getSession";
const OPENCODE_START_SESSION_OPERATION = "opencode.provider.startSession";
const OPENCODE_RESUME_SESSION_OPERATION = "opencode.provider.resumeSession";
const OPENCODE_SEND_MESSAGE_OPERATION = "opencode.provider.sendMessage";
const OPENCODE_ABORT_SESSION_OPERATION = "opencode.provider.abortSession";
const OPENCODE_DELETE_SESSION_OPERATION = "opencode.provider.deleteSession";
const OPENCODE_EXPORT_SESSION_OPERATION = "opencode.provider.exportSession";
const OPENCODE_IMPORT_SESSION_OPERATION = "opencode.provider.importSession";
const OPENCODE_SHARE_SESSION_OPERATION = "opencode.provider.shareSession";
const OPENCODE_UNSHARE_SESSION_OPERATION = "opencode.provider.unshareSession";
const DEFAULT_SESSION_CLI_REQUEST_TIMEOUT_MS = 30_000;
const OPENCODE_CLI_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

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

type EventStreamResponse = Response & {
  body: ReadableStream<Uint8Array>;
};

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

export function sendOpenCodeMessage(
  options: OpenCodeProviderOptions,
  context: SendMessageRequest,
): AsyncIterable<AgentEvent> {
  return sendOpenCodeMessageEvents(options, context);
}

export async function abortOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: SessionActionRequest,
): Promise<void> {
  await runOpenCodeSessionVoidAction({
    options,
    context,
    operation: OPENCODE_ABORT_SESSION_OPERATION,
    method: "POST",
    path: `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(context.providerSessionId)}/abort`,
  });
}

export async function deleteOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: SessionActionRequest,
): Promise<void> {
  await runOpenCodeSessionVoidAction({
    options,
    context,
    operation: OPENCODE_DELETE_SESSION_OPERATION,
    method: "DELETE",
    path: `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(context.providerSessionId)}`,
  });
}

export async function shareOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: SessionActionRequest,
): Promise<ShareResult> {
  const responseBody = await runOpenCodeSessionJsonAction({
    options,
    context,
    operation: OPENCODE_SHARE_SESSION_OPERATION,
    method: "POST",
    path: `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(context.providerSessionId)}/share`,
  });
  const url = readShareUrl(responseBody);
  if (url === undefined) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: OPENCODE_SHARE_SESSION_OPERATION,
      message: "OpenCode share response did not include a share URL.",
      failureReason: "unexpected_share_response",
      providerSessionId: context.providerSessionId,
      suggestion: "Upgrade or restart OpenCode, then retry sharing the session.",
    });
  }

  return {
    providerId: OPENCODE_PROVIDER_ID,
    providerSessionId: context.providerSessionId,
    url,
    metadata: {
      opencode: {
        share: {
          shared: true,
        },
      },
    },
  };
}

export async function unshareOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: SessionActionRequest,
): Promise<void> {
  await runOpenCodeSessionVoidAction({
    options,
    context,
    operation: OPENCODE_UNSHARE_SESSION_OPERATION,
    method: "DELETE",
    path: `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(context.providerSessionId)}/share`,
  });
}

export async function exportOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: ExportSessionRequest,
): Promise<ExportResult> {
  const raw = context.raw === true || context.sanitize === false;
  if (context.raw === true && context.sanitize === true) {
    throw createSessionOperationError({
      code: "CONFIG_INVALID",
      operation: OPENCODE_EXPORT_SESSION_OPERATION,
      message: "OpenCode export cannot be both raw and sanitized.",
      failureReason: "conflicting_export_flags",
      providerSessionId: context.providerSessionId,
      suggestion: "Choose either sanitized export or raw export, not both.",
    });
  }
  if (raw && context.rawConfirmed !== true) {
    throw createSessionOperationError({
      code: "CONFIG_INVALID",
      operation: OPENCODE_EXPORT_SESSION_OPERATION,
      message: "Raw OpenCode session export requires explicit confirmation.",
      failureReason: "raw_export_requires_confirmation",
      providerSessionId: context.providerSessionId,
      suggestion:
        "Confirm raw export only when you accept that transcript data may contain secrets.",
    });
  }

  const result = await runOpenCodeCli({
    options,
    context,
    operation: OPENCODE_EXPORT_SESSION_OPERATION,
    args: ["export", context.providerSessionId, ...(raw ? [] : ["--sanitize"])],
    providerSessionId: context.providerSessionId,
  });

  if (result.stdout.trim() === "") {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: OPENCODE_EXPORT_SESSION_OPERATION,
      message: "OpenCode export output was empty.",
      failureReason: "empty_export_response",
      providerSessionId: context.providerSessionId,
      suggestion: "Retry export or use provider passthrough to inspect native OpenCode output.",
    });
  }
  const data = parseCliJsonOrText(result.stdout);

  return {
    providerId: OPENCODE_PROVIDER_ID,
    providerSessionId: context.providerSessionId,
    sanitized: !raw,
    data,
    metadata: {
      opencode: {
        export: {
          sanitized: !raw,
          source: "cli",
        },
      },
    },
  };
}

export async function importOpenCodeSession(
  options: OpenCodeProviderOptions,
  context: ImportSessionRequest,
): Promise<ProviderSession> {
  const result = await runOpenCodeCli({
    options,
    context,
    operation: OPENCODE_IMPORT_SESSION_OPERATION,
    args: ["import", context.source],
  });
  const parsed = parseCliJson(result.stdout);
  const importedSession =
    parseSessionListItem(parsed) ??
    (isPlainObject(parsed) ? parseSessionListItem(parsed.session) : undefined) ??
    (isPlainObject(parsed) ? parseSessionListItem(parsed.data) : undefined);
  if (importedSession !== undefined) {
    return withImportMetadata(mapOpenCodeSession(importedSession, undefined));
  }

  const importedSessionId =
    readImportedSessionId(parsed) ?? readImportedSessionIdFromText(result.stdout);
  if (importedSessionId === undefined) {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: OPENCODE_IMPORT_SESSION_OPERATION,
      message: "OpenCode import output did not include an imported session id.",
      failureReason: "unexpected_import_response",
      suggestion: "Retry with a newer OpenCode version or import through provider passthrough.",
    });
  }

  const runtimeBaseUrl = resolveRuntimeBaseUrl(options, context);
  if (runtimeBaseUrl !== undefined) {
    const fetched = await getOpenCodeSession(options, context, importedSessionId);
    return withImportMetadata(fetched);
  }

  return withImportMetadata({
    providerId: OPENCODE_PROVIDER_ID,
    providerSessionId: importedSessionId,
    ...(context.workspacePath !== undefined ? { workspacePath: context.workspacePath } : {}),
    status: "unknown",
    metadata: {},
  });
}

async function* sendOpenCodeMessageEvents(
  options: OpenCodeProviderOptions,
  context: SendMessageRequest,
): AsyncGenerator<AgentEvent> {
  if (context.prompt.trim() === "") {
    throw createSessionOperationError({
      code: "CONFIG_INVALID",
      operation: OPENCODE_SEND_MESSAGE_OPERATION,
      message: "OpenCode message prompt must not be empty.",
      failureReason: "empty_prompt",
      providerSessionId: context.providerSessionId,
      suggestion: "Pass a non-empty prompt before sending a message.",
    });
  }

  if (context.attachments !== undefined && context.attachments.length > 0) {
    throw createAgentProxyError({
      code: "CAPABILITY_UNSUPPORTED",
      message: "OpenCode message attachments are not supported by AgentProxy yet.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: OPENCODE_SEND_MESSAGE_OPERATION,
      details: {
        providerSessionId: context.providerSessionId,
        suggestion: "Send a text-only prompt or use provider passthrough once it is available.",
      },
    });
  }

  const requestTimeoutMs = validateRequestTimeout(
    options.requestTimeoutMs ?? DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveSessionMutationBaseUrl(options, context, OPENCODE_SEND_MESSAGE_OPERATION);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const eventStreamController = new AbortController();
  const messageController = new AbortController();
  const eventResponsePromise = connectOpenCodeMessageEventStream({
    baseUrl,
    workspacePath: context.workspacePath,
    requestTimeoutMs,
    fetchImplementation,
    signal:
      context.signal === undefined
        ? eventStreamController.signal
        : AbortSignal.any([context.signal, eventStreamController.signal]),
  });
  let eventResponse: EventStreamResponse | undefined;
  const messageSignal =
    context.signal === undefined
      ? messageController.signal
      : AbortSignal.any([context.signal, messageController.signal]);

  try {
    const preflight = await waitForEventStreamPreflight(eventResponsePromise);
    if (preflight.status === "rejected") {
      throw preflight.error;
    }
    if (preflight.status === "fulfilled") {
      eventResponse = preflight.response;
    }

    const postPromise = postOpenCodeMessage({
      baseUrl,
      context: {
        ...context,
        signal: messageSignal,
      },
      requestTimeoutMs,
      fetchImplementation,
    });

    if (eventResponse === undefined) {
      const postOrEvent = await waitForPostOrEventStream({
        postPromise,
        eventResponsePromise,
      });
      if (postOrEvent.status === "event_rejected") {
        messageController.abort();
        await postPromise.catch(() => undefined);
        throw postOrEvent.error;
      }
      if (postOrEvent.status === "event_fulfilled") {
        eventResponse = postOrEvent.response;
        await postPromise;
      } else if (postOrEvent.status === "post_rejected") {
        throw postOrEvent.error;
      } else {
        eventResponse = await eventResponsePromise;
      }
    } else {
      await postPromise;
    }

    yield {
      type: "session.status_changed",
      from: "unknown",
      to: "running",
      metadata: {
        opencode: {
          message: {
            accepted: true,
          },
        },
      },
    };

    const agentproxySessionId = context.agentproxySessionId ?? context.sessionId;
    for await (const envelope of streamOpenCodeEventEnvelopesFromResponse(eventResponse.body, {
      ...(context.runtimeId !== undefined ? { runtimeId: context.runtimeId } : {}),
      eventPath: OPENCODE_EVENT_STREAM_PATH,
      providerSessionId: context.providerSessionId,
      ...(agentproxySessionId !== undefined ? { agentproxySessionId } : {}),
      metadata: context.metadata,
      ...(context.signal !== undefined ? { signal: context.signal } : {}),
    })) {
      if (
        envelope.providerSessionId !== undefined &&
        envelope.providerSessionId !== context.providerSessionId
      ) {
        continue;
      }
      if (readExplicitProviderSessionId(envelope.metadata) !== context.providerSessionId) {
        continue;
      }

      yield envelope.payload;

      if (isTerminalMessageEvent(envelope.payload)) {
        return;
      }

      if (envelope.payload.type === "session.status_changed" && envelope.payload.to === "idle") {
        yield {
          type: "session.completed",
          status: "completed",
          metadata: envelope.payload.metadata,
        };
        return;
      }

      if (envelope.payload.type === "error") {
        yield {
          type: "session.completed",
          status: "failed",
          metadata: envelope.payload.metadata,
        };
        return;
      }
    }

    yield {
      type: "session.completed",
      status: "completed",
      metadata: {
        opencode: {
          message: {
            completedBy: "event_stream_closed",
          },
        },
      },
    };
  } finally {
    messageController.abort();
    eventStreamController.abort();
    if (eventResponse !== undefined) {
      await cancelResponseBody(eventResponse);
    } else {
      await eventResponsePromise.then(cancelResponseBody, () => undefined);
    }
  }
}

type EventStreamPreflightResult =
  | {
      status: "fulfilled";
      response: EventStreamResponse;
    }
  | {
      status: "rejected";
      error: unknown;
    }
  | {
      status: "pending";
    };

async function waitForEventStreamPreflight(
  eventResponsePromise: Promise<EventStreamResponse>,
): Promise<EventStreamPreflightResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      eventResponsePromise.then(
        (response): EventStreamPreflightResult => ({
          status: "fulfilled",
          response,
        }),
        (error): EventStreamPreflightResult => ({
          status: "rejected",
          error,
        }),
      ),
      new Promise<EventStreamPreflightResult>((resolve) => {
        timeout = setTimeout(
          () =>
            resolve({
              status: "pending",
            }),
          DEFAULT_EVENT_STREAM_PREFLIGHT_MS,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

type PostOrEventStreamResult =
  | {
      status: "post_fulfilled";
    }
  | {
      status: "post_rejected";
      error: unknown;
    }
  | {
      status: "event_fulfilled";
      response: EventStreamResponse;
    }
  | {
      status: "event_rejected";
      error: unknown;
    };

async function waitForPostOrEventStream(input: {
  postPromise: Promise<void>;
  eventResponsePromise: Promise<EventStreamResponse>;
}): Promise<PostOrEventStreamResult> {
  return Promise.race([
    input.postPromise.then(
      (): PostOrEventStreamResult => ({
        status: "post_fulfilled",
      }),
      (error): PostOrEventStreamResult => ({
        status: "post_rejected",
        error,
      }),
    ),
    input.eventResponsePromise.then(
      (response): PostOrEventStreamResult => ({
        status: "event_fulfilled",
        response,
      }),
      (error): PostOrEventStreamResult => ({
        status: "event_rejected",
        error,
      }),
    ),
  ]);
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

async function runOpenCodeSessionVoidAction(input: {
  options: OpenCodeProviderOptions;
  context: SessionActionRequest;
  operation: string;
  method: "POST" | "DELETE";
  path: string;
}): Promise<void> {
  await runOpenCodeSessionJsonAction(input);
}

async function runOpenCodeSessionJsonAction(input: {
  options: OpenCodeProviderOptions;
  context: SessionActionRequest;
  operation: string;
  method: "POST" | "DELETE";
  path: string;
}): Promise<unknown> {
  const requestTimeoutMs = validateRequestTimeout(
    input.options.requestTimeoutMs ?? DEFAULT_SESSION_MUTATION_REQUEST_TIMEOUT_MS,
  );
  const baseUrl = resolveSessionMutationBaseUrl(input.options, input.context, input.operation);
  const { response, responseBody } = await fetchSessionJson({
    url: buildSessionOperationUrl(baseUrl, input.path, input.context.workspacePath),
    method: input.method,
    requestTimeoutMs,
    fetchImplementation: input.options.fetchImplementation ?? fetch,
    signal: input.context.signal,
    operation: input.operation,
    providerSessionId: input.context.providerSessionId,
  });

  if (!response.ok) {
    throw createSessionResponseError({
      operation: input.operation,
      status: response.status,
      providerSessionId: input.context.providerSessionId,
    });
  }

  return responseBody;
}

async function runOpenCodeCli(input: {
  options: OpenCodeProviderOptions;
  context: ProviderContext;
  operation: string;
  args: readonly string[];
  providerSessionId?: string | undefined;
}): Promise<{ stdout: string; stderr: string }> {
  const cwd = input.context.workspacePath ?? input.options.cwd;
  const env = createOpenCodePassthroughEnv(input.options.env, input.options.passthroughEnv);
  const binaryPath = resolveOpenCodeCliBinary(input.options, input.context, input.operation, env);
  const requestTimeoutMs = validateRequestTimeout(
    input.options.requestTimeoutMs ?? DEFAULT_SESSION_CLI_REQUEST_TIMEOUT_MS,
  );

  try {
    return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        binaryPath,
        [...input.args],
        {
          ...(cwd !== undefined ? { cwd } : {}),
          env,
          encoding: "utf8",
          maxBuffer: OPENCODE_CLI_MAX_BUFFER_BYTES,
          timeout: requestTimeoutMs,
        },
        (error, stdout, stderr) => {
          if (error !== null) {
            reject(error);
            return;
          }

          resolve({
            stdout,
            stderr,
          });
        },
      );
    });
  } catch {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: input.operation,
      message: "OpenCode native session command failed.",
      failureReason: input.context.signal?.aborted === true ? "aborted" : "cli_failed",
      providerSessionId: input.providerSessionId,
      suggestion: "Verify that OpenCode is installed and retry the session operation.",
    });
  }
}

function resolveOpenCodeCliBinary(
  options: OpenCodeProviderOptions,
  context: ProviderContext,
  operation: string,
  env: NodeJS.ProcessEnv,
): string {
  try {
    const cwd = context.workspacePath ?? options.cwd;
    return probeOpenCodeBinary({
      ...(options.binary !== undefined ? { binary: options.binary } : {}),
      env,
      inheritProcessEnv: false,
      ...(cwd !== undefined ? { cwd } : {}),
    }).resolvedPath;
  } catch {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation,
      message: "OpenCode binary is required for native session operations.",
      failureReason: "binary_unavailable",
      suggestion: "Install OpenCode or configure providers.opencode.binary before retrying.",
    });
  }
}

function parseCliJsonOrText(value: string): unknown {
  const parsed = parseCliJson(value);
  return parsed === undefined ? value : parsed;
}

function parseCliJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function readShareUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }

  const direct =
    readNonEmptyString(value.url) ??
    readNonEmptyString(value.shareUrl) ??
    readNonEmptyString(value.shareURL) ??
    readNonEmptyString(value.link);
  if (direct !== undefined) {
    return direct;
  }

  return isPlainObject(value.share)
    ? (readNonEmptyString(value.share.url) ??
        readNonEmptyString(value.share.shareUrl) ??
        readNonEmptyString(value.share.shareURL))
    : undefined;
}

function readImportedSessionId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (!isPlainObject(value)) {
    return undefined;
  }

  return (
    readNonEmptyString(value.id) ??
    readNonEmptyString(value.sessionID) ??
    readNonEmptyString(value.sessionId) ??
    readNonEmptyString(value.providerSessionId) ??
    (isPlainObject(value.session) ? readImportedSessionId(value.session) : undefined) ??
    (isPlainObject(value.data) ? readImportedSessionId(value.data) : undefined)
  );
}

function readImportedSessionIdFromText(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const exact = trimmed.match(/^[A-Za-z0-9_-]{3,}$/u);
  if (exact !== null) {
    return exact[0];
  }

  const labeled = trimmed.match(/\b(?:sessionID|sessionId|id)\s*[:=]\s*([A-Za-z0-9_-]{3,})\b/u);
  return labeled?.[1];
}

function withImportMetadata(session: ProviderSession): ProviderSession {
  const opencodeMetadata = isPlainObject(session.metadata.opencode)
    ? session.metadata.opencode
    : {};

  return {
    ...session,
    metadata: {
      ...session.metadata,
      opencode: {
        ...opencodeMetadata,
        import: {
          source: "cli",
        },
      },
    },
  };
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
  method: "GET" | "POST" | "DELETE";
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

async function connectOpenCodeMessageEventStream(input: {
  baseUrl: string;
  workspacePath: string | undefined;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
}): Promise<EventStreamResponse> {
  try {
    const response = await withRequestTimeout(
      async (requestSignal) =>
        await input.fetchImplementation(buildEventStreamUrl(input.baseUrl, input.workspacePath), {
          headers: {
            accept: "text/event-stream",
          },
          signal: requestSignal,
        }),
      input.requestTimeoutMs,
      input.signal,
    );

    if (response.status === 401 || response.status === 403) {
      await cancelResponseBody(response);
      throw createSessionOperationError({
        code: "PERMISSION_DENIED",
        operation: OPENCODE_SEND_MESSAGE_OPERATION,
        message: "OpenCode event stream requires authentication before sending messages.",
        failureReason: "authentication_required",
        status: response.status,
        suggestion: "Authenticate OpenCode and retry message sending.",
      });
    }

    if (!response.ok || response.body === null) {
      await cancelResponseBody(response);
      throw createSessionOperationError({
        code: "PROVIDER_UNAVAILABLE",
        operation: OPENCODE_SEND_MESSAGE_OPERATION,
        message: "OpenCode event stream was unavailable before sending a message.",
        failureReason: response.body === null ? "missing_response_body" : "unhealthy_response",
        status: response.status,
        suggestion: "Check the OpenCode runtime event stream before retrying.",
      });
    }

    if (readMediaType(response.headers.get("content-type")) !== "text/event-stream") {
      await cancelResponseBody(response);
      throw createSessionOperationError({
        code: "PROVIDER_UNAVAILABLE",
        operation: OPENCODE_SEND_MESSAGE_OPERATION,
        message: "OpenCode event stream returned an unexpected content type.",
        failureReason: "unexpected_event_stream_content_type",
        status: response.status,
        suggestion: "Check that the OpenCode runtime exposes a valid SSE event endpoint.",
      });
    }

    return response as EventStreamResponse;
  } catch (error) {
    if (isAgentProxyError(error) && error.operation === OPENCODE_SEND_MESSAGE_OPERATION) {
      throw error;
    }

    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: OPENCODE_SEND_MESSAGE_OPERATION,
      message: "OpenCode event stream request failed before sending a message.",
      failureReason: input.signal?.aborted === true ? "aborted" : "event_stream_request_failed",
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    });
  }
}

async function postOpenCodeMessage(input: {
  baseUrl: string;
  context: SendMessageRequest;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
}): Promise<void> {
  const promptModel = parsePromptModel(input.context.model, OPENCODE_SEND_MESSAGE_OPERATION);
  const response = await fetchMessageResponse({
    url: buildSessionOperationUrl(
      input.baseUrl,
      `${OPENCODE_SESSION_LIST_PATH}/${encodeURIComponent(input.context.providerSessionId)}/message`,
      input.context.workspacePath,
    ),
    body: {
      ...(promptModel !== undefined ? { model: promptModel } : {}),
      parts: [
        {
          type: "text",
          text: input.context.prompt,
        },
      ],
    },
    requestTimeoutMs: input.requestTimeoutMs,
    fetchImplementation: input.fetchImplementation,
    signal: input.context.signal,
    providerSessionId: input.context.providerSessionId,
  });

  if (!response.ok) {
    throw createSessionResponseError({
      operation: OPENCODE_SEND_MESSAGE_OPERATION,
      status: response.status,
      providerSessionId: input.context.providerSessionId,
    });
  }
}

async function fetchMessageResponse(input: {
  url: string;
  body: Record<string, unknown>;
  requestTimeoutMs: number;
  fetchImplementation: typeof fetch;
  signal: AbortSignal | undefined;
  providerSessionId: string;
}): Promise<Response> {
  try {
    return await withRequestTimeout(
      async (requestSignal) => {
        const response = await input.fetchImplementation(input.url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(input.body),
          signal: requestSignal,
        });
        await cancelResponseBody(response);
        return response;
      },
      input.requestTimeoutMs,
      input.signal,
    );
  } catch {
    throw createSessionOperationError({
      code: "PROVIDER_UNAVAILABLE",
      operation: OPENCODE_SEND_MESSAGE_OPERATION,
      message: "OpenCode message request failed.",
      failureReason: input.signal?.aborted === true ? "aborted" : "request_failed",
      providerSessionId: input.providerSessionId,
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    });
  }
}

function buildEventStreamUrl(baseUrl: string, workspacePath: string | undefined): string {
  const url = new URL(`${baseUrl}${OPENCODE_EVENT_STREAM_PATH}`);
  if (workspacePath !== undefined && workspacePath.trim() !== "") {
    url.searchParams.set("directory", workspacePath);
  }

  return url.href;
}

function isTerminalMessageEvent(event: AgentEvent): boolean {
  return event.type === "session.completed";
}

function readMediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function readExplicitProviderSessionId(metadata: Record<string, unknown>): string | undefined {
  const streamMetadata = metadata.agentproxyOpenCodeEventStream;
  if (!isPlainObject(streamMetadata)) {
    return undefined;
  }

  return readNonEmptyString(streamMetadata.explicitProviderSessionId);
}

async function fetchSessionJson(input: {
  url: string;
  method: "GET" | "POST" | "DELETE";
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
