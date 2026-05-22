import { randomUUID } from "node:crypto";
import path from "node:path";
import { createAgentProxyError, type ProviderMetadata } from "../core/index.js";
import { redactString, redactValue } from "../logging/index.js";
import type {
  AgentProvider,
  ExportResult,
  ExportSessionRequest,
  ImportSessionRequest,
  SessionActionRequest,
  ShareResult,
} from "../providers/index.js";
import {
  AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";
import type { ProviderSession } from "./types.js";

const AGENTPROXY_ACTIONS_SESSION_ID_PREFIX = "apx";
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

export interface SessionActionServiceInput<TContext extends SessionActionRequest> {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: TContext;
  confirmed?: boolean;
  now?: () => Date;
}

export interface DeleteAgentProxySessionResult {
  session: StoredSessionRecord;
  deletedAt: string;
}

export interface ImportAgentProxySessionInput {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: ImportSessionRequest;
  now?: () => Date;
  createSessionId?: () => string;
}

export interface ImportedAgentProxySessionResult {
  importedAt: string;
  providerSession: ProviderSession;
  session: StoredSessionRecord;
}

export async function abortAgentProxySession(
  input: SessionActionServiceInput<SessionActionRequest>,
): Promise<StoredSessionRecord> {
  const session = resolveActiveSession(input.storage, input.context, "sessions.abort");
  const actionAt = (input.now ?? (() => new Date()))().toISOString();

  await input.provider.abortSession(enrichActionContext(input.context, session));
  const current = input.storage.sessions.getById(session.id) ?? session;
  const record: StoredSessionRecord = {
    ...current,
    status: "failed",
    updatedAt: actionAt,
    lastRunAt: actionAt,
    lastSyncAt: actionAt,
    metadata: mergeOperationMetadata(current.metadata, {
      abort: {
        abortedAt: actionAt,
      },
    }),
  };
  input.storage.sessions.upsert(record);

  return input.storage.sessions.getById(session.id) ?? record;
}

export async function deleteAgentProxySession(
  input: SessionActionServiceInput<SessionActionRequest>,
): Promise<DeleteAgentProxySessionResult> {
  if (input.confirmed !== true) {
    throwConfirmationRequired("sessions.delete");
  }

  const session = resolveActiveSession(input.storage, input.context, "sessions.delete");
  const deletedAt = (input.now ?? (() => new Date()))().toISOString();

  await input.provider.deleteSession(enrichActionContext(input.context, session));
  input.storage.sessions.markDeleted({
    id: session.id,
    deletedAt,
    tombstoneReason: "provider_deleted",
  });

  return {
    deletedAt,
    session: input.storage.sessions.getById(session.id) ?? {
      ...session,
      deletedAt,
      tombstoneReason: "provider_deleted",
    },
  };
}

export async function exportAgentProxySession(
  input: SessionActionServiceInput<ExportSessionRequest>,
): Promise<ExportResult> {
  if (
    (input.context.raw === true || input.context.sanitize === false) &&
    input.context.rawConfirmed !== true
  ) {
    throwConfirmationRequired("sessions.export", "raw_export_requires_confirmation");
  }

  const session = resolveActiveSession(input.storage, input.context, "sessions.export");
  return input.provider.exportSession({
    ...input.context,
    providerSessionId: session.providerSessionId,
    workspacePath: input.context.workspacePath ?? session.workspacePath,
    sessionId: session.id,
    sanitize: input.context.raw === true ? false : (input.context.sanitize ?? true),
  });
}

export async function importAgentProxySession(
  input: ImportAgentProxySessionInput,
): Promise<ImportedAgentProxySessionResult> {
  const importedAt = (input.now ?? (() => new Date()))().toISOString();
  const providerSession = await input.provider.importSession(input.context);
  const existing = input.storage.sessions.getByProviderSessionId(
    providerSession.providerId,
    providerSession.providerSessionId,
  );
  if (existing?.deletedAt !== undefined) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Cannot import over a tombstoned AgentProxy session mapping.",
      providerId: providerSession.providerId,
      operation: "sessions.import",
      details: {
        sessionId: existing.id,
        providerSessionId: providerSession.providerSessionId,
        suggestion: "Restore or recreate the session mapping explicitly before importing.",
      },
    });
  }

  const workspacePath = resolveWorkspacePath(input.context, providerSession, existing);
  const title =
    providerSession.title === undefined
      ? sanitizeOptionalPersistedString(existing?.title)
      : sanitizePersistedString(providerSession.title);
  const model =
    providerSession.model === undefined
      ? sanitizeOptionalPersistedString(existing?.model)
      : sanitizePersistedString(providerSession.model);
  const record: StoredSessionRecord = {
    id: existing?.id ?? (input.createSessionId ?? defaultCreateSessionId)(),
    providerId: providerSession.providerId,
    providerSessionId: providerSession.providerSessionId,
    workspacePath,
    ...(title !== undefined ? { title } : {}),
    status: providerSession.status,
    ...(model !== undefined ? { model } : {}),
    ...(input.context.runtimeId !== undefined
      ? { runtimeId: input.context.runtimeId }
      : existing?.runtimeId !== undefined
        ? { runtimeId: existing.runtimeId }
        : {}),
    createdAt: providerSession.createdAt ?? existing?.createdAt ?? importedAt,
    updatedAt:
      providerSession.updatedAt ?? providerSession.lastRunAt ?? existing?.updatedAt ?? importedAt,
    ...(providerSession.lastRunAt !== undefined ? { lastRunAt: providerSession.lastRunAt } : {}),
    lastSyncAt: importedAt,
    sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
    metadata: jsonSafeMetadata({
      ...(existing?.metadata ?? {}),
      ...providerSession.metadata,
      lifecycle: {
        ...(isPlainObject(existing?.metadata.lifecycle) ? existing.metadata.lifecycle : {}),
        importedAt,
      },
    }),
  };

  input.storage.sessions.upsert(record);

  return {
    importedAt,
    providerSession,
    session: input.storage.sessions.getById(record.id) ?? record,
  };
}

export async function shareAgentProxySession(
  input: SessionActionServiceInput<SessionActionRequest>,
): Promise<ShareResult> {
  const session = resolveActiveSession(input.storage, input.context, "sessions.share");
  const updatedAt = (input.now ?? (() => new Date()))().toISOString();
  const result = await input.provider.shareSession(enrichActionContext(input.context, session));

  updateShareState(input.storage, session, true, updatedAt, "sessions.share");

  return result;
}

export async function unshareAgentProxySession(
  input: SessionActionServiceInput<SessionActionRequest>,
): Promise<void> {
  if (input.provider.unshareSession === undefined) {
    throw createAgentProxyError({
      code: "CAPABILITY_UNSUPPORTED",
      message: "Provider does not support session unshare.",
      providerId: input.context.providerId,
      operation: "sessions.unshare",
    });
  }

  const session = resolveActiveSession(input.storage, input.context, "sessions.unshare");
  const updatedAt = (input.now ?? (() => new Date()))().toISOString();
  await input.provider.unshareSession(enrichActionContext(input.context, session));

  updateShareState(input.storage, session, false, updatedAt, "sessions.unshare");
}

function resolveActiveSession(
  storage: AgentProxyStorage,
  context: SessionActionRequest,
  operation: string,
): StoredSessionRecord {
  const byAgentProxyId =
    context.sessionId === undefined ? undefined : storage.sessions.getById(context.sessionId);
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
      message: "Cannot perform session operation without an active AgentProxy session mapping.",
      providerId: context.providerId,
      operation,
      details: {
        providerSessionId: context.providerSessionId,
        ...(context.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
        suggestion: "Sync sessions and retry with an existing non-deleted session.",
      },
    });
  }

  return session;
}

function enrichActionContext(
  context: SessionActionRequest,
  session: StoredSessionRecord,
): SessionActionRequest {
  return {
    ...context,
    providerSessionId: session.providerSessionId,
    workspacePath: context.workspacePath ?? session.workspacePath,
    sessionId: session.id,
  };
}

function updateShareState(
  storage: AgentProxyStorage,
  expectedSession: StoredSessionRecord,
  shared: boolean,
  updatedAt: string,
  operation: string,
): void {
  const current = storage.sessions.getById(expectedSession.id);
  if (current === undefined || current.deletedAt !== undefined) {
    return;
  }
  if (
    current.providerId !== expectedSession.providerId ||
    current.providerSessionId !== expectedSession.providerSessionId
  ) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Cannot update share state because the AgentProxy session mapping changed.",
      providerId: expectedSession.providerId,
      operation,
      details: {
        providerSessionId: expectedSession.providerSessionId,
        sessionId: expectedSession.id,
        suggestion: "Sync sessions and retry with the current AgentProxy session mapping.",
      },
    });
  }

  storage.sessions.upsert({
    ...current,
    updatedAt,
    lastSyncAt: updatedAt,
    metadata: mergeOperationMetadata(current.metadata, {
      share: {
        shared,
        updatedAt,
      },
    }),
  });
}

function resolveWorkspacePath(
  context: ImportSessionRequest,
  providerSession: ProviderSession,
  existing: StoredSessionRecord | undefined,
): string {
  const rawWorkspacePath =
    existing?.workspacePath ?? context.workspacePath ?? providerSession.workspacePath;
  if (rawWorkspacePath === undefined || rawWorkspacePath.trim() === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "A workspace path is required before persisting an imported session mapping.",
      providerId: providerSession.providerId,
      operation: "sessions.import",
      details: {
        providerSessionId: providerSession.providerSessionId,
        suggestion: "Pass a workspacePath or import a provider session with workspace metadata.",
      },
    });
  }

  return path.resolve(rawWorkspacePath);
}

function mergeOperationMetadata(
  metadata: ProviderMetadata,
  patch: ProviderMetadata,
): ProviderMetadata {
  return jsonSafeMetadata({
    ...metadata,
    sessionOperations: {
      ...(isPlainObject(metadata.sessionOperations) ? metadata.sessionOperations : {}),
      ...patch,
    },
  });
}

function throwConfirmationRequired(
  operation: string,
  failureReason = "confirmation_required",
): never {
  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Session operation requires explicit confirmation.",
    operation,
    details: {
      failureReason,
      suggestion: "Pass an explicit confirmation flag before retrying this operation.",
    },
  });
}

function jsonSafeMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const serialized = JSON.stringify(sanitizePersistedValue(redactValue(metadata)));
  const parsed: unknown = serialized === undefined ? {} : JSON.parse(serialized);
  return isPlainObject(parsed) ? parsed : {};
}

function defaultCreateSessionId(): string {
  return `${AGENTPROXY_ACTIONS_SESSION_ID_PREFIX}_${randomUUID()}`;
}

function sanitizeOptionalPersistedString(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizePersistedString(value);
}

function sanitizePersistedValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizePersistedString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePersistedValue(item));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizePersistedValue(entry)]),
    );
  }

  return value;
}

function sanitizePersistedString(value: string): string {
  return redactString(value).replace(ANSI_ESCAPE_PATTERN, "").replace(UNSAFE_CONTROL_PATTERN, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
