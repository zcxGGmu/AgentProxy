import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  type AgentProxyCliConfigOverrides,
  type AgentProxyConfig,
  type ResolvedAgentProxyConfig,
  resolveAgentProxyConfig,
} from "../config/index.js";
import {
  createAgentProxyError,
  isAgentProxyError,
  type AgentProxyErrorCode,
  type ProviderMetadata,
} from "../core/index.js";
import { redactString, redactValue } from "../logging/index.js";
import {
  OPENCODE_PROVIDER_ID,
  OpenCodeProvider,
  type OpenCodeProviderOptions,
} from "../providers/opencode/index.js";
import type { ProviderCapabilities, ProviderHealth } from "../providers/types.js";
import {
  OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS,
  OpenCodeRuntimeDiagnostics,
  RuntimeRegistry,
  type OpenCodeRuntimeDiagnosticCheck,
  type OpenCodeRuntimeDiagnosticReport,
} from "../runtimes/index.js";
import {
  openAgentProxyStorage,
  type AgentProxyStorage,
  type StoredRuntimeRecord,
} from "../storage/index.js";

export type AgentProxyDoctorCheckStatus = "passed" | "failed" | "skipped" | "warning";

export interface AgentProxyDoctorCheck {
  id: string;
  label: string;
  status: AgentProxyDoctorCheckStatus;
  message: string;
  providerId?: string;
  runtimeId?: string;
  errorCode?: AgentProxyErrorCode;
  details: ProviderMetadata;
  durationMs: number;
}

export interface AgentProxyDoctorCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  warning: number;
}

export interface AgentProxyDoctorReport {
  ok: boolean;
  version: string;
  providerId: typeof OPENCODE_PROVIDER_ID;
  generatedAt: string;
  counts: AgentProxyDoctorCounts;
  checks: AgentProxyDoctorCheck[];
  runtimeDiagnostics?: OpenCodeRuntimeDiagnosticReport;
}

export interface RunAgentProxyDoctorOptions {
  agentProxyVersion: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  includeManagedSmoke?: boolean;
  nodeVersion?: string;
  now?: () => Date;
}

export interface FormatDoctorHumanReportOptions {
  verbose?: boolean;
  debug?: boolean;
}

interface ConfigCheckResult {
  resolved?: ResolvedAgentProxyConfig;
  check: AgentProxyDoctorCheck;
}

interface StorageCheckResult {
  storage?: AgentProxyStorage;
  registry?: RuntimeRegistry;
  check: AgentProxyDoctorCheck;
}

interface RuntimeBaseUrlSelection {
  baseUrl?: string;
  source: "config" | "registry" | "none";
  runtimeId?: string;
}

const MINIMUM_NODE_VERSION = ">=22.0.0";
const DEFAULT_DOCTOR_REQUEST_TIMEOUT_MS = 1_000;
const DOCTOR_STORAGE_PROBE_PROVIDER_ID_PREFIX = "__agentproxy_doctor__";
const ACTIVE_RUNTIME_STATUS_PRIORITY = [
  "healthy",
  "attached",
  "degraded",
  "reconnecting",
  "discovered",
  "starting",
] as const;

const RUNTIME_CHECK_LABELS: Record<string, string> = {
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary]: "OpenCode binary",
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.registry]: "OpenCode runtime registry",
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStart]: "OpenCode managed runtime start",
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.health]: "OpenCode runtime health",
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.eventStream]: "OpenCode event stream",
  [OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.managedStop]: "OpenCode managed runtime stop",
};

export async function runAgentProxyDoctor(
  options: RunAgentProxyDoctorOptions,
): Promise<AgentProxyDoctorReport> {
  const now = options.now ?? (() => new Date());
  const checks: AgentProxyDoctorCheck[] = [];
  let storage: AgentProxyStorage | undefined;
  let registry: RuntimeRegistry | undefined;
  let runtimeDiagnostics: OpenCodeRuntimeDiagnosticReport | undefined;

  checks.push(
    await runDoctorCheck("agentproxy.node", "Node.js", () =>
      checkNodeVersion(options.nodeVersion ?? process.versions.node),
    ),
  );

  const configResult = await checkConfig(options);
  checks.push(configResult.check);
  if (configResult.resolved === undefined) {
    checks.push(...skippedConfigDependentChecks());
    return buildDoctorReport({
      version: options.agentProxyVersion,
      generatedAt: now().toISOString(),
      checks,
    });
  }

  try {
    const storageResult = await checkStorage(configResult.resolved.config, now);
    storage = storageResult.storage;
    registry = storageResult.registry;
    checks.push(storageResult.check);

    checks.push(checkOpenCodeConfig(configResult.resolved.config, registry));

    if (storage !== undefined) {
      runtimeDiagnostics = await runRuntimeDiagnostics({
        config: configResult.resolved.config,
        storage,
        env: options.env,
        includeManagedSmoke: options.includeManagedSmoke === true,
      });
      checks.push(...runtimeDiagnostics.checks.map(mapRuntimeDiagnosticCheck));
      checks.push(createOpenCodeVersionCheck(runtimeDiagnostics.checks));
    } else {
      checks.push(...skippedStorageDependentChecks());
    }

    checks.push(
      ...(await runProviderDiagnosticChecks({
        config: configResult.resolved.config,
        registry,
        env: options.env,
      })),
    );

    checks.push(await checkWorkspaceGit(configResult.resolved.config.workspacePath, options.env));
  } finally {
    storage?.close();
  }

  return buildDoctorReport({
    version: options.agentProxyVersion,
    generatedAt: now().toISOString(),
    checks,
    ...(runtimeDiagnostics !== undefined ? { runtimeDiagnostics } : {}),
  });
}

export function formatDoctorHumanReport(
  report: AgentProxyDoctorReport,
  options: FormatDoctorHumanReportOptions = {},
): string {
  const lines = [
    `AgentProxy doctor: ${report.ok ? "passed" : "failed"}`,
    `Checks: ${report.counts.passed} passed, ${report.counts.failed} failed, ${report.counts.warning} warning, ${report.counts.skipped} skipped`,
    "",
  ];

  for (const check of report.checks) {
    const errorCode = check.errorCode === undefined ? "" : ` (${check.errorCode})`;
    lines.push(`[${check.status}] ${check.label}: ${check.message}${errorCode}`);
    if (
      (options.debug === true || (options.verbose === true && check.status !== "passed")) &&
      Object.keys(check.details).length > 0
    ) {
      lines.push(`  details: ${JSON.stringify(check.details)}`);
    }
  }

  return lines.join("\n");
}

export function mapDoctorReportToExitCode(report: AgentProxyDoctorReport): number {
  if (report.ok) {
    return 0;
  }

  const failed = report.checks.find((check) => check.status === "failed");
  return failed?.errorCode === undefined ? 1 : mapDoctorErrorCodeToExitCode(failed.errorCode);
}

async function checkConfig(options: RunAgentProxyDoctorOptions): Promise<ConfigCheckResult> {
  const startedAt = Date.now();
  try {
    const resolved = await resolveAgentProxyConfig({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
      ...(options.cli !== undefined ? { cli: options.cli } : {}),
    });

    return {
      resolved,
      check: passedCheck({
        id: "agentproxy.config",
        label: "AgentProxy config",
        message: "AgentProxy configuration resolved successfully.",
        details: {
          sources: resolved.sources,
          workspacePath: resolved.config.workspacePath,
          storagePath: resolved.config.storage.path,
          defaultProvider: resolved.config.defaultProvider,
          opencodeEnabled: resolved.config.providers.opencode.enabled,
          opencodeRuntimeMode: resolved.config.providers.opencode.runtime.mode,
        },
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (error) {
    return {
      check: failedCheckFromError({
        id: "agentproxy.config",
        label: "AgentProxy config",
        error,
        durationMs: Date.now() - startedAt,
        fallbackMessage: "AgentProxy configuration could not be resolved.",
      }),
    };
  }
}

async function checkStorage(
  config: AgentProxyConfig,
  now: () => Date,
): Promise<StorageCheckResult> {
  const startedAt = Date.now();
  let storage: AgentProxyStorage | undefined;
  try {
    storage = openAgentProxyStorage({ databasePath: config.storage.path });
    const migrations = storage.getAppliedMigrations();
    const probeId = `${DOCTOR_STORAGE_PROBE_PROVIDER_ID_PREFIX}${randomUUID()}`;
    let probe: ReturnType<AgentProxyStorage["providers"]["get"]>;
    try {
      storage.providers.upsert({
        id: probeId,
        displayName: "AgentProxy Doctor Storage Probe",
        enabled: false,
        lastHealthStatus: "unknown",
        lastHealthCheckedAt: now().toISOString(),
        metadata: {
          diagnostic: true,
        },
      });
      probe = storage.providers.get(probeId);
    } finally {
      storage.providers.delete(probeId);
    }

    if (probe === undefined) {
      throw createAgentProxyError({
        code: "STORAGE_ERROR",
        message: "SQLite storage write probe could not be read back.",
        operation: "doctor.storage",
      });
    }

    const registry = new RuntimeRegistry({ storage, now });
    return {
      storage,
      registry,
      check: passedCheck({
        id: "agentproxy.storage.sqlite",
        label: "SQLite storage",
        message: "SQLite storage is readable and writable.",
        details: {
          databasePath: config.storage.path,
          migrationCount: migrations.length,
        },
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (error) {
    storage?.close();
    return {
      check: failedCheckFromError({
        id: "agentproxy.storage.sqlite",
        label: "SQLite storage",
        error,
        durationMs: Date.now() - startedAt,
        fallbackMessage: "SQLite storage is not readable and writable.",
      }),
    };
  }
}

function checkOpenCodeConfig(
  config: AgentProxyConfig,
  registry: RuntimeRegistry | undefined,
): AgentProxyDoctorCheck {
  const startedAt = Date.now();
  const opencode = config.providers.opencode;
  if (!opencode.enabled) {
    return failedCheck({
      id: "opencode.config",
      label: "OpenCode config",
      message: "OpenCode provider is disabled in AgentProxy config.",
      errorCode: "PROVIDER_UNAVAILABLE",
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion: "Enable providers.opencode.enabled before running OpenCode workflows.",
      },
      durationMs: Date.now() - startedAt,
    });
  }

  const runtimeBaseUrl = selectRuntimeBaseUrl(config, registry);
  if (opencode.runtime.mode === "attached" && runtimeBaseUrl.baseUrl === undefined) {
    return warningCheck({
      id: "opencode.config",
      label: "OpenCode config",
      message:
        "OpenCode is configured for attached runtime mode but no runtime base URL was available.",
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        suggestion:
          "Set providers.opencode.runtime.baseUrl or connect an attached runtime before running server-backed workflows.",
      },
      durationMs: Date.now() - startedAt,
    });
  }

  return passedCheck({
    id: "opencode.config",
    label: "OpenCode config",
    message: "OpenCode provider configuration has no obvious conflicts.",
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      runtimeMode: opencode.runtime.mode,
      runtimeBaseUrlSource: runtimeBaseUrl.source,
      ...(runtimeBaseUrl.runtimeId !== undefined ? { runtimeId: runtimeBaseUrl.runtimeId } : {}),
    },
    durationMs: Date.now() - startedAt,
  });
}

async function runRuntimeDiagnostics(input: {
  config: AgentProxyConfig;
  storage: AgentProxyStorage;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
  includeManagedSmoke: boolean;
}): Promise<OpenCodeRuntimeDiagnosticReport> {
  const diagnostics = new OpenCodeRuntimeDiagnostics({
    storage: input.storage,
    binary: input.config.providers.opencode.binary,
    cwd: input.config.workspacePath,
    ...(input.env !== undefined ? { env: input.env } : {}),
    requestTimeoutMs: DEFAULT_DOCTOR_REQUEST_TIMEOUT_MS,
  });

  return await diagnostics.run({
    workspacePath: input.config.workspacePath,
    includeManagedSmoke: input.includeManagedSmoke,
  });
}

async function runProviderDiagnosticChecks(input: {
  config: AgentProxyConfig;
  registry: RuntimeRegistry | undefined;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
}): Promise<AgentProxyDoctorCheck[]> {
  const opencode = input.config.providers.opencode;
  const runtimeBaseUrl = selectRuntimeBaseUrl(input.config, input.registry);

  if (!opencode.enabled) {
    return [
      skippedCheck({
        id: "opencode.server.health",
        label: "OpenCode server health",
        message: "OpenCode server health check skipped because the provider is disabled.",
        providerId: OPENCODE_PROVIDER_ID,
      }),
      skippedCheck({
        id: "opencode.provider.list",
        label: "OpenCode provider list",
        message: "OpenCode provider list check skipped because the provider is disabled.",
        providerId: OPENCODE_PROVIDER_ID,
      }),
      skippedCheck({
        id: "opencode.mcp.status",
        label: "OpenCode MCP status",
        message: "OpenCode MCP status check skipped because the provider is disabled.",
        providerId: OPENCODE_PROVIDER_ID,
      }),
    ];
  }

  if (runtimeBaseUrl.baseUrl === undefined) {
    return [
      skippedCheck({
        id: "opencode.server.health",
        label: "OpenCode server health",
        message: "No OpenCode runtime base URL was available for server health check.",
        providerId: OPENCODE_PROVIDER_ID,
        details: {
          suggestion:
            "Start or attach an OpenCode runtime, then rerun doctor or use --managed-smoke.",
        },
      }),
      skippedCheck({
        id: "opencode.provider.list",
        label: "OpenCode provider list",
        message: "No OpenCode runtime base URL was available for provider list check.",
        providerId: OPENCODE_PROVIDER_ID,
      }),
      skippedCheck({
        id: "opencode.mcp.status",
        label: "OpenCode MCP status",
        message: "No OpenCode runtime base URL was available for MCP status check.",
        providerId: OPENCODE_PROVIDER_ID,
      }),
    ];
  }

  const providerOptions: OpenCodeProviderOptions = {
    binary: opencode.binary,
    baseUrl: runtimeBaseUrl.baseUrl,
    cwd: input.config.workspacePath,
    requestTimeoutMs: DEFAULT_DOCTOR_REQUEST_TIMEOUT_MS,
    ...(input.env !== undefined ? { env: input.env } : {}),
  };
  const provider = new OpenCodeProvider(providerOptions);
  const context = {
    providerId: OPENCODE_PROVIDER_ID,
    workspacePath: input.config.workspacePath,
    metadata: {
      runtimeBaseUrl: runtimeBaseUrl.baseUrl,
    },
  };
  const [health, capabilities] = await Promise.all([
    provider.healthCheck(context),
    provider.getCapabilities(context),
  ]);

  return [
    mapProviderHealthCheck(health, runtimeBaseUrl),
    mapEndpointCapabilityCheck({
      id: "opencode.provider.list",
      label: "OpenCode provider list",
      successMessage: "OpenCode provider list endpoint is reachable.",
      failureMessage: "OpenCode provider list endpoint is not reachable.",
      endpointId: "providerList",
      capabilities,
      runtimeBaseUrl,
    }),
    mapEndpointCapabilityCheck({
      id: "opencode.mcp.status",
      label: "OpenCode MCP status",
      successMessage: "OpenCode MCP endpoint is reachable.",
      failureMessage: "OpenCode MCP endpoint is not reachable.",
      endpointId: "mcp",
      capabilities,
      runtimeBaseUrl,
    }),
  ];
}

async function checkWorkspaceGit(
  workspacePath: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): Promise<AgentProxyDoctorCheck> {
  return await runDoctorCheck("workspace.git", "Workspace Git status", async () => {
    const inside = await execFileText(
      "git",
      ["-C", workspacePath, "rev-parse", "--is-inside-work-tree"],
      env,
    ).catch(() => undefined);

    if (inside?.trim() !== "true") {
      return {
        status: "warning",
        message: "Workspace is not inside a Git repository.",
        details: {
          workspacePath,
          suggestion: "Run AgentProxy from a Git workspace for richer diagnostics.",
        },
      };
    }

    const [topLevel, branch, statusResult] = await Promise.all([
      execFileText("git", ["-C", workspacePath, "rev-parse", "--show-toplevel"], env).catch(
        () => undefined,
      ),
      execFileText("git", ["-C", workspacePath, "rev-parse", "--abbrev-ref", "HEAD"], env).catch(
        () => undefined,
      ),
      execFileText("git", ["-C", workspacePath, "status", "--short"], env)
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error })),
    ]);
    if (!statusResult.ok) {
      return {
        status: "warning",
        message: "Workspace Git status could not be read.",
        details: {
          workspacePath,
          ...(topLevel !== undefined ? { gitRoot: topLevel.trim() } : {}),
          ...(branch !== undefined ? { branch: branch.trim() } : {}),
          failureReason: "git_status_failed",
          errorMessage:
            statusResult.error instanceof Error
              ? statusResult.error.message
              : String(statusResult.error),
        },
      };
    }
    const dirtyEntries = statusResult.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      status: "passed",
      message:
        dirtyEntries.length === 0
          ? "Workspace is a clean Git repository."
          : "Workspace is a Git repository with uncommitted changes.",
      details: {
        workspacePath,
        ...(topLevel !== undefined ? { gitRoot: topLevel.trim() } : {}),
        ...(branch !== undefined ? { branch: branch.trim() } : {}),
        dirtyEntries: dirtyEntries.length,
      },
    };
  });
}

function checkNodeVersion(nodeVersion: string): {
  message: string;
  details: ProviderMetadata;
  status?: AgentProxyDoctorCheckStatus;
  errorCode?: AgentProxyErrorCode;
} {
  if (!nodeVersionSatisfiesMinimum(nodeVersion)) {
    return {
      status: "failed",
      errorCode: "CONFIG_INVALID",
      message: `Node.js ${nodeVersion} does not satisfy ${MINIMUM_NODE_VERSION}.`,
      details: {
        nodeVersion,
        minimumNodeVersion: MINIMUM_NODE_VERSION,
        suggestion: "Upgrade Node.js before running AgentProxy.",
      },
    };
  }

  return {
    message: `Node.js ${nodeVersion} satisfies ${MINIMUM_NODE_VERSION}.`,
    details: {
      nodeVersion,
      minimumNodeVersion: MINIMUM_NODE_VERSION,
    },
  };
}

function createOpenCodeVersionCheck(
  runtimeChecks: readonly OpenCodeRuntimeDiagnosticCheck[],
): AgentProxyDoctorCheck {
  const binaryCheck = runtimeChecks.find(
    (check) => check.id === OPENCODE_RUNTIME_DIAGNOSTIC_CHECK_IDS.binary,
  );
  const version =
    typeof binaryCheck?.details.version === "string" ? binaryCheck.details.version : undefined;

  if (version === undefined) {
    return skippedCheck({
      id: "opencode.version",
      label: "OpenCode version",
      message: "OpenCode version check skipped because the binary version was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
      details: binaryCheck?.details ?? {},
    });
  }

  return passedCheck({
    id: "opencode.version",
    label: "OpenCode version",
    message: `OpenCode ${version} satisfies the minimum supported version.`,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      version,
      minimumSupportedVersion: binaryCheck?.details.minimumSupportedVersion,
    },
    durationMs: 0,
  });
}

function mapRuntimeDiagnosticCheck(check: OpenCodeRuntimeDiagnosticCheck): AgentProxyDoctorCheck {
  return normalizeCheck({
    id: check.id,
    label: RUNTIME_CHECK_LABELS[check.id] ?? check.id,
    status: check.status,
    message: check.message,
    providerId: check.providerId,
    ...(check.runtimeId !== undefined ? { runtimeId: check.runtimeId } : {}),
    ...(check.errorCode !== undefined ? { errorCode: check.errorCode } : {}),
    details: check.details,
    durationMs: check.durationMs,
  });
}

function mapProviderHealthCheck(
  health: ProviderHealth,
  runtimeBaseUrl: RuntimeBaseUrlSelection,
): AgentProxyDoctorCheck {
  if (health.status === "healthy") {
    return passedCheck({
      id: "opencode.server.health",
      label: "OpenCode server health",
      message: health.message ?? "OpenCode server health check passed.",
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        providerVersion: health.providerVersion,
        runtimeBaseUrlSource: runtimeBaseUrl.source,
        ...(runtimeBaseUrl.runtimeId !== undefined ? { runtimeId: runtimeBaseUrl.runtimeId } : {}),
      },
      durationMs: 0,
    });
  }

  return failedCheck({
    id: "opencode.server.health",
    label: "OpenCode server health",
    message: health.message ?? "OpenCode server health check failed.",
    providerId: OPENCODE_PROVIDER_ID,
    errorCode: "RUNTIME_HEALTH_FAILED",
    details: {
      providerHealthStatus: health.status,
      providerVersion: health.providerVersion,
      suggestion: "Verify that the OpenCode runtime is running and reachable.",
    },
    durationMs: 0,
  });
}

function mapEndpointCapabilityCheck(input: {
  id: string;
  label: string;
  successMessage: string;
  failureMessage: string;
  endpointId: "providerList" | "mcp";
  capabilities: ProviderCapabilities;
  runtimeBaseUrl: RuntimeBaseUrlSelection;
}): AgentProxyDoctorCheck {
  const endpoint = readOpenCodeEndpointProbe(input.capabilities, input.endpointId);
  if (endpoint?.supported === true) {
    return passedCheck({
      id: input.id,
      label: input.label,
      message: input.successMessage,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        endpoint,
        runtimeBaseUrlSource: input.runtimeBaseUrl.source,
      },
      durationMs: 0,
    });
  }

  return failedCheck({
    id: input.id,
    label: input.label,
    message: input.failureMessage,
    providerId: OPENCODE_PROVIDER_ID,
    errorCode: "PROVIDER_UNAVAILABLE",
    details: {
      endpoint: endpoint ?? {},
      suggestion: "Verify that the OpenCode runtime exposes the expected server API.",
    },
    durationMs: 0,
  });
}

function readOpenCodeEndpointProbe(
  capabilities: ProviderCapabilities,
  endpointId: "providerList" | "mcp",
): ProviderMetadata | undefined {
  const probe = capabilities.metadata.agentproxyOpenCodeProviderProbe;
  if (!isRecord(probe)) {
    return undefined;
  }
  const runtime = probe.runtime;
  if (!isRecord(runtime)) {
    return undefined;
  }
  const endpoints = runtime.endpoints;
  if (!isRecord(endpoints)) {
    return undefined;
  }
  const endpoint = endpoints[endpointId];
  return isRecord(endpoint) ? endpoint : undefined;
}

function selectRuntimeBaseUrl(
  config: AgentProxyConfig,
  registry: RuntimeRegistry | undefined,
): RuntimeBaseUrlSelection {
  const configBaseUrl = config.providers.opencode.runtime.baseUrl;
  if (configBaseUrl !== undefined) {
    return {
      baseUrl: configBaseUrl,
      source: "config",
    };
  }

  const runtime = selectActiveRuntime(registry, config.workspacePath);
  if (runtime?.baseUrl !== undefined) {
    return {
      baseUrl: runtime.baseUrl,
      source: "registry",
      runtimeId: runtime.id,
    };
  }

  return {
    source: "none",
  };
}

function selectActiveRuntime(
  registry: RuntimeRegistry | undefined,
  workspacePath: string,
): StoredRuntimeRecord | undefined {
  if (registry === undefined) {
    return undefined;
  }

  return registry
    .list({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath,
    })
    .filter((runtime) => runtime.baseUrl !== undefined && isActiveRuntimeStatus(runtime.status))
    .sort((left, right) => activeRuntimePriority(left) - activeRuntimePriority(right))[0];
}

function activeRuntimePriority(runtime: StoredRuntimeRecord): number {
  const index = ACTIVE_RUNTIME_STATUS_PRIORITY.indexOf(
    runtime.status as (typeof ACTIVE_RUNTIME_STATUS_PRIORITY)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function isActiveRuntimeStatus(
  status: StoredRuntimeRecord["status"],
): status is (typeof ACTIVE_RUNTIME_STATUS_PRIORITY)[number] {
  return ACTIVE_RUNTIME_STATUS_PRIORITY.includes(
    status as (typeof ACTIVE_RUNTIME_STATUS_PRIORITY)[number],
  );
}

async function runDoctorCheck(
  id: string,
  label: string,
  callback: () =>
    | {
        message: string;
        status?: AgentProxyDoctorCheckStatus;
        providerId?: string;
        runtimeId?: string;
        errorCode?: AgentProxyErrorCode;
        details?: ProviderMetadata;
      }
    | Promise<{
        message: string;
        status?: AgentProxyDoctorCheckStatus;
        providerId?: string;
        runtimeId?: string;
        errorCode?: AgentProxyErrorCode;
        details?: ProviderMetadata;
      }>,
): Promise<AgentProxyDoctorCheck> {
  const startedAt = Date.now();
  try {
    const result = await callback();
    return normalizeCheck({
      id,
      label,
      status: result.status ?? "passed",
      message: result.message,
      ...(result.providerId !== undefined ? { providerId: result.providerId } : {}),
      ...(result.runtimeId !== undefined ? { runtimeId: result.runtimeId } : {}),
      ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
      details: result.details ?? {},
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return failedCheckFromError({
      id,
      label,
      error,
      durationMs: Date.now() - startedAt,
      fallbackMessage: `${label} check failed.`,
    });
  }
}

function skippedConfigDependentChecks(): AgentProxyDoctorCheck[] {
  return [
    skippedCheck({
      id: "agentproxy.storage.sqlite",
      label: "SQLite storage",
      message: "SQLite storage check skipped because AgentProxy config did not resolve.",
    }),
    skippedCheck({
      id: "opencode.config",
      label: "OpenCode config",
      message:
        "OpenCode provider configuration check skipped because AgentProxy config did not resolve.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    ...skippedStorageDependentChecks(),
    skippedCheck({
      id: "opencode.server.health",
      label: "OpenCode server health",
      message: "OpenCode server health check skipped because AgentProxy config did not resolve.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.provider.list",
      label: "OpenCode provider list",
      message: "OpenCode provider list check skipped because AgentProxy config did not resolve.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.mcp.status",
      label: "OpenCode MCP status",
      message: "OpenCode MCP status check skipped because AgentProxy config did not resolve.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "workspace.git",
      label: "Workspace Git status",
      message: "Workspace Git status check skipped because AgentProxy config did not resolve.",
    }),
  ];
}

function skippedStorageDependentChecks(): AgentProxyDoctorCheck[] {
  return [
    skippedCheck({
      id: "opencode.binary",
      label: "OpenCode binary",
      message: "OpenCode binary check skipped because storage was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.version",
      label: "OpenCode version",
      message: "OpenCode version check skipped because storage was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.runtime.registry",
      label: "OpenCode runtime registry",
      message: "OpenCode runtime registry check skipped because storage was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.runtime.health",
      label: "OpenCode runtime health",
      message: "OpenCode runtime health check skipped because storage was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
    skippedCheck({
      id: "opencode.runtime.event_stream",
      label: "OpenCode event stream",
      message: "OpenCode event stream check skipped because storage was unavailable.",
      providerId: OPENCODE_PROVIDER_ID,
    }),
  ];
}

function passedCheck(input: {
  id: string;
  label: string;
  message: string;
  providerId?: string;
  runtimeId?: string;
  details?: ProviderMetadata;
  durationMs: number;
}): AgentProxyDoctorCheck {
  return normalizeCheck({
    ...input,
    status: "passed",
    details: input.details ?? {},
  });
}

function warningCheck(input: {
  id: string;
  label: string;
  message: string;
  providerId?: string;
  runtimeId?: string;
  details?: ProviderMetadata;
  durationMs: number;
}): AgentProxyDoctorCheck {
  return normalizeCheck({
    ...input,
    status: "warning",
    details: input.details ?? {},
  });
}

function failedCheck(input: {
  id: string;
  label: string;
  message: string;
  providerId?: string;
  runtimeId?: string;
  errorCode?: AgentProxyErrorCode;
  details?: ProviderMetadata;
  durationMs: number;
}): AgentProxyDoctorCheck {
  return normalizeCheck({
    ...input,
    status: "failed",
    details: input.details ?? {},
  });
}

function skippedCheck(input: {
  id: string;
  label: string;
  message: string;
  providerId?: string;
  runtimeId?: string;
  details?: ProviderMetadata;
}): AgentProxyDoctorCheck {
  return normalizeCheck({
    ...input,
    status: "skipped",
    details: input.details ?? {},
    durationMs: 0,
  });
}

function failedCheckFromError(input: {
  id: string;
  label: string;
  error: unknown;
  durationMs: number;
  fallbackMessage: string;
}): AgentProxyDoctorCheck {
  if (isAgentProxyError(input.error)) {
    return failedCheck({
      id: input.id,
      label: input.label,
      message: input.error.message,
      ...(input.error.providerId !== undefined ? { providerId: input.error.providerId } : {}),
      errorCode: input.error.code,
      details: {
        ...(input.error.operation !== undefined ? { operation: input.error.operation } : {}),
        ...(input.error.rawCode !== undefined ? { rawCode: input.error.rawCode } : {}),
        ...(input.error.rawMessage !== undefined ? { rawMessage: input.error.rawMessage } : {}),
        ...(input.error.details ?? {}),
      },
      durationMs: input.durationMs,
    });
  }

  return failedCheck({
    id: input.id,
    label: input.label,
    message: input.error instanceof Error ? input.error.message : input.fallbackMessage,
    details: {
      failureReason: "unexpected_error",
    },
    durationMs: input.durationMs,
  });
}

function normalizeCheck(input: {
  id: string;
  label: string;
  status: AgentProxyDoctorCheckStatus;
  message: string;
  providerId?: string;
  runtimeId?: string;
  errorCode?: AgentProxyErrorCode;
  details: ProviderMetadata;
  durationMs: number;
}): AgentProxyDoctorCheck {
  const redactedDetails = redactValue(input.details);
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    message: redactString(input.message),
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    details: isRecord(redactedDetails) ? redactedDetails : {},
    durationMs: input.durationMs,
  };
}

function buildDoctorReport(input: {
  version: string;
  generatedAt: string;
  checks: AgentProxyDoctorCheck[];
  runtimeDiagnostics?: OpenCodeRuntimeDiagnosticReport;
}): AgentProxyDoctorReport {
  const counts = countChecks(input.checks);
  const report: AgentProxyDoctorReport = {
    ok: counts.failed === 0,
    version: input.version,
    providerId: OPENCODE_PROVIDER_ID,
    generatedAt: input.generatedAt,
    counts,
    checks: input.checks,
  };

  if (input.runtimeDiagnostics !== undefined) {
    report.runtimeDiagnostics = input.runtimeDiagnostics;
  }

  return redactValue(report) as AgentProxyDoctorReport;
}

function countChecks(checks: readonly AgentProxyDoctorCheck[]): AgentProxyDoctorCounts {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
    warning: checks.filter((check) => check.status === "warning").length,
  };
}

function mapDoctorErrorCodeToExitCode(code: AgentProxyErrorCode): number {
  switch (code) {
    case "CONFIG_INVALID":
      return 3;
    case "PROVIDER_NOT_FOUND":
    case "PROVIDER_UNAVAILABLE":
      return 4;
    case "RUNTIME_START_FAILED":
      return 5;
    case "CAPABILITY_UNSUPPORTED":
      return 6;
    case "PERMISSION_DENIED":
      return 8;
    case "RUNTIME_HEALTH_FAILED":
    case "EVENT_STREAM_INTERRUPTED":
      return 9;
    case "STORAGE_ERROR":
      return 10;
    case "SESSION_NOT_FOUND":
    case "PASSTHROUGH_FAILED":
      return 1;
  }
}

function nodeVersionSatisfiesMinimum(nodeVersion: string): boolean {
  const major = Number(nodeVersion.split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

function execFileText(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        ...(env !== undefined ? { env: { ...process.env, ...env } } : {}),
        timeout: 1_000,
        maxBuffer: 128 * 1024,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function isRecord(value: unknown): value is ProviderMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
