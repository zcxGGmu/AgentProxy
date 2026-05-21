import { existsSync } from "node:fs";
import type { AgentProxyCliConfigOverrides } from "../config/index.js";
import { resolveAgentProxyConfig } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { redactValue } from "../logging/index.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/index.js";
import {
  openAgentProxyStorage,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";
import { sanitizeHumanInline, sanitizeHumanText } from "./run.js";

export interface RunAgentProxySessionListOptions {
  providerId?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
}

export interface AgentProxySessionListSource {
  storage: "absent" | "readonly";
  databaseExists: boolean;
}

export interface AgentProxySessionSummary {
  id: string;
  providerId: string;
  providerSessionId: string;
  workspacePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  model?: string;
  runtimeId?: string;
  parentSessionId?: string;
  lastRunAt?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface AgentProxySessionDetail extends AgentProxySessionSummary {
  sourceOfTruth?: string;
}

export interface AgentProxySessionListReport {
  ok: true;
  providerId: string;
  workspacePath: string;
  source: AgentProxySessionListSource;
  sessions: AgentProxySessionSummary[];
}

export interface AgentProxySessionShowReport {
  ok: true;
  providerId: string;
  workspacePath: string;
  source: AgentProxySessionListSource;
  session: AgentProxySessionDetail;
}

const SESSIONS_LIST_OPERATION = "sessions.list";
const SESSIONS_SHOW_OPERATION = "sessions.show";

export async function listAgentProxySessions(
  options: RunAgentProxySessionListOptions = {},
): Promise<AgentProxySessionListReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId, SESSIONS_LIST_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(config.providers.opencode.enabled, SESSIONS_LIST_OPERATION);

  let storage: AgentProxyStorage | undefined;
  try {
    if (!existsSync(config.storage.path)) {
      return redactSessionListReport({
        ok: true,
        providerId,
        workspacePath: sanitizeMachineString(config.workspacePath),
        source: {
          storage: "absent",
          databaseExists: false,
        },
        sessions: [],
      });
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    const sessions = storage.sessions
      .list({
        providerId,
        workspacePath: config.workspacePath,
        includeTombstones: false,
      })
      .map(summarizeSession);

    return redactSessionListReport({
      ok: true,
      providerId,
      workspacePath: sanitizeMachineString(config.workspacePath),
      source: {
        storage: "readonly",
        databaseExists: true,
      },
      sessions,
    });
  } finally {
    storage?.close();
  }
}

export async function showAgentProxySession(
  sessionId: string,
  options: RunAgentProxySessionListOptions = {},
): Promise<AgentProxySessionShowReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId, SESSIONS_SHOW_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(config.providers.opencode.enabled, SESSIONS_SHOW_OPERATION);

  let storage: AgentProxyStorage | undefined;
  try {
    if (!existsSync(config.storage.path)) {
      throw createSessionNotFoundError(sessionId, providerId);
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });

    const session = storage.sessions.getById(sessionId);
    if (!isVisibleSession(session, providerId, config.workspacePath)) {
      throw createSessionNotFoundError(sessionId, providerId);
    }

    return redactSessionShowReport({
      ok: true,
      providerId,
      workspacePath: sanitizeMachineString(config.workspacePath),
      source: {
        storage: "readonly",
        databaseExists: true,
      },
      session: detailSession(session),
    });
  } finally {
    storage?.close();
  }
}

export function formatSessionListHumanReport(report: AgentProxySessionListReport): string {
  const lines = [`AgentProxy sessions: ${report.sessions.length.toString()}`];
  if (report.sessions.length === 0) {
    lines.push("No session registry entries found for this provider and workspace.");
    return lines.join("\n");
  }

  for (const session of report.sessions) {
    const title = session.title === undefined ? "" : ` ${sanitizeHumanInline(session.title)}`;
    lines.push(
      `- ${sanitizeHumanInline(session.id)}: ${sanitizeHumanInline(session.status)}${title}`,
    );
    lines.push(`  Provider session: ${sanitizeHumanInline(session.providerSessionId)}`);
    if (session.model !== undefined) {
      lines.push(`  Model: ${sanitizeHumanInline(session.model)}`);
    }
    if (session.runtimeId !== undefined) {
      lines.push(`  Runtime: ${sanitizeHumanInline(session.runtimeId)}`);
    }
    lines.push(`  Updated: ${sanitizeHumanInline(session.updatedAt)}`);
    if (session.lastRunAt !== undefined) {
      lines.push(`  Last run: ${sanitizeHumanInline(session.lastRunAt)}`);
    }
    if (session.lastError !== undefined) {
      lines.push(`  Last error: ${sanitizeHumanInline(session.lastError)}`);
    }
  }

  return lines.join("\n");
}

export function formatSessionShowHumanReport(report: AgentProxySessionShowReport): string {
  const session = report.session;
  const lines = [`AgentProxy session: ${sanitizeHumanInline(session.id)}`];

  lines.push(`Status: ${sanitizeHumanInline(session.status)}`);
  if (session.title !== undefined) {
    lines.push(`Title: ${sanitizeHumanInline(session.title)}`);
  }
  lines.push(`Provider: ${sanitizeHumanInline(session.providerId)}`);
  lines.push(`Provider session: ${sanitizeHumanInline(session.providerSessionId)}`);
  lines.push(`Workspace: ${sanitizeHumanInline(session.workspacePath)}`);
  if (session.model !== undefined) {
    lines.push(`Model: ${sanitizeHumanInline(session.model)}`);
  }
  if (session.runtimeId !== undefined) {
    lines.push(`Runtime: ${sanitizeHumanInline(session.runtimeId)}`);
  }
  if (session.parentSessionId !== undefined) {
    lines.push(`Parent session: ${sanitizeHumanInline(session.parentSessionId)}`);
  }
  lines.push(`Created: ${sanitizeHumanInline(session.createdAt)}`);
  lines.push(`Updated: ${sanitizeHumanInline(session.updatedAt)}`);
  if (session.lastRunAt !== undefined) {
    lines.push(`Last run: ${sanitizeHumanInline(session.lastRunAt)}`);
  }
  if (session.lastSyncAt !== undefined) {
    lines.push(`Last sync: ${sanitizeHumanInline(session.lastSyncAt)}`);
  }
  if (session.lastError !== undefined) {
    lines.push(`Last error: ${sanitizeHumanInline(session.lastError)}`);
  }
  if (session.sourceOfTruth !== undefined) {
    lines.push(`Source of truth: ${sanitizeHumanInline(session.sourceOfTruth)}`);
  }

  return lines.join("\n");
}

function summarizeSession(session: StoredSessionRecord): AgentProxySessionSummary {
  return {
    id: sanitizeMachineString(session.id),
    providerId: sanitizeMachineString(session.providerId),
    providerSessionId: sanitizeMachineString(session.providerSessionId),
    workspacePath: sanitizeMachineString(session.workspacePath),
    status: sanitizeMachineString(session.status),
    createdAt: sanitizeMachineString(session.createdAt),
    updatedAt: sanitizeMachineString(session.updatedAt),
    ...(session.title !== undefined ? { title: sanitizeMachineString(session.title) } : {}),
    ...(session.model !== undefined ? { model: sanitizeMachineString(session.model) } : {}),
    ...(session.runtimeId !== undefined
      ? { runtimeId: sanitizeMachineString(session.runtimeId) }
      : {}),
    ...(session.parentSessionId !== undefined
      ? { parentSessionId: sanitizeMachineString(session.parentSessionId) }
      : {}),
    ...(session.lastRunAt !== undefined
      ? { lastRunAt: sanitizeMachineString(session.lastRunAt) }
      : {}),
    ...(session.lastSyncAt !== undefined
      ? { lastSyncAt: sanitizeMachineString(session.lastSyncAt) }
      : {}),
    ...(session.lastError !== undefined
      ? { lastError: sanitizeMachineString(session.lastError) }
      : {}),
  };
}

function detailSession(session: StoredSessionRecord): AgentProxySessionDetail {
  return {
    ...summarizeSession(session),
    ...(session.sourceOfTruth !== undefined
      ? { sourceOfTruth: sanitizeMachineString(session.sourceOfTruth) }
      : {}),
  };
}

function redactSessionListReport(report: AgentProxySessionListReport): AgentProxySessionListReport {
  return redactValue(report) as AgentProxySessionListReport;
}

function redactSessionShowReport(report: AgentProxySessionShowReport): AgentProxySessionShowReport {
  return redactValue(report) as AgentProxySessionShowReport;
}

function assertSessionsProviderSupported(providerId: string, operation: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  const safeProviderId = sanitizeMachineString(providerId);
  throw createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${safeProviderId}`,
    operation,
    providerId: safeProviderId,
    details: {
      suggestion: "AgentProxy v1 session commands currently support the opencode provider.",
    },
  });
}

function assertOpenCodeSessionsProviderEnabled(enabled: boolean, operation: string): void {
  if (enabled) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenCode provider is disabled in AgentProxy config.",
    operation,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      suggestion: "Enable providers.opencode.enabled before using OpenCode session commands.",
    },
  });
}

function isVisibleSession(
  session: StoredSessionRecord | undefined,
  providerId: string,
  workspacePath: string,
): session is StoredSessionRecord {
  return (
    session !== undefined &&
    session.providerId === providerId &&
    session.workspacePath === workspacePath &&
    session.deletedAt === undefined
  );
}

function createSessionNotFoundError(sessionId: string, providerId: string): Error {
  const safeSessionId = sanitizeMachineString(sessionId);
  return createAgentProxyError({
    code: "SESSION_NOT_FOUND",
    message: `Session not found: ${safeSessionId}`,
    operation: SESSIONS_SHOW_OPERATION,
    providerId,
    details: {
      sessionId: safeSessionId,
      suggestion:
        "Run agentproxy sessions list for this provider and workspace, then retry with a visible AgentProxy session id.",
    },
  });
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanText(value);
}
