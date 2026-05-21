import { existsSync } from "node:fs";
import type { AgentProxyCliConfigOverrides } from "../config/index.js";
import { resolveAgentProxyConfig } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/index.js";
import { RuntimeRegistry } from "../runtimes/index.js";
import {
  abortAgentProxySession,
  deleteAgentProxySession,
  resumeAgentProxySession,
  sendAgentProxyMessage,
} from "../sessions/index.js";
import {
  openAgentProxyStorage,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";
import {
  formatRunEventForHuman,
  sanitizeHumanInline,
  sanitizeHumanText,
  sanitizeStructuredOutput,
  summarizeRunEvent,
  type AgentProxyRunEventSummary,
} from "./run.js";
import {
  createOpenCodeCommandProvider,
  ensureOpenCodeCommandRuntime,
  type AgentProxyOpenCodeCommandRuntimeSummary,
} from "./opencode-runtime.js";

export interface RunAgentProxySessionListOptions {
  providerId?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
}

export interface RunAgentProxySessionResumeOptions extends RunAgentProxySessionListOptions {
  prompt?: string;
  now?: () => Date;
  collectEvents?: boolean;
  maxEventSummaries?: number;
  timeoutMs?: number;
  onSessionResumed?: (session: AgentProxySessionResumeSessionSummary) => void;
  onEvent?: (event: AgentProxyRunEventSummary, humanOutput?: string) => void;
}

export interface RunAgentProxySessionAbortOptions extends RunAgentProxySessionListOptions {
  now?: () => Date;
}

export interface RunAgentProxySessionDeleteOptions extends RunAgentProxySessionListOptions {
  confirmed?: boolean;
  now?: () => Date;
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

export interface AgentProxySessionResumeRuntimeSummary {
  source: AgentProxyOpenCodeCommandRuntimeSummary["source"];
  mode: "managed" | "attached";
  startedByCommand: boolean;
  baseUrl: string;
  runtimeId?: string;
}

export interface AgentProxySessionResumeSessionSummary {
  sessionId: string;
  providerId: string;
  providerSessionId: string;
  status: string;
  runtime: AgentProxySessionResumeRuntimeSummary;
}

export interface AgentProxySessionResumeReport {
  ok: true;
  providerId: string;
  sessionId: string;
  providerSessionId: string;
  status: string;
  promptSent: boolean;
  model?: string;
  runtime: AgentProxySessionResumeRuntimeSummary;
  events: AgentProxyRunEventSummary[];
  eventsTruncated?: boolean;
  counts: {
    events: number;
    eventSummaries: number;
  };
  generatedAt: string;
}

export interface AgentProxySessionAbortReport {
  ok: true;
  providerId: string;
  sessionId: string;
  providerSessionId: string;
  status: string;
  runtime: AgentProxySessionResumeRuntimeSummary;
  action: {
    type: "abort";
    abortedAt: string;
  };
  generatedAt: string;
}

export interface AgentProxySessionDeleteReport {
  ok: true;
  providerId: string;
  sessionId: string;
  providerSessionId: string;
  runtime: AgentProxySessionResumeRuntimeSummary;
  action: {
    type: "delete";
    deletedAt: string;
    tombstoneReason: "provider_deleted";
  };
  generatedAt: string;
}

const SESSIONS_LIST_OPERATION = "sessions.list";
const SESSIONS_SHOW_OPERATION = "sessions.show";
const SESSIONS_RESUME_OPERATION = "sessions.resume";
const SESSIONS_ABORT_OPERATION = "sessions.abort";
const SESSIONS_DELETE_OPERATION = "sessions.delete";
const DEFAULT_RESUME_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_RESUME_PROMPT_BYTES = 1024 * 1024;
const DEFAULT_MAX_EVENT_SUMMARIES = 1000;

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

export async function resumeAgentProxyCliSession(
  sessionId: string,
  options: RunAgentProxySessionResumeOptions = {},
): Promise<AgentProxySessionResumeReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId, SESSIONS_RESUME_OPERATION);
  validateResumePrompt(options.prompt);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(
    config.providers.opencode.enabled,
    SESSIONS_RESUME_OPERATION,
  );

  let storage: AgentProxyStorage | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  let cleanupError: unknown;
  let report: AgentProxySessionResumeReport | undefined;
  let targetSessionId: string | undefined;
  const now = options.now ?? (() => new Date());
  const resumeController = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESUME_TIMEOUT_MS;
  let resumeTimedOut = false;
  const resumeTimeout = setTimeout(() => {
    resumeTimedOut = true;
    resumeController.abort();
  }, timeoutMs);
  resumeTimeout.unref();

  try {
    if (!existsSync(config.storage.path)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_RESUME_OPERATION);
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
    });

    const existing = storage.sessions.getById(sessionId);
    if (!isVisibleSession(existing, providerId, config.workspacePath)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_RESUME_OPERATION);
    }
    targetSessionId = existing.id;

    const registry = new RuntimeRegistry({
      storage,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const ensuredRuntime = await ensureOpenCodeCommandRuntime({
      config,
      storage,
      registry,
      env: options.env,
      operation: SESSIONS_RESUME_OPERATION,
    });
    cleanup = ensuredRuntime.cleanup;
    const runtime = summarizeResumeRuntime(ensuredRuntime.runtime);
    const provider = createOpenCodeCommandProvider({
      config,
      baseUrl: runtime.baseUrl,
      env: options.env,
      operation: SESSIONS_RESUME_OPERATION,
    });
    const resumed = await resumeAgentProxySession({
      provider,
      storage,
      context: {
        providerId,
        providerSessionId: existing.providerSessionId,
        sessionId: existing.id,
        workspacePath: config.workspacePath,
        signal: resumeController.signal,
        ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
        metadata: {
          runtimeBaseUrl: runtime.baseUrl,
          runtimeBaseUrlSource: runtime.source,
        },
      },
      now,
    });
    targetSessionId = resumed.session.id;
    options.onSessionResumed?.(summarizeResumedSession(resumed.session, runtime));

    const events: AgentProxyRunEventSummary[] = [];
    const prompt = options.prompt;
    const collectEvents = options.collectEvents ?? true;
    const maxEventSummaries = options.maxEventSummaries ?? DEFAULT_MAX_EVENT_SUMMARIES;
    let totalEvents = 0;
    let eventsTruncated = false;

    if (prompt !== undefined) {
      for await (const event of sendAgentProxyMessage({
        provider,
        storage,
        context: {
          providerId,
          providerSessionId: resumed.session.providerSessionId,
          agentproxySessionId: resumed.session.id,
          workspacePath: config.workspacePath,
          prompt,
          signal: resumeController.signal,
          ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
          metadata: {
            runtimeBaseUrl: runtime.baseUrl,
            runtimeBaseUrlSource: runtime.source,
          },
        },
        now,
      })) {
        const summary = summarizeRunEvent(event);
        totalEvents += 1;
        if (collectEvents && events.length < maxEventSummaries) {
          events.push(summary);
        } else if (collectEvents) {
          eventsTruncated = true;
        }
        options.onEvent?.(summary);
      }
    }

    if (resumeTimedOut) {
      markResumeTimedOut(storage, resumed.session.id, now().toISOString());
      throw createResumeTimeoutError(timeoutMs);
    }

    const finalSession = storage.sessions.getById(resumed.session.id) ?? resumed.session;
    report = {
      ok: true,
      providerId,
      sessionId: finalSession.id,
      providerSessionId: finalSession.providerSessionId,
      status: finalSession.status,
      promptSent: prompt !== undefined,
      ...(finalSession.model !== undefined ? { model: finalSession.model } : {}),
      runtime,
      events,
      ...(eventsTruncated ? { eventsTruncated } : {}),
      counts: {
        events: totalEvents,
        eventSummaries: events.length,
      },
      generatedAt: now().toISOString(),
    };
  } catch (error) {
    if (resumeTimedOut) {
      if (storage !== undefined && targetSessionId !== undefined) {
        markResumeTimedOut(storage, targetSessionId, now().toISOString());
      }
      throw createResumeTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(resumeTimeout);
    try {
      await cleanup?.();
    } catch (error) {
      cleanupError = error;
    } finally {
      storage?.close();
    }
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  if (report === undefined) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "agentproxy sessions resume finished without a report.",
      operation: SESSIONS_RESUME_OPERATION,
      providerId,
    });
  }

  return redactSessionResumeReport(report);
}

export async function abortAgentProxyCliSession(
  sessionId: string,
  options: RunAgentProxySessionAbortOptions = {},
): Promise<AgentProxySessionAbortReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId, SESSIONS_ABORT_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(
    config.providers.opencode.enabled,
    SESSIONS_ABORT_OPERATION,
  );

  let storage: AgentProxyStorage | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  let cleanupError: unknown;
  let report: AgentProxySessionAbortReport | undefined;
  const now = options.now ?? (() => new Date());

  try {
    if (!existsSync(config.storage.path)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_ABORT_OPERATION);
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
    });

    const existing = storage.sessions.getById(sessionId);
    if (!isVisibleSession(existing, providerId, config.workspacePath)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_ABORT_OPERATION);
    }

    const registry = new RuntimeRegistry({
      storage,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const ensuredRuntime = await ensureOpenCodeCommandRuntime({
      config,
      storage,
      registry,
      env: options.env,
      operation: SESSIONS_ABORT_OPERATION,
    });
    cleanup = ensuredRuntime.cleanup;
    const runtime = summarizeResumeRuntime(ensuredRuntime.runtime);
    const provider = createOpenCodeCommandProvider({
      config,
      baseUrl: runtime.baseUrl,
      env: options.env,
      operation: SESSIONS_ABORT_OPERATION,
    });
    const aborted = await abortAgentProxySession({
      provider,
      storage,
      context: {
        providerId,
        providerSessionId: existing.providerSessionId,
        sessionId: existing.id,
        workspacePath: config.workspacePath,
        ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
        metadata: {
          runtimeBaseUrl: runtime.baseUrl,
          runtimeBaseUrlSource: runtime.source,
        },
      },
      now,
    });
    const abortedAt = readAbortOperationTimestamp(aborted) ?? aborted.updatedAt;

    report = {
      ok: true,
      providerId,
      sessionId: aborted.id,
      providerSessionId: aborted.providerSessionId,
      status: aborted.status,
      runtime,
      action: {
        type: "abort",
        abortedAt,
      },
      generatedAt: now().toISOString(),
    };
  } finally {
    try {
      await cleanup?.();
    } catch (error) {
      cleanupError = error;
    } finally {
      storage?.close();
    }
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  if (report === undefined) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "agentproxy sessions abort finished without a report.",
      operation: SESSIONS_ABORT_OPERATION,
      providerId,
    });
  }

  return redactSessionAbortReport(report);
}

export async function deleteAgentProxyCliSession(
  sessionId: string,
  options: RunAgentProxySessionDeleteOptions = {},
): Promise<AgentProxySessionDeleteReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertSessionsProviderSupported(providerId, SESSIONS_DELETE_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeSessionsProviderEnabled(
    config.providers.opencode.enabled,
    SESSIONS_DELETE_OPERATION,
  );
  assertDeleteConfirmed(options.confirmed);

  let storage: AgentProxyStorage | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  let cleanupError: unknown;
  let report: AgentProxySessionDeleteReport | undefined;
  const now = options.now ?? (() => new Date());

  try {
    if (!existsSync(config.storage.path)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_DELETE_OPERATION);
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
    });

    const existing = storage.sessions.getById(sessionId);
    if (!isVisibleSession(existing, providerId, config.workspacePath)) {
      throw createSessionNotFoundError(sessionId, providerId, SESSIONS_DELETE_OPERATION);
    }

    const registry = new RuntimeRegistry({
      storage,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const ensuredRuntime = await ensureOpenCodeCommandRuntime({
      config,
      storage,
      registry,
      env: options.env,
      operation: SESSIONS_DELETE_OPERATION,
    });
    cleanup = ensuredRuntime.cleanup;
    const runtime = summarizeResumeRuntime(ensuredRuntime.runtime);
    const provider = createOpenCodeCommandProvider({
      config,
      baseUrl: runtime.baseUrl,
      env: options.env,
      operation: SESSIONS_DELETE_OPERATION,
    });
    const deleted = await deleteAgentProxySession({
      provider,
      storage,
      context: {
        providerId,
        providerSessionId: existing.providerSessionId,
        sessionId: existing.id,
        workspacePath: config.workspacePath,
        ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
        metadata: {
          runtimeBaseUrl: runtime.baseUrl,
          runtimeBaseUrlSource: runtime.source,
        },
      },
      confirmed: true,
      now,
    });

    report = {
      ok: true,
      providerId,
      sessionId: deleted.session.id,
      providerSessionId: deleted.session.providerSessionId,
      runtime,
      action: {
        type: "delete",
        deletedAt: deleted.deletedAt,
        tombstoneReason: "provider_deleted",
      },
      generatedAt: now().toISOString(),
    };
  } finally {
    try {
      await cleanup?.();
    } catch (error) {
      cleanupError = error;
    } finally {
      storage?.close();
    }
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  if (report === undefined) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "agentproxy sessions delete finished without a report.",
      operation: SESSIONS_DELETE_OPERATION,
      providerId,
    });
  }

  return redactSessionDeleteReport(report);
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

export function formatSessionResumeHumanEvent(
  event: AgentProxyRunEventSummary,
  humanOutput?: string,
): string | undefined {
  if (event.type === "message.delta") {
    return undefined;
  }
  return formatRunEventForHuman(event, humanOutput);
}

export function formatSessionResumeReportForJson(report: AgentProxySessionResumeReport): unknown {
  return sanitizeStructuredOutput(report);
}

export function formatSessionAbortHumanReport(report: AgentProxySessionAbortReport): string {
  return [
    `Session aborted: ${sanitizeHumanInline(report.sessionId)}`,
    `Provider session: ${sanitizeHumanInline(report.providerSessionId)}`,
    `Status: ${sanitizeHumanInline(report.status)}`,
    `Runtime: ${sanitizeHumanInline(report.runtime.runtimeId ?? "configured")} (${sanitizeHumanInline(
      report.runtime.mode,
    )})`,
    `Aborted: ${sanitizeHumanInline(report.action.abortedAt)}`,
  ].join("\n");
}

export function formatSessionAbortReportForJson(report: AgentProxySessionAbortReport): unknown {
  return sanitizeStructuredOutput(report);
}

export function formatSessionDeleteHumanReport(report: AgentProxySessionDeleteReport): string {
  return [
    `Session deleted: ${sanitizeHumanInline(report.sessionId)}`,
    `Provider session: ${sanitizeHumanInline(report.providerSessionId)}`,
    `Runtime: ${sanitizeHumanInline(report.runtime.runtimeId ?? "configured")} (${sanitizeHumanInline(
      report.runtime.mode,
    )})`,
    `Deleted: ${sanitizeHumanInline(report.action.deletedAt)}`,
    `Tombstone: ${sanitizeHumanInline(report.action.tombstoneReason)}`,
  ].join("\n");
}

export function formatSessionDeleteReportForJson(report: AgentProxySessionDeleteReport): unknown {
  return sanitizeStructuredOutput(report);
}

function summarizeResumeRuntime(
  runtime: AgentProxyOpenCodeCommandRuntimeSummary,
): AgentProxySessionResumeRuntimeSummary {
  return {
    source: runtime.source,
    mode: runtime.mode,
    startedByCommand: runtime.startedByCommand,
    baseUrl: runtime.baseUrl,
    ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
  };
}

function summarizeResumedSession(
  session: StoredSessionRecord,
  runtime: AgentProxySessionResumeRuntimeSummary,
): AgentProxySessionResumeSessionSummary {
  return {
    sessionId: session.id,
    providerId: session.providerId,
    providerSessionId: session.providerSessionId,
    status: session.status,
    runtime,
  };
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
  return sanitizeStructuredOutput(report);
}

function redactSessionShowReport(report: AgentProxySessionShowReport): AgentProxySessionShowReport {
  return sanitizeStructuredOutput(report);
}

function redactSessionResumeReport(
  report: AgentProxySessionResumeReport,
): AgentProxySessionResumeReport {
  return sanitizeStructuredOutput(report);
}

function redactSessionAbortReport(
  report: AgentProxySessionAbortReport,
): AgentProxySessionAbortReport {
  return sanitizeStructuredOutput(report);
}

function redactSessionDeleteReport(
  report: AgentProxySessionDeleteReport,
): AgentProxySessionDeleteReport {
  return sanitizeStructuredOutput(report);
}

function readAbortOperationTimestamp(session: StoredSessionRecord): string | undefined {
  const operations = session.metadata.sessionOperations;
  if (!isPlainObject(operations)) {
    return undefined;
  }
  const abort = operations.abort;
  if (!isPlainObject(abort)) {
    return undefined;
  }
  return typeof abort.abortedAt === "string" ? abort.abortedAt : undefined;
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

function createSessionNotFoundError(
  sessionId: string,
  providerId: string,
  operation = SESSIONS_SHOW_OPERATION,
): Error {
  const safeSessionId = sanitizeMachineString(sessionId);
  return createAgentProxyError({
    code: "SESSION_NOT_FOUND",
    message: `Session not found: ${safeSessionId}`,
    operation,
    providerId,
    details: {
      sessionId: safeSessionId,
      suggestion:
        "Run agentproxy sessions list for this provider and workspace, then retry with a visible AgentProxy session id.",
    },
  });
}

function validateResumePrompt(prompt: string | undefined): void {
  if (prompt === undefined) {
    return;
  }
  if (prompt.trim() === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "agentproxy sessions resume prompt must not be empty.",
      operation: SESSIONS_RESUME_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Omit --prompt for sync-only resume or pass non-empty prompt text.",
      },
    });
  }
  if (Buffer.byteLength(prompt, "utf8") > DEFAULT_MAX_RESUME_PROMPT_BYTES) {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "agentproxy sessions resume prompt exceeds the maximum supported size.",
      operation: SESSIONS_RESUME_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        maxPromptBytes: DEFAULT_MAX_RESUME_PROMPT_BYTES,
        suggestion: "Use a shorter prompt or reference files from the workspace.",
      },
    });
  }
}

function createResumeTimeoutError(timeoutMs: number): Error {
  return createAgentProxyError({
    code: "EVENT_STREAM_INTERRUPTED",
    message: "agentproxy sessions resume timed out while waiting for the provider.",
    operation: SESSIONS_RESUME_OPERATION,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      timeoutMs,
      suggestion: "Check the OpenCode runtime health or resume with a shorter prompt.",
    },
  });
}

function assertDeleteConfirmed(confirmed: boolean | undefined): void {
  if (confirmed === true) {
    return;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "Session delete requires explicit confirmation.",
    operation: SESSIONS_DELETE_OPERATION,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      failureReason: "confirmation_required",
      suggestion: "Pass --yes before retrying agentproxy sessions delete.",
    },
  });
}

function markResumeTimedOut(storage: AgentProxyStorage, sessionId: string, failedAt: string): void {
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
    lastError: "agentproxy sessions resume timed out.",
    metadata: {
      ...current.metadata,
      resume: {
        timedOutAt: failedAt,
      },
    },
  });
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanText(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
