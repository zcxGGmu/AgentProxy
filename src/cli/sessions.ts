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

export interface AgentProxySessionListReport {
  ok: true;
  providerId: string;
  workspacePath: string;
  source: AgentProxySessionListSource;
  sessions: AgentProxySessionSummary[];
}

const SESSIONS_LIST_OPERATION = "sessions.list";

export async function listAgentProxySessions(
  options: RunAgentProxySessionListOptions = {},
): Promise<AgentProxySessionListReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(config.providers.opencode.enabled);

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

function redactSessionListReport(report: AgentProxySessionListReport): AgentProxySessionListReport {
  return redactValue(report) as AgentProxySessionListReport;
}

function assertSessionsProviderSupported(providerId: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${providerId}`,
    operation: SESSIONS_LIST_OPERATION,
    providerId,
    details: {
      suggestion: "AgentProxy v1 session listing currently supports the opencode provider.",
    },
  });
}

function assertOpenCodeSessionsProviderEnabled(enabled: boolean): void {
  if (enabled) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenCode provider is disabled in AgentProxy config.",
    operation: SESSIONS_LIST_OPERATION,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      suggestion: "Enable providers.opencode.enabled before listing OpenCode sessions.",
    },
  });
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanText(value);
}
