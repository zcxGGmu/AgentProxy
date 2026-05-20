import { randomUUID } from "node:crypto";
import path from "node:path";
import { createAgentProxyError, type ProviderMetadata } from "../core/index.js";
import { redactValue } from "../logging/index.js";
import type {
  AgentProvider,
  ResumeSessionRequest,
  StartSessionRequest,
} from "../providers/types.js";
import {
  AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";
import type { ProviderSession } from "./types.js";

const AGENTPROXY_LIFECYCLE_SESSION_ID_PREFIX = "apx";

export interface StartAgentProxySessionInput {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: StartSessionRequest;
  now?: () => Date;
  createSessionId?: () => string;
}

export interface ResumeAgentProxySessionInput {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: ResumeSessionRequest;
  now?: () => Date;
  createSessionId?: () => string;
}

export interface PersistedAgentProxySessionResult {
  syncedAt: string;
  providerSession: ProviderSession;
  session: StoredSessionRecord;
}

export async function startAgentProxySession(
  input: StartAgentProxySessionInput,
): Promise<PersistedAgentProxySessionResult> {
  const syncedAt = (input.now ?? (() => new Date()))().toISOString();
  const context = enrichStartContextWithParentProviderSession(input.storage, input.context);
  const createContext = omitInitialPrompt(context);
  const providerSession = await input.provider.startSession(createContext);

  const created = persistProviderSessionMapping({
    storage: input.storage,
    providerSession,
    context,
    syncedAt,
    createSessionId: input.createSessionId ?? defaultCreateSessionId,
    lifecycleMetadata: createLifecycleMetadata(context, { startedAt: syncedAt }),
  });

  if (context.prompt === undefined || context.prompt.trim() === "") {
    return created;
  }

  try {
    const promptedProviderSession = await input.provider.resumeSession({
      providerId: context.providerId,
      providerSessionId: providerSession.providerSessionId,
      ...(context.workspacePath !== undefined ? { workspacePath: context.workspacePath } : {}),
      ...(context.runtimeId !== undefined ? { runtimeId: context.runtimeId } : {}),
      sessionId: created.session.id,
      ...(context.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
      ...(context.signal !== undefined ? { signal: context.signal } : {}),
      prompt: context.prompt,
      ...(context.model !== undefined ? { model: context.model } : {}),
      metadata: context.metadata,
    });
    assertResumeTargetMatches({
      requestedProviderId: context.providerId,
      requestedProviderSessionId: providerSession.providerSessionId,
      providerSession: promptedProviderSession,
      operation: "sessions.start",
    });

    return persistProviderSessionMapping({
      storage: input.storage,
      providerSession: promptedProviderSession,
      context,
      existing: created.session,
      syncedAt,
      createSessionId: input.createSessionId ?? defaultCreateSessionId,
      lifecycleMetadata: createLifecycleMetadata(context, { promptSentAt: syncedAt }),
    });
  } catch (error) {
    markPromptFailure(input.storage, created.session, error, syncedAt);
    throw error;
  }
}

function enrichStartContextWithParentProviderSession(
  storage: AgentProxyStorage,
  context: StartSessionRequest,
): StartSessionRequest {
  if (context.parentSessionId === undefined) {
    return context;
  }

  const parent = storage.sessions.getById(context.parentSessionId);
  if (parent === undefined || parent.deletedAt !== undefined) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Parent AgentProxy session was not found or is tombstoned.",
      providerId: context.providerId,
      operation: "sessions.start",
      details: {
        parentSessionId: context.parentSessionId,
        suggestion: "Sync sessions and retry with an existing non-deleted parent session.",
      },
    });
  }
  if (parent.providerId !== context.providerId) {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "Parent AgentProxy session belongs to a different provider.",
      providerId: context.providerId,
      operation: "sessions.start",
      details: {
        parentSessionId: context.parentSessionId,
        suggestion: "Start a child session with a parent from the same provider.",
      },
    });
  }

  return {
    ...context,
    metadata: {
      ...context.metadata,
      parentProviderSessionId: parent.providerSessionId,
    },
  };
}

function omitInitialPrompt(context: StartSessionRequest): StartSessionRequest {
  const { prompt: _prompt, ...withoutPrompt } = context;
  return withoutPrompt;
}

export async function resumeAgentProxySession(
  input: ResumeAgentProxySessionInput,
): Promise<PersistedAgentProxySessionResult> {
  const existing = input.storage.sessions.getByProviderSessionId(
    input.context.providerId,
    input.context.providerSessionId,
  );
  if (existing?.deletedAt !== undefined) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Cannot resume a tombstoned AgentProxy session mapping.",
      providerId: input.context.providerId,
      operation: "sessions.resume",
      details: {
        sessionId: existing.id,
        providerSessionId: input.context.providerSessionId,
        suggestion: "Restore or recreate the session mapping explicitly before resuming it.",
      },
    });
  }

  const syncedAt = (input.now ?? (() => new Date()))().toISOString();
  const providerSession = await input.provider.resumeSession(input.context);
  assertResumeTargetMatches({
    requestedProviderId: input.context.providerId,
    requestedProviderSessionId: input.context.providerSessionId,
    providerSession,
    operation: "sessions.resume",
  });

  return persistProviderSessionMapping({
    storage: input.storage,
    providerSession,
    context: input.context,
    existing,
    syncedAt,
    createSessionId: input.createSessionId ?? defaultCreateSessionId,
    lifecycleMetadata: createLifecycleMetadata(input.context, { resumedAt: syncedAt }),
  });
}

function persistProviderSessionMapping(input: {
  storage: AgentProxyStorage;
  providerSession: ProviderSession;
  context: StartSessionRequest | ResumeSessionRequest;
  existing?: StoredSessionRecord | undefined;
  syncedAt: string;
  createSessionId: () => string;
  lifecycleMetadata: ProviderMetadata;
}): PersistedAgentProxySessionResult {
  const existing =
    input.existing ??
    input.storage.sessions.getByProviderSessionId(
      input.providerSession.providerId,
      input.providerSession.providerSessionId,
    );
  if (existing?.deletedAt !== undefined) {
    throw createAgentProxyError({
      code: "SESSION_NOT_FOUND",
      message: "Cannot persist a provider session over a tombstoned AgentProxy mapping.",
      providerId: input.providerSession.providerId,
      operation: "sessions.persist",
      details: {
        sessionId: existing.id,
        providerSessionId: input.providerSession.providerSessionId,
        suggestion: "Restore or recreate the session mapping explicitly before persisting it.",
      },
    });
  }

  const workspacePath = resolveWorkspacePath(input.context, input.providerSession, existing);
  const parentSessionId = resolveParentSessionId(
    input.storage,
    input.providerSession,
    input.context,
  );
  const storedModel = input.providerSession.model ?? existing?.model;
  const title = input.providerSession.title ?? existing?.title;
  const lastRunAt = input.providerSession.lastRunAt ?? existing?.lastRunAt;
  const metadata = mergeLifecycleMetadata({
    localMetadata: existing?.metadata ?? {},
    providerMetadata: input.providerSession.metadata,
    localWorkspacePath: workspacePath,
    providerWorkspacePath: input.providerSession.workspacePath,
    lifecycleMetadata: input.lifecycleMetadata,
  });

  const record: StoredSessionRecord = {
    id: existing?.id ?? input.createSessionId(),
    providerId: input.providerSession.providerId,
    providerSessionId: input.providerSession.providerSessionId,
    workspacePath,
    ...(title !== undefined ? { title } : {}),
    status: input.providerSession.status,
    ...(storedModel !== undefined ? { model: storedModel } : {}),
    ...(input.context.runtimeId !== undefined
      ? { runtimeId: input.context.runtimeId }
      : existing?.runtimeId !== undefined
        ? { runtimeId: existing.runtimeId }
        : {}),
    ...(parentSessionId !== undefined ? { parentSessionId } : {}),
    createdAt: input.providerSession.createdAt ?? existing?.createdAt ?? input.syncedAt,
    updatedAt:
      input.providerSession.updatedAt ??
      input.providerSession.lastRunAt ??
      existing?.updatedAt ??
      input.syncedAt,
    ...(lastRunAt !== undefined ? { lastRunAt } : {}),
    lastSyncAt: input.syncedAt,
    ...(existing?.lastError !== undefined ? { lastError: existing.lastError } : {}),
    sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
    metadata,
  };

  if (parentSessionId !== undefined) {
    metadata.parentProviderSessionId = input.providerSession.parentProviderSessionId;
  }

  input.storage.sessions.upsert(record);
  const persisted = input.storage.sessions.getById(record.id) ?? record;

  return {
    syncedAt: input.syncedAt,
    providerSession: input.providerSession,
    session: persisted,
  };
}

function resolveWorkspacePath(
  context: StartSessionRequest | ResumeSessionRequest,
  providerSession: ProviderSession,
  existing: StoredSessionRecord | undefined,
): string {
  const rawWorkspacePath =
    existing?.workspacePath ?? context.workspacePath ?? providerSession.workspacePath;
  if (rawWorkspacePath === undefined || rawWorkspacePath.trim() === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "A workspace path is required before persisting a session mapping.",
      providerId: providerSession.providerId,
      operation: "sessions.persist",
      details: {
        providerSessionId: providerSession.providerSessionId,
        suggestion:
          "Pass a workspacePath in provider context or use a provider session with workspace metadata.",
      },
    });
  }

  return path.resolve(rawWorkspacePath);
}

function resolveParentSessionId(
  storage: AgentProxyStorage,
  providerSession: ProviderSession,
  context: StartSessionRequest | ResumeSessionRequest,
): string | undefined {
  if (providerSession.parentProviderSessionId !== undefined) {
    const parent = storage.sessions.getByProviderSessionId(
      providerSession.providerId,
      providerSession.parentProviderSessionId,
    );
    if (parent !== undefined && parent.deletedAt === undefined) {
      return parent.id;
    }
    if (parent?.deletedAt !== undefined) {
      throw createAgentProxyError({
        code: "SESSION_NOT_FOUND",
        message: "Provider returned a tombstoned parent session mapping.",
        providerId: providerSession.providerId,
        operation: "sessions.persist",
        details: {
          parentSessionId: parent.id,
          parentProviderSessionId: providerSession.parentProviderSessionId,
          suggestion: "Restore or recreate the parent mapping before linking a child session.",
        },
      });
    }
  }

  return "parentSessionId" in context ? context.parentSessionId : undefined;
}

function assertResumeTargetMatches(input: {
  requestedProviderId: string;
  requestedProviderSessionId: string;
  providerSession: ProviderSession;
  operation: string;
}): void {
  if (
    input.providerSession.providerId === input.requestedProviderId &&
    input.providerSession.providerSessionId === input.requestedProviderSessionId
  ) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "Provider returned a different session id than the requested resume target.",
    providerId: input.requestedProviderId,
    operation: input.operation,
    details: {
      failureReason: "provider_session_id_mismatch",
      providerSessionId: input.requestedProviderSessionId,
      suggestion: "Sync sessions and retry with the original provider session id.",
    },
  });
}

function createLifecycleMetadata(
  context: StartSessionRequest | ResumeSessionRequest,
  metadata: ProviderMetadata,
): ProviderMetadata {
  const requestedModel = "model" in context ? context.model : undefined;

  return {
    ...metadata,
    ...(requestedModel !== undefined ? { requestedModel } : {}),
  };
}

function markPromptFailure(
  storage: AgentProxyStorage,
  session: StoredSessionRecord,
  error: unknown,
  failedAt: string,
): void {
  storage.sessions.upsert({
    ...session,
    lastSyncAt: failedAt,
    lastError: readSafeErrorMessage(error),
    metadata: jsonSafeMetadata({
      ...session.metadata,
      lifecycle: {
        ...(isPlainObject(session.metadata.lifecycle) ? session.metadata.lifecycle : {}),
        promptFailedAt: failedAt,
      },
    }),
  });
}

function readSafeErrorMessage(error: unknown): string {
  if (isPlainObject(error) && typeof error.code === "string" && error.code.trim() !== "") {
    return `Session prompt dispatch failed: ${error.code}.`;
  }

  return "Session prompt dispatch failed.";
}

function mergeLifecycleMetadata(input: {
  localMetadata: ProviderMetadata;
  providerMetadata: ProviderMetadata;
  localWorkspacePath: string;
  providerWorkspacePath: string | undefined;
  lifecycleMetadata: ProviderMetadata;
}): ProviderMetadata {
  return jsonSafeMetadata({
    ...input.localMetadata,
    ...input.providerMetadata,
    ...(input.providerWorkspacePath !== undefined &&
    path.resolve(input.providerWorkspacePath) !== input.localWorkspacePath
      ? { providerWorkspacePath: input.providerWorkspacePath }
      : {}),
    lifecycle: {
      ...(isPlainObject(input.localMetadata.lifecycle) ? input.localMetadata.lifecycle : {}),
      ...input.lifecycleMetadata,
    },
  });
}

function defaultCreateSessionId(): string {
  return `${AGENTPROXY_LIFECYCLE_SESSION_ID_PREFIX}_${randomUUID()}`;
}

function jsonSafeMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const serialized = JSON.stringify(redactValue(metadata));
  const parsed: unknown = serialized === undefined ? {} : JSON.parse(serialized);
  return isPlainObject(parsed) ? parsed : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
