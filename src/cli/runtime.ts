import { existsSync } from "node:fs";
import type { AgentProxyCliConfigOverrides } from "../config/index.js";
import { resolveAgentProxyConfig } from "../config/index.js";
import { createAgentProxyError } from "../core/index.js";
import { redactValue } from "../logging/index.js";
import { OPENCODE_PROVIDER_ID, normalizeRuntimeBaseUrl } from "../providers/opencode/index.js";
import { OpenCodeAttachedRuntimeManager, RuntimeRegistry } from "../runtimes/index.js";
import {
  openAgentProxyStorage,
  type AgentProxyStorage,
  type StoredRuntimeRecord,
} from "../storage/index.js";
import { sanitizeHumanInline, sanitizeHumanText } from "./run.js";

export interface RunAgentProxyRuntimeListOptions {
  providerId?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  now?: () => Date;
}

export interface RunAgentProxyRuntimeStopOptions {
  providerId?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  now?: () => Date;
}

export interface AgentProxyRuntimeListSource {
  storage: "absent" | "readonly";
  databaseExists: boolean;
}

export interface AgentProxyRuntimeStopSource {
  storage: "absent" | "readwrite";
  databaseExists: boolean;
}

export interface AgentProxyRuntimeSummary {
  id: string;
  providerId: string;
  mode: string;
  status: string;
  startedAt: string;
  baseUrl?: string;
  hostname?: string;
  port?: number;
  pid?: number;
  workspacePath?: string;
  stoppedAt?: string;
}

export interface AgentProxyRuntimeListReport {
  ok: true;
  providerId: string;
  workspacePath: string;
  source: AgentProxyRuntimeListSource;
  runtimes: AgentProxyRuntimeSummary[];
}

export interface AgentProxyRuntimeStopReport {
  ok: true;
  providerId: string;
  workspacePath: string;
  source: AgentProxyRuntimeStopSource;
  action: "detach_only";
  runtime: AgentProxyRuntimeSummary;
}

const RUNTIME_LIST_OPERATION = "runtime.list";
const RUNTIME_STOP_OPERATION = "runtime.stop";

export async function listAgentProxyRuntimes(
  options: RunAgentProxyRuntimeListOptions = {},
): Promise<AgentProxyRuntimeListReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertRuntimeProviderSupported(providerId, RUNTIME_LIST_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeRuntimeProviderEnabled(config.providers.opencode.enabled, RUNTIME_LIST_OPERATION);

  let storage: AgentProxyStorage | undefined;
  try {
    if (!existsSync(config.storage.path)) {
      return redactRuntimeListReport({
        ok: true,
        providerId,
        workspacePath: sanitizeMachineString(config.workspacePath),
        source: {
          storage: "absent",
          databaseExists: false,
        },
        runtimes: [],
      });
    }

    storage = openAgentProxyStorage({
      databasePath: config.storage.path,
      migrate: false,
      readonly: true,
      fileMustExist: true,
    });
    const registry = new RuntimeRegistry({
      storage,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const runtimes = registry
      .list({
        providerId,
        workspacePath: config.workspacePath,
      })
      .map(summarizeRuntime);

    return redactRuntimeListReport({
      ok: true,
      providerId,
      workspacePath: sanitizeMachineString(config.workspacePath),
      source: {
        storage: "readonly",
        databaseExists: true,
      },
      runtimes,
    });
  } finally {
    storage?.close();
  }
}

export async function stopAgentProxyRuntime(
  runtimeId: string,
  options: RunAgentProxyRuntimeStopOptions = {},
): Promise<AgentProxyRuntimeStopReport> {
  const providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
  assertRuntimeProviderSupported(providerId, RUNTIME_STOP_OPERATION);

  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });
  const config = resolvedConfig.config;
  assertOpenCodeRuntimeProviderEnabled(config.providers.opencode.enabled, RUNTIME_STOP_OPERATION);

  if (!existsSync(config.storage.path)) {
    throw createRuntimeStopNotFoundError(providerId);
  }

  const storage = openAgentProxyStorage({
    databasePath: config.storage.path,
    migrate: false,
    fileMustExist: true,
  });

  try {
    const registry = new RuntimeRegistry({
      storage,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const runtime = registry.get(runtimeId);
    if (!isVisibleRuntime(runtime, config.workspacePath, providerId)) {
      throw createRuntimeStopNotFoundError(providerId);
    }

    if (runtime.mode === "attached") {
      const attachedManager = new OpenCodeAttachedRuntimeManager({
        registry,
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
      const stopped = await attachedManager.stopAttachedRuntime({
        runtimeId,
        reason: "agentproxy-cli-runtime-stop",
      });

      return redactRuntimeStopReport({
        ok: true,
        providerId,
        workspacePath: sanitizeMachineString(config.workspacePath),
        source: {
          storage: "readwrite",
          databaseExists: true,
        },
        action: "detach_only",
        runtime: summarizeRuntime(stopped),
      });
    }

    throw createRuntimeStopManagedUnsupportedError(providerId);
  } finally {
    storage.close();
  }
}

export function formatRuntimeListHumanReport(report: AgentProxyRuntimeListReport): string {
  const lines = [`AgentProxy runtimes: ${report.runtimes.length.toString()}`];
  if (report.runtimes.length === 0) {
    lines.push("No runtime registry entries found for this provider and workspace.");
    return lines.join("\n");
  }

  for (const runtime of report.runtimes) {
    lines.push(
      `- ${sanitizeHumanInline(runtime.id)}: ${sanitizeHumanInline(
        runtime.mode,
      )}/${sanitizeHumanInline(runtime.status)}`,
    );
    if (runtime.baseUrl !== undefined) {
      lines.push(`  URL: ${sanitizeHumanInline(runtime.baseUrl)}`);
    }
    if (runtime.pid !== undefined) {
      lines.push(`  PID: ${runtime.pid.toString()}`);
    }
    lines.push(`  Started: ${sanitizeHumanInline(runtime.startedAt)}`);
    if (runtime.stoppedAt !== undefined) {
      lines.push(`  Stopped: ${sanitizeHumanInline(runtime.stoppedAt)}`);
    }
  }

  return lines.join("\n");
}

export function formatRuntimeStopHumanReport(report: AgentProxyRuntimeStopReport): string {
  const lines = [
    `Runtime detached: ${sanitizeHumanInline(report.runtime.id)}`,
    `Provider: ${sanitizeHumanInline(report.runtime.providerId)}`,
    `Mode: ${sanitizeHumanInline(report.runtime.mode)}`,
    `Status: ${sanitizeHumanInline(report.runtime.status)}`,
  ];

  if (report.runtime.baseUrl !== undefined) {
    lines.push(`URL: ${sanitizeHumanInline(report.runtime.baseUrl)}`);
  }
  if (report.runtime.pid !== undefined) {
    lines.push(`PID: ${report.runtime.pid.toString()}`);
  }
  lines.push(`Started: ${sanitizeHumanInline(report.runtime.startedAt)}`);
  if (report.runtime.stoppedAt !== undefined) {
    lines.push(`Stopped: ${sanitizeHumanInline(report.runtime.stoppedAt)}`);
  }

  return lines.join("\n");
}

function summarizeRuntime(runtime: StoredRuntimeRecord): AgentProxyRuntimeSummary {
  return {
    id: sanitizeMachineString(runtime.id),
    providerId: sanitizeMachineString(runtime.providerId),
    mode: sanitizeMachineString(runtime.mode),
    status: sanitizeMachineString(runtime.status),
    startedAt: sanitizeMachineString(runtime.startedAt),
    ...(runtime.baseUrl !== undefined
      ? optionalField("baseUrl", sanitizeBaseUrl(runtime.baseUrl))
      : {}),
    ...(runtime.hostname !== undefined
      ? { hostname: sanitizeMachineString(runtime.hostname) }
      : {}),
    ...(runtime.port !== undefined ? { port: runtime.port } : {}),
    ...(runtime.pid !== undefined ? { pid: runtime.pid } : {}),
    ...(runtime.workspacePath !== undefined
      ? { workspacePath: sanitizeMachineString(runtime.workspacePath) }
      : {}),
    ...(runtime.stoppedAt !== undefined
      ? { stoppedAt: sanitizeMachineString(runtime.stoppedAt) }
      : {}),
  };
}

function optionalField<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Record<TKey, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<TKey, string>);
}

function sanitizeBaseUrl(value: string): string | undefined {
  const normalized = normalizeRuntimeBaseUrl(value);
  if (normalized.baseUrl !== "") {
    return sanitizeMachineString(normalized.baseUrl);
  }

  return undefined;
}

function redactRuntimeListReport(report: AgentProxyRuntimeListReport): AgentProxyRuntimeListReport {
  return redactValue(report) as AgentProxyRuntimeListReport;
}

function redactRuntimeStopReport(report: AgentProxyRuntimeStopReport): AgentProxyRuntimeStopReport {
  return redactValue(report) as AgentProxyRuntimeStopReport;
}

function assertRuntimeProviderSupported(providerId: string, operation: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${providerId}`,
    operation,
    providerId,
    details: {
      suggestion: "AgentProxy v1 runtime commands currently support the opencode provider.",
    },
  });
}

function assertOpenCodeRuntimeProviderEnabled(enabled: boolean, operation: string): void {
  if (enabled) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenCode provider is disabled in AgentProxy config.",
    operation,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      suggestion: "Enable providers.opencode.enabled before using OpenCode runtime commands.",
    },
  });
}

function createRuntimeStopNotFoundError(providerId: string): Error {
  return createAgentProxyError({
    code: "SESSION_NOT_FOUND",
    message: "Runtime not found or not visible for the selected provider and workspace.",
    providerId,
    operation: RUNTIME_STOP_OPERATION,
    details: {
      suggestion: "Run agentproxy runtime list to inspect available runtime ids.",
    },
  });
}

function createRuntimeStopManagedUnsupportedError(providerId: string): Error {
  return createAgentProxyError({
    code: "CAPABILITY_UNSUPPORTED",
    message:
      "Only OpenCode managed runtimes owned by the current AgentProxy process can be stopped; registry-only managed runtimes are left unchanged.",
    providerId,
    operation: RUNTIME_STOP_OPERATION,
    details: {
      suggestion:
        "Start a managed runtime through a long-lived AgentProxy process or use attached runtime detach for external servers.",
    },
  });
}

function isVisibleRuntime(
  runtime: StoredRuntimeRecord | undefined,
  workspacePath: string,
  providerId: string,
): runtime is StoredRuntimeRecord {
  return (
    runtime !== undefined &&
    runtime.providerId === providerId &&
    runtime.workspacePath === workspacePath
  );
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanText(value);
}
