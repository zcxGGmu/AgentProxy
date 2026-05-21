import {
  type AgentProxyCliConfigOverrides,
  type AgentProxyConfig,
  resolveAgentProxyConfig,
} from "../config/index.js";
import { type AgentEvent, createAgentProxyError } from "../core/index.js";
import { redactString, redactValue } from "../logging/index.js";
import {
  OPENCODE_PROVIDER_ID,
  OpenCodeProvider,
  normalizeRuntimeBaseUrl,
} from "../providers/opencode/index.js";
import {
  OpenCodeManagedRuntimeManager,
  RuntimeRegistry,
  selectOpenCodeRuntimeBaseUrl,
  type OpenCodeRuntimeBaseUrlSelection,
} from "../runtimes/index.js";
import { sendAgentProxyMessage, startAgentProxySession } from "../sessions/index.js";
import {
  openAgentProxyStorage,
  type AgentProxyStorage,
  type StoredSessionRecord,
} from "../storage/index.js";

export interface RunPromptStdinSource extends AsyncIterable<string | Buffer | Uint8Array> {}

export interface RunAgentProxyPromptInput {
  providerId: string;
  prompt?: string;
  model?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  stdin?: RunPromptStdinSource;
  now?: () => Date;
  collectEvents?: boolean;
  maxEventSummaries?: number;
  maxPromptBytes?: number;
  timeoutMs?: number;
  onSessionStarted?: (session: AgentProxyRunSessionSummary) => void;
  onEvent?: (event: AgentProxyRunEventSummary, humanOutput?: string) => void;
}

export interface AgentProxyRunSessionSummary {
  sessionId: string;
  providerId: string;
  providerSessionId: string;
  status: string;
  runtime: AgentProxyRunRuntimeSummary;
}

export interface AgentProxyRunRuntimeSummary {
  source: OpenCodeRuntimeBaseUrlSelection["source"];
  mode: "managed" | "attached";
  startedByRun: boolean;
  baseUrl: string;
  runtimeId?: string;
}

export type AgentProxyRunEventSummary =
  | {
      type: "message.delta";
      role: "assistant" | "user" | "system" | "tool";
      deltaBytes: number;
      messageId?: string;
    }
  | {
      type: "tool.started" | "tool.finished";
      toolCallId: string;
      toolName: string;
      durationMs?: number;
    }
  | {
      type: "permission.requested";
      permissionId: string;
      action: string;
    }
  | {
      type: "permission.resolved";
      permissionId: string;
      decision: "approved" | "denied";
    }
  | {
      type: "file.changed";
      path: string;
      change: string;
    }
  | {
      type: "diff.updated";
    }
  | {
      type: "session.completed";
      status: "completed" | "failed" | "aborted";
    }
  | {
      type: "session.status_changed";
      from: string;
      to: string;
    }
  | {
      type: "session.started";
      providerSessionId: string;
      agentproxySessionId?: string;
      workspacePath?: string;
      model?: string;
    }
  | {
      type: "provider.raw_event";
      providerEventType: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export interface AgentProxyRunReport {
  ok: true;
  providerId: string;
  sessionId: string;
  providerSessionId: string;
  status: string;
  model?: string;
  runtime: AgentProxyRunRuntimeSummary;
  events: AgentProxyRunEventSummary[];
  eventsTruncated?: boolean;
  counts: {
    events: number;
    eventSummaries: number;
  };
  generatedAt: string;
}

interface EnsuredRunRuntime {
  runtime: AgentProxyRunRuntimeSummary;
  cleanup?: () => Promise<void>;
}

const RUN_OPERATION = "run";
const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PROMPT_BYTES = 1024 * 1024;
const DEFAULT_MAX_EVENT_SUMMARIES = 1000;
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

export async function runAgentProxyPrompt(
  input: RunAgentProxyPromptInput,
): Promise<AgentProxyRunReport> {
  const maxPromptBytes = input.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
  const prompt = await resolvePrompt(input.prompt, input.stdin, maxPromptBytes);
  assertRunProviderSupported(input.providerId);
  validateOpenCodeRunModel(input.model);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.homeDir !== undefined ? { homeDir: input.homeDir } : {}),
    ...(input.env !== undefined ? { env: input.env } : {}),
    ...(input.cli !== undefined ? { cli: input.cli } : {}),
  });
  const config = resolvedConfig.config;
  const storage = openAgentProxyStorage({ databasePath: config.storage.path });
  let cleanup: (() => Promise<void>) | undefined;
  let cleanupError: unknown;
  let report: AgentProxyRunReport | undefined;
  let runSessionId: string | undefined;
  const runController = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const now = input.now ?? (() => new Date());
  let runTimedOut = false;
  const runTimeout = setTimeout(() => {
    runTimedOut = true;
    runController.abort();
  }, timeoutMs);
  runTimeout.unref();

  try {
    const registry = new RuntimeRegistry({
      storage,
      ...(input.now !== undefined ? { now: input.now } : {}),
    });
    const ensuredRuntime = await ensureRunRuntime({
      config,
      storage,
      registry,
      env: input.env,
    });
    cleanup = ensuredRuntime.cleanup;
    const provider = createRunProvider(config, ensuredRuntime.runtime.baseUrl, input.env);
    const started = await startAgentProxySession({
      provider,
      storage,
      context: {
        providerId: input.providerId,
        workspacePath: config.workspacePath,
        signal: runController.signal,
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(ensuredRuntime.runtime.runtimeId !== undefined
          ? { runtimeId: ensuredRuntime.runtime.runtimeId }
          : {}),
        metadata: {
          runtimeBaseUrl: ensuredRuntime.runtime.baseUrl,
          runtimeBaseUrlSource: ensuredRuntime.runtime.source,
        },
      },
      now,
    });
    runSessionId = started.session.id;
    input.onSessionStarted?.(summarizeStartedSession(started.session, ensuredRuntime.runtime));

    const events: AgentProxyRunEventSummary[] = [];
    const collectEvents = input.collectEvents ?? true;
    const maxEventSummaries = input.maxEventSummaries ?? DEFAULT_MAX_EVENT_SUMMARIES;
    let totalEvents = 0;
    let eventsTruncated = false;
    for await (const event of sendAgentProxyMessage({
      provider,
      storage,
      context: {
        providerId: input.providerId,
        providerSessionId: started.session.providerSessionId,
        agentproxySessionId: started.session.id,
        workspacePath: config.workspacePath,
        prompt,
        signal: runController.signal,
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(ensuredRuntime.runtime.runtimeId !== undefined
          ? { runtimeId: ensuredRuntime.runtime.runtimeId }
          : {}),
        metadata: {
          runtimeBaseUrl: ensuredRuntime.runtime.baseUrl,
          runtimeBaseUrlSource: ensuredRuntime.runtime.source,
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
      input.onEvent?.(summary, formatRawRunEventForHuman(event));
    }

    if (runTimedOut) {
      markRunTimedOut(storage, started.session.id, now().toISOString());
      throw createRunTimeoutError(timeoutMs);
    }

    const finalSession = storage.sessions.getById(started.session.id) ?? started.session;
    report = {
      ok: true,
      providerId: input.providerId,
      sessionId: finalSession.id,
      providerSessionId: finalSession.providerSessionId,
      status: finalSession.status,
      ...(input.model !== undefined ? { model: input.model } : {}),
      runtime: ensuredRuntime.runtime,
      events,
      ...(eventsTruncated ? { eventsTruncated } : {}),
      counts: {
        events: totalEvents,
        eventSummaries: events.length,
      },
      generatedAt: now().toISOString(),
    };
  } catch (error) {
    if (runTimedOut) {
      if (runSessionId !== undefined) {
        markRunTimedOut(storage, runSessionId, now().toISOString());
      }
      throw createRunTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(runTimeout);
    try {
      await cleanup?.();
    } catch (error) {
      cleanupError = error;
    } finally {
      storage.close();
    }
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  if (report === undefined) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "agentproxy run finished without a run report.",
      operation: RUN_OPERATION,
      providerId: input.providerId,
    });
  }

  return report;
}

export function formatRunReportForJson(report: AgentProxyRunReport): unknown {
  return redactValue(report);
}

export function formatRunEventForHuman(
  event: AgentProxyRunEventSummary,
  humanOutput?: string,
): string | undefined {
  switch (event.type) {
    case "message.delta":
      return humanOutput;
    case "permission.requested":
      return `Permission requested: ${sanitizeHumanInline(event.action)} (${sanitizeHumanInline(
        event.permissionId,
      )})`;
    case "permission.resolved":
      return `Permission ${sanitizeHumanInline(event.decision)}: ${sanitizeHumanInline(
        event.permissionId,
      )}`;
    case "tool.started":
      return `Tool started: ${sanitizeHumanInline(event.toolName)}`;
    case "tool.finished":
      return `Tool finished: ${sanitizeHumanInline(event.toolName)}`;
    case "file.changed":
      return `File ${sanitizeHumanInline(event.change)}: ${sanitizeHumanInline(event.path)}`;
    case "session.completed":
      return undefined;
    case "session.status_changed":
    case "session.started":
    case "diff.updated":
    case "provider.raw_event":
    case "error":
      return undefined;
  }
}

async function resolvePrompt(
  prompt: string | undefined,
  stdin: RunPromptStdinSource | undefined,
  maxPromptBytes: number,
): Promise<string> {
  const value = prompt === undefined ? await readStdinPrompt(stdin, maxPromptBytes) : prompt;
  if (value.trim() === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "A prompt is required for agentproxy run.",
      operation: RUN_OPERATION,
      details: {
        suggestion: "Pass a prompt argument or pipe prompt text into stdin.",
      },
    });
  }
  assertPromptSize(value, maxPromptBytes);

  return value;
}

async function readStdinPrompt(
  stdin: RunPromptStdinSource | undefined,
  maxPromptBytes: number,
): Promise<string> {
  const source = stdin ?? defaultStdinSource();
  if (source === undefined) {
    return "";
  }

  let value = "";
  let totalBytes = 0;
  for await (const chunk of source) {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    totalBytes += Buffer.byteLength(text, "utf8");
    if (totalBytes > maxPromptBytes) {
      throw createPromptTooLargeError(maxPromptBytes);
    }
    value += text;
  }

  return value;
}

function assertPromptSize(prompt: string, maxPromptBytes: number): void {
  if (Buffer.byteLength(prompt, "utf8") <= maxPromptBytes) {
    return;
  }

  throw createPromptTooLargeError(maxPromptBytes);
}

function createPromptTooLargeError(maxPromptBytes: number): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "agentproxy run prompt exceeds the maximum supported size.",
    operation: RUN_OPERATION,
    details: {
      maxPromptBytes,
      suggestion: "Use a shorter prompt or reference files from the workspace.",
    },
  });
}

function createRunTimeoutError(timeoutMs: number): Error {
  return createAgentProxyError({
    code: "EVENT_STREAM_INTERRUPTED",
    message: "agentproxy run timed out while waiting for the provider event stream.",
    operation: RUN_OPERATION,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      timeoutMs,
      suggestion: "Check the OpenCode runtime health or run with a shorter prompt.",
    },
  });
}

function markRunTimedOut(storage: AgentProxyStorage, sessionId: string, failedAt: string): void {
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
    lastError: "agentproxy run timed out.",
    metadata: {
      ...current.metadata,
      run: {
        timedOutAt: failedAt,
      },
    },
  });
}

function defaultStdinSource(): RunPromptStdinSource | undefined {
  return process.stdin.isTTY ? undefined : process.stdin;
}

function assertRunProviderSupported(providerId: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${providerId}`,
    operation: RUN_OPERATION,
    providerId,
    details: {
      suggestion: "AgentProxy v1 run currently supports the opencode provider.",
    },
  });
}

function validateOpenCodeRunModel(model: string | undefined): void {
  if (model === undefined) {
    return;
  }

  const separatorIndex = model.indexOf("/");
  if (separatorIndex > 0 && separatorIndex < model.length - 1) {
    return;
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "OpenCode prompt model must use the provider/model format.",
    operation: RUN_OPERATION,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      failureReason: "invalid_model",
      suggestion:
        "Pass a model id returned by OpenCodeProvider.listModels(), such as provider/model.",
    },
  });
}

async function ensureRunRuntime(input: {
  config: AgentProxyConfig;
  storage: AgentProxyStorage;
  registry: RuntimeRegistry;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
}): Promise<EnsuredRunRuntime> {
  const selected = selectOpenCodeRuntimeBaseUrl(input.config, input.registry);
  if (selected.baseUrl !== undefined) {
    return {
      runtime: {
        source: selected.source,
        mode: selected.mode ?? input.config.providers.opencode.runtime.mode,
        startedByRun: false,
        baseUrl: normalizeRunRuntimeBaseUrl(selected.baseUrl),
        ...(selected.runtimeId !== undefined ? { runtimeId: selected.runtimeId } : {}),
      },
    };
  }

  const opencode = input.config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: RUN_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Enable providers.opencode.enabled before running OpenCode workflows.",
      },
    });
  }

  if (opencode.runtime.mode !== "managed") {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "No OpenCode runtime base URL is available for agentproxy run.",
      operation: RUN_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        runtimeMode: opencode.runtime.mode,
        suggestion:
          "Set providers.opencode.runtime.baseUrl, register an attached runtime, or switch to managed runtime mode.",
      },
    });
  }

  const manager = new OpenCodeManagedRuntimeManager({
    storage: input.storage,
    binary: opencode.binary,
    inheritParentEnv: false,
    cwd: input.config.workspacePath,
    env: createManagedRuntimeEnv(input.config, input.env),
  });
  const runtime = await manager.startManagedRuntime({
    workspacePath: input.config.workspacePath,
    hostname: opencode.runtime.hostname,
    port: opencode.runtime.port,
  });
  if (runtime.baseUrl === undefined) {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "OpenCode managed runtime started without a base URL.",
      operation: RUN_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        runtimeId: runtime.id,
      },
    });
  }

  return {
    runtime: {
      source: "registry",
      mode: "managed",
      startedByRun: true,
      baseUrl: normalizeRunRuntimeBaseUrl(runtime.baseUrl),
      runtimeId: runtime.id,
    },
    cleanup: async () => {
      await manager.stopManagedRuntime(runtime.id);
    },
  };
}

function createRunProvider(
  config: AgentProxyConfig,
  baseUrl: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): OpenCodeProvider {
  const opencode = config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: RUN_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Enable providers.opencode.enabled before running OpenCode workflows.",
      },
    });
  }

  return new OpenCodeProvider({
    binary: opencode.binary,
    baseUrl,
    cwd: config.workspacePath,
    passthroughEnv: opencode.passthroughEnv,
    ...(env !== undefined ? { env } : {}),
  });
}

function createManagedRuntimeEnv(
  config: AgentProxyConfig,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): Record<string, string | undefined> {
  return {
    PATH: env?.PATH ?? process.env.PATH,
    Path: env?.Path ?? process.env.Path,
    HOME: env?.HOME ?? process.env.HOME,
    USER: env?.USER ?? process.env.USER,
    TMPDIR: env?.TMPDIR ?? process.env.TMPDIR,
    ...config.providers.opencode.passthroughEnv,
  };
}

function normalizeRunRuntimeBaseUrl(baseUrl: string): string {
  const normalized = normalizeRuntimeBaseUrl(baseUrl);
  if (normalized.failureReason !== undefined || normalized.baseUrl === "") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL is invalid for agentproxy run.",
      operation: RUN_OPERATION,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        failureReason: normalized.failureReason ?? "invalid_url",
        suggestion: "Use an http(s) OpenCode runtime URL without credentials.",
      },
    });
  }

  return normalized.baseUrl;
}

function summarizeStartedSession(
  session: StoredSessionRecord,
  runtime: AgentProxyRunRuntimeSummary,
): AgentProxyRunSessionSummary {
  return {
    sessionId: session.id,
    providerId: session.providerId,
    providerSessionId: session.providerSessionId,
    status: session.status,
    runtime,
  };
}

function summarizeRunEvent(event: AgentEvent): AgentProxyRunEventSummary {
  switch (event.type) {
    case "message.delta":
      return redactSummary({
        type: event.type,
        role: event.role,
        deltaBytes: Buffer.byteLength(event.delta, "utf8"),
        ...(event.messageId !== undefined ? { messageId: event.messageId } : {}),
      });
    case "tool.started":
      return redactSummary({
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      });
    case "tool.finished":
      return redactSummary({
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      });
    case "permission.requested":
      return redactSummary({
        type: event.type,
        permissionId: event.permissionId,
        action: event.action,
      });
    case "permission.resolved":
      return redactSummary({
        type: event.type,
        permissionId: event.permissionId,
        decision: event.decision,
      });
    case "file.changed":
      return redactSummary({
        type: event.type,
        path: event.path,
        change: event.change,
      });
    case "diff.updated":
      return {
        type: event.type,
      };
    case "session.completed":
      return redactSummary({
        type: event.type,
        status: event.status,
      });
    case "session.status_changed":
      return redactSummary({
        type: event.type,
        from: event.from,
        to: event.to,
      });
    case "session.started":
      return redactSummary({
        type: event.type,
        providerSessionId: event.providerSessionId,
        ...(event.agentproxySessionId !== undefined
          ? { agentproxySessionId: event.agentproxySessionId }
          : {}),
        ...(event.workspacePath !== undefined ? { workspacePath: event.workspacePath } : {}),
        ...(event.model !== undefined ? { model: event.model } : {}),
      });
    case "provider.raw_event":
      return redactSummary({
        type: event.type,
        providerEventType: event.providerEventType,
      });
    case "error":
      return redactSummary({
        type: event.type,
        code: event.code,
        message: "Provider reported a session error.",
      });
  }
}

function formatRawRunEventForHuman(event: AgentEvent): string | undefined {
  switch (event.type) {
    case "message.delta":
      return sanitizeHumanText(event.delta);
    case "tool.started":
    case "tool.finished":
    case "permission.requested":
    case "permission.resolved":
    case "file.changed":
    case "diff.updated":
    case "session.completed":
    case "session.status_changed":
    case "session.started":
    case "provider.raw_event":
    case "error":
      return undefined;
  }
}

export function sanitizeHumanInline(value: string): string {
  return sanitizeHumanText(value)
    .replace(/[\n\t]+/gu, " ")
    .trim();
}

export function sanitizeHumanText(value: string): string {
  return redactString(value).replace(ANSI_ESCAPE_PATTERN, "").replace(UNSAFE_CONTROL_PATTERN, "");
}

function redactSummary<TSummary extends AgentProxyRunEventSummary>(summary: TSummary): TSummary {
  return redactValue(summary) as TSummary;
}
