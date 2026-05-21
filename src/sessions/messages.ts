import { randomUUID } from "node:crypto";
import { createAgentProxyError, type AgentEvent, type ProviderMetadata } from "../core/index.js";
import { redactString, redactValue } from "../logging/index.js";
import type { AgentProvider, SendMessageRequest } from "../providers/types.js";
import type {
  AgentProxyStorage,
  StoredSessionEventRecord,
  StoredSessionRecord,
} from "../storage/index.js";

const AGENTPROXY_MESSAGE_EVENT_ID_PREFIX = "evt";
// biome-ignore lint/complexity/useRegexLiterals: String.raw keeps control escapes out of the source.
const ANSI_ESCAPE_PATTERN = new RegExp(
  String.raw`\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|[\[\]()#;?]*(?:[0-?]*[ -/]*[@-~]))|\u009B[0-?]*[ -/]*[@-~]`,
  "gu",
);
// biome-ignore lint/complexity/useRegexLiterals: String.raw keeps control escapes out of the source.
const UNSAFE_CONTROL_PATTERN = new RegExp(
  String.raw`[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F-\u009F]`,
  "gu",
);

export interface SendAgentProxyMessageInput {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: SendMessageRequest;
  now?: () => Date;
  createEventId?: () => string;
}

export function sendAgentProxyMessage(
  input: SendAgentProxyMessageInput,
): AsyncIterable<AgentEvent> {
  return sendAgentProxyMessageEvents(input);
}

async function* sendAgentProxyMessageEvents(
  input: SendAgentProxyMessageInput,
): AsyncGenerator<AgentEvent> {
  const now = input.now ?? (() => new Date());
  const createEventId = input.createEventId ?? defaultCreateEventId;
  const startedAt = now().toISOString();
  const session = resolveMessageSession(input.storage, input.context);
  markMessageStarted(input.storage, session, input.context, startedAt);

  let terminalStatus: "completed" | "failed" | "aborted" | undefined;

  try {
    for await (const event of input.provider.sendMessage({
      ...input.context,
      agentproxySessionId: session.id,
      workspacePath: input.context.workspacePath ?? session.workspacePath,
      ...(input.context.runtimeId !== undefined
        ? { runtimeId: input.context.runtimeId }
        : session.runtimeId !== undefined
          ? { runtimeId: session.runtimeId }
          : {}),
    })) {
      const eventAt = now().toISOString();
      appendSanitizedEvent(input.storage, {
        id: createEventId(),
        sessionId: session.id,
        providerId: session.providerId,
        eventType: event.type,
        createdAt: eventAt,
        payload: sanitizeEventForStorage(event),
      });

      if (event.type === "session.completed") {
        terminalStatus = event.status;
        markMessageTerminal(input.storage, session.id, event.status, eventAt);
      }

      yield event;
    }

    if (terminalStatus === undefined) {
      const completedAt = now().toISOString();
      markMessageTerminal(input.storage, session.id, "completed", completedAt);
      terminalStatus = "completed";
    }
  } catch (error) {
    const failedAt = now().toISOString();
    markMessageFailure(input.storage, session.id, failedAt);
    terminalStatus = "failed";
    throw error;
  } finally {
    if (terminalStatus === undefined) {
      const failedAt = now().toISOString();
      markMessageFailure(input.storage, session.id, failedAt);
    }
  }
}

function resolveMessageSession(
  storage: AgentProxyStorage,
  context: SendMessageRequest,
): StoredSessionRecord {
  const byAgentProxyId =
    context.agentproxySessionId === undefined
      ? undefined
      : storage.sessions.getById(context.agentproxySessionId);
  const session =
    byAgentProxyId ??
    storage.sessions.getByProviderSessionId(context.providerId, context.providerSessionId);

  if (
    session === undefined ||
    session.deletedAt !== undefined ||
    session.providerId !== context.providerId ||
    session.providerSessionId !== context.providerSessionId
  ) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Cannot send a message without an active AgentProxy session mapping.",
      providerId: context.providerId,
      operation: "sessions.sendMessage",
      details: {
        providerSessionId: context.providerSessionId,
        ...(context.agentproxySessionId !== undefined
          ? { sessionId: context.agentproxySessionId }
          : {}),
        suggestion: "Start, resume, or sync a non-deleted session before sending a message.",
      },
    });
  }

  return session;
}

function markMessageStarted(
  storage: AgentProxyStorage,
  session: StoredSessionRecord,
  context: SendMessageRequest,
  startedAt: string,
): void {
  storage.sessions.upsert({
    ...session,
    status: "running",
    ...(context.runtimeId !== undefined ? { runtimeId: context.runtimeId } : {}),
    updatedAt: startedAt,
    lastRunAt: startedAt,
    lastSyncAt: startedAt,
    metadata: mergeLifecycleMetadata(session.metadata, {
      messageStartedAt: startedAt,
    }),
  });
}

function markMessageTerminal(
  storage: AgentProxyStorage,
  sessionId: string,
  status: "completed" | "failed" | "aborted",
  completedAt: string,
): void {
  const current = storage.sessions.getById(sessionId);
  if (current === undefined || current.deletedAt !== undefined) {
    return;
  }
  const storedStatus = status === "aborted" ? "failed" : status;
  const lifecyclePatch =
    storedStatus === "completed"
      ? { messageCompletedAt: completedAt }
      : { messageFailedAt: completedAt };
  const { lastError: _lastError, ...currentWithoutLastError } = current;

  storage.sessions.upsert({
    ...(storedStatus === "completed" ? currentWithoutLastError : current),
    status: storedStatus,
    updatedAt: completedAt,
    lastRunAt: completedAt,
    lastSyncAt: completedAt,
    ...(storedStatus === "completed" ? {} : { lastError: "Session message dispatch failed." }),
    metadata: mergeLifecycleMetadata(current.metadata, lifecyclePatch),
  });
}

function markMessageFailure(storage: AgentProxyStorage, sessionId: string, failedAt: string): void {
  const current = storage.sessions.getById(sessionId);
  if (current === undefined || current.deletedAt !== undefined) {
    return;
  }

  storage.sessions.upsert({
    ...current,
    status: "failed",
    updatedAt: failedAt,
    lastRunAt: failedAt,
    lastSyncAt: failedAt,
    lastError: "Session message dispatch failed.",
    metadata: mergeLifecycleMetadata(current.metadata, {
      messageFailedAt: failedAt,
    }),
  });
}

function appendSanitizedEvent(storage: AgentProxyStorage, record: StoredSessionEventRecord): void {
  storage.sessionEvents.append({
    ...record,
    payload: jsonSafe(record.payload),
  });
}

function sanitizeEventForStorage(event: AgentEvent): Record<string, unknown> {
  switch (event.type) {
    case "message.delta":
      return {
        type: event.type,
        role: event.role,
        ...(event.messageId !== undefined
          ? { messageId: sanitizeStoredString(event.messageId) }
          : {}),
        metadata: {},
      };
    case "tool.started":
      return {
        type: event.type,
        toolCallId: sanitizeStoredString(event.toolCallId),
        toolName: sanitizeStoredString(event.toolName),
        metadata: {},
      };
    case "tool.finished":
      return {
        type: event.type,
        toolCallId: sanitizeStoredString(event.toolCallId),
        toolName: sanitizeStoredString(event.toolName),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        metadata: {},
      };
    case "permission.requested":
      return {
        type: event.type,
        permissionId: sanitizeStoredString(event.permissionId),
        action: sanitizeStoredString(event.action),
        metadata: {},
      };
    case "permission.resolved":
      return {
        type: event.type,
        permissionId: sanitizeStoredString(event.permissionId),
        decision: event.decision,
        metadata: {},
      };
    case "file.changed":
      return {
        type: event.type,
        path: sanitizeStoredString(event.path),
        change: sanitizeStoredString(event.change),
        metadata: {},
      };
    case "diff.updated":
      return {
        type: event.type,
        metadata: {},
      };
    case "error":
      return {
        type: event.type,
        code: event.code,
        message: "Provider reported a session error.",
        metadata: sanitizeMetadata(event.metadata),
      };
    case "session.completed":
      return {
        type: event.type,
        status: event.status,
        metadata: sanitizeMetadata(event.metadata),
      };
    case "session.status_changed":
      return {
        type: event.type,
        from: sanitizeStoredString(event.from),
        to: sanitizeStoredString(event.to),
        metadata: sanitizeMetadata(event.metadata),
      };
    case "session.started":
      return {
        type: event.type,
        providerSessionId: sanitizeStoredString(event.providerSessionId),
        ...(event.agentproxySessionId !== undefined
          ? { agentproxySessionId: sanitizeStoredString(event.agentproxySessionId) }
          : {}),
        ...(event.workspacePath !== undefined
          ? { workspacePath: sanitizeStoredString(event.workspacePath) }
          : {}),
        ...(event.model !== undefined ? { model: sanitizeStoredString(event.model) } : {}),
        metadata: sanitizeMetadata(event.metadata),
      };
    case "provider.raw_event":
      return {
        type: event.type,
        providerEventType: sanitizeStoredString(event.providerEventType),
        metadata: sanitizeMetadata(event.metadata),
      };
  }
}

function mergeLifecycleMetadata(
  metadata: ProviderMetadata,
  lifecyclePatch: ProviderMetadata,
): ProviderMetadata {
  return jsonSafe({
    ...metadata,
    lifecycle: {
      ...(isPlainObject(metadata.lifecycle) ? metadata.lifecycle : {}),
      ...lifecyclePatch,
    },
  });
}

function sanitizeMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const safe = jsonSafe(sanitizeStoredValue(redactValue(metadata)));
  return dropRedactedValues(safe);
}

function sanitizeStoredValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeStoredString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStoredValue(item));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeStoredValue(entry)]),
    );
  }

  return value;
}

function sanitizeStoredString(value: string): string {
  return redactString(value).replace(ANSI_ESCAPE_PATTERN, "").replace(UNSAFE_CONTROL_PATTERN, "");
}

function dropRedactedValues(metadata: ProviderMetadata): ProviderMetadata {
  const output: ProviderMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === "[REDACTED]") {
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.filter((item) => item !== "[REDACTED]");
      if (items.length > 0) {
        output[key] = items;
      }
      continue;
    }
    if (isPlainObject(value)) {
      const nested = dropRedactedValues(value);
      if (Object.keys(nested).length > 0) {
        output[key] = nested;
      }
      continue;
    }
    output[key] = value;
  }

  return output;
}

function jsonSafe(value: unknown): ProviderMetadata {
  const serialized = JSON.stringify(value);
  const parsed: unknown = serialized === undefined ? {} : JSON.parse(serialized);
  return isPlainObject(parsed) ? parsed : {};
}

function defaultCreateEventId(): string {
  return `${AGENTPROXY_MESSAGE_EVENT_ID_PREFIX}_${randomUUID()}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
