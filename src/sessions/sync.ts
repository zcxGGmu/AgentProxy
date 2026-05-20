import { randomUUID } from "node:crypto";
import { createAgentProxyError, type ProviderMetadata } from "../core/index.js";
import { redactValue } from "../logging/index.js";
import type { AgentProvider, ProviderContext, SessionQuery } from "../providers/types.js";
import {
  AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";
import type { ProviderSession } from "./types.js";

const AGENTPROXY_SYNC_SESSION_ID_PREFIX = "apx";

export interface SyncProviderSessionsInput {
  provider: AgentProvider;
  storage: AgentProxyStorage;
  context: ProviderContext;
  query?: SessionQuery;
  missingDetection?: "skip" | "completeProviderList";
  now?: () => Date;
  createSessionId?: () => string;
}

export interface SyncProviderSessionsResult {
  syncedAt: string;
  imported: number;
  updated: number;
  missing: number;
  skippedTombstones: number;
  sessions: StoredSessionRecord[];
}

export async function syncProviderSessions(
  input: SyncProviderSessionsInput,
): Promise<SyncProviderSessionsResult> {
  if (
    input.missingDetection === "completeProviderList" &&
    (input.query?.limit !== undefined || input.query?.cursor !== undefined)
  ) {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "Session missing detection requires a complete provider session list.",
      providerId: input.context.providerId,
      operation: "sessions.sync",
      details: {
        suggestion: "Run sync without limit or cursor before marking sessions missing in provider.",
      },
    });
  }

  const syncedAt = (input.now ?? (() => new Date()))().toISOString();
  const createSessionId = input.createSessionId ?? defaultCreateSessionId;
  const providerSessions = await input.provider.listSessions(input.context, input.query);
  const workspacePath = input.query?.workspacePath ?? input.context.workspacePath;
  const localSessions = input.storage.sessions.list({
    providerId: input.context.providerId,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    includeTombstones: true,
  });
  const visibleProviderSessionIds = new Set<string>();
  let imported = 0;
  let updated = 0;
  let skippedTombstones = 0;

  for (const providerSession of providerSessions) {
    const local = input.storage.sessions.getByProviderSessionId(
      providerSession.providerId,
      providerSession.providerSessionId,
    );
    if (!providerSessionBelongsToWorkspace(providerSession, local, workspacePath)) {
      continue;
    }

    visibleProviderSessionIds.add(providerSession.providerSessionId);
    if (local?.deletedAt !== undefined) {
      skippedTombstones += 1;
      continue;
    }

    const record = providerSessionToStoredRecord({
      providerSession,
      local,
      workspacePath,
      syncedAt,
      createSessionId,
      storage: input.storage,
    });
    input.storage.sessions.upsert(record);
    if (local === undefined) {
      imported += 1;
    } else {
      updated += 1;
    }
  }

  let missing = 0;
  if (input.missingDetection === "completeProviderList") {
    for (const local of localSessions) {
      if (local.deletedAt !== undefined || visibleProviderSessionIds.has(local.providerSessionId)) {
        continue;
      }

      input.storage.sessions.upsert({
        ...local,
        status: "missing_in_provider",
        lastSyncAt: syncedAt,
        metadata: {
          ...local.metadata,
          sync: {
            ...(isPlainObject(local.metadata.sync) ? local.metadata.sync : {}),
            missingInProviderAt: syncedAt,
          },
        },
      });
      missing += 1;
    }
  }

  return {
    syncedAt,
    imported,
    updated,
    missing,
    skippedTombstones,
    sessions: input.storage.sessions.list({
      providerId: input.context.providerId,
      ...(workspacePath !== undefined ? { workspacePath } : {}),
      includeTombstones: false,
    }),
  };
}

function providerSessionToStoredRecord(input: {
  providerSession: ProviderSession;
  local: StoredSessionRecord | undefined;
  workspacePath: string | undefined;
  syncedAt: string;
  createSessionId: () => string;
  storage: AgentProxyStorage;
}): StoredSessionRecord {
  const workspacePath =
    input.local?.workspacePath ?? input.providerSession.workspacePath ?? input.workspacePath;
  if (workspacePath === undefined || workspacePath.trim() === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "A workspace path is required before syncing provider sessions.",
      providerId: input.providerSession.providerId,
      operation: "sessions.sync",
      details: {
        providerSessionId: input.providerSession.providerSessionId,
        suggestion: "Pass a workspacePath in provider context or session sync query.",
      },
    });
  }

  const parentSessionId = resolveParentSessionId(input.storage, input.providerSession);
  const title = input.providerSession.title ?? input.local?.title;
  const model = input.providerSession.model ?? input.local?.model;
  const retainedParentSessionId = parentSessionId ?? input.local?.parentSessionId;
  const lastRunAt = input.providerSession.lastRunAt ?? input.local?.lastRunAt;
  const metadata = mergeSessionMetadata({
    localMetadata: input.local?.metadata ?? {},
    providerMetadata: input.providerSession.metadata,
    localWorkspacePath: workspacePath,
    providerWorkspacePath: input.providerSession.workspacePath,
    parentProviderSessionId: input.providerSession.parentProviderSessionId,
  });

  return {
    id: input.local?.id ?? input.createSessionId(),
    providerId: input.providerSession.providerId,
    providerSessionId: input.providerSession.providerSessionId,
    workspacePath,
    ...(title !== undefined ? { title } : {}),
    status: input.providerSession.status,
    ...(model !== undefined ? { model } : {}),
    ...(input.local?.runtimeId !== undefined ? { runtimeId: input.local.runtimeId } : {}),
    ...(retainedParentSessionId !== undefined ? { parentSessionId: retainedParentSessionId } : {}),
    createdAt: input.providerSession.createdAt ?? input.local?.createdAt ?? input.syncedAt,
    updatedAt:
      input.providerSession.updatedAt ??
      input.providerSession.lastRunAt ??
      input.local?.updatedAt ??
      input.syncedAt,
    ...(lastRunAt !== undefined ? { lastRunAt } : {}),
    lastSyncAt: input.syncedAt,
    ...(input.local?.lastError !== undefined ? { lastError: input.local.lastError } : {}),
    ...(input.local?.deletedAt !== undefined ? { deletedAt: input.local.deletedAt } : {}),
    ...(input.local?.tombstoneReason !== undefined
      ? { tombstoneReason: input.local.tombstoneReason }
      : {}),
    sourceOfTruth: AGENTPROXY_SESSION_SOURCE_OF_TRUTH,
    metadata,
  };
}

function providerSessionBelongsToWorkspace(
  providerSession: ProviderSession,
  local: StoredSessionRecord | undefined,
  workspacePath: string | undefined,
): boolean {
  if (workspacePath === undefined) {
    return true;
  }

  return local?.workspacePath === workspacePath || providerSession.workspacePath === workspacePath;
}

function resolveParentSessionId(
  storage: AgentProxyStorage,
  providerSession: ProviderSession,
): string | undefined {
  if (providerSession.parentProviderSessionId === undefined) {
    return undefined;
  }

  return storage.sessions.getByProviderSessionId(
    providerSession.providerId,
    providerSession.parentProviderSessionId,
  )?.id;
}

function mergeSessionMetadata(input: {
  localMetadata: ProviderMetadata;
  providerMetadata: ProviderMetadata;
  localWorkspacePath: string;
  providerWorkspacePath: string | undefined;
  parentProviderSessionId: string | undefined;
}): ProviderMetadata {
  return jsonSafeMetadata({
    ...input.localMetadata,
    ...input.providerMetadata,
    ...(input.providerWorkspacePath !== undefined &&
    input.providerWorkspacePath !== input.localWorkspacePath
      ? { providerWorkspacePath: input.providerWorkspacePath }
      : {}),
    ...(input.parentProviderSessionId !== undefined
      ? { parentProviderSessionId: input.parentProviderSessionId }
      : {}),
  });
}

function defaultCreateSessionId(): string {
  return `${AGENTPROXY_SYNC_SESSION_ID_PREFIX}_${randomUUID()}`;
}

function jsonSafeMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const serialized = JSON.stringify(redactValue(metadata));
  const parsed: unknown = serialized === undefined ? {} : JSON.parse(serialized);
  return isPlainObject(parsed) ? parsed : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
