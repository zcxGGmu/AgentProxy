import { existsSync } from "node:fs";
import type { AgentProxyCliConfigOverrides, AgentProxyConfig } from "../config/index.js";
import { resolveAgentProxyConfig } from "../config/index.js";
import {
  createAgentProxyError,
  isAgentProxyError,
  type AgentProxyErrorCode,
  type ProviderMetadata,
} from "../core/index.js";
import { redactValue } from "../logging/index.js";
import {
  createDefaultProviderRegistry,
  type ProviderCapabilityProbe,
  type ProviderRegistry,
} from "../providers/registry.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/index.js";
import type { ModelRef, ProviderCapabilities, ProviderHealth } from "../providers/types.js";
import {
  RuntimeRegistry,
  selectOpenCodeRuntimeBaseUrl,
  type OpenCodeRuntimeBaseUrlSelection,
} from "../runtimes/index.js";
import { openAgentProxyStorage, type AgentProxyStorage } from "../storage/index.js";
import { sanitizeHumanInline, sanitizeHumanText } from "./run.js";

export interface RunAgentProxyProvidersOptions {
  providerId?: string;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cli?: AgentProxyCliConfigOverrides;
  now?: () => Date;
}

export interface AgentProxyProviderCapabilitySummary {
  runtime: string[];
  sessions: string[];
  interaction: string[];
  ecosystem: string[];
}

export interface AgentProxyProviderRuntimeSummary {
  baseUrlSource: OpenCodeRuntimeBaseUrlSelection["source"];
  mode?: string;
  runtimeId?: string;
}

export interface AgentProxyProviderHealthSummary {
  status: ProviderHealth["status"];
  checkedAt: string;
  message?: string;
  providerVersion?: string;
}

export interface AgentProxyProviderErrorSummary {
  code: AgentProxyErrorCode | "UNKNOWN";
  message: string;
  next?: string;
}

export interface AgentProxyProviderModelSummary {
  id: string;
  displayName: string;
  family?: string;
  contextWindowTokens?: number;
}

export interface AgentProxyProviderModelsSummary {
  status: "available" | "skipped" | "failed";
  count: number;
  items: AgentProxyProviderModelSummary[];
  error?: AgentProxyProviderErrorSummary;
  message?: string;
}

export interface AgentProxyProviderSummary {
  id: string;
  displayName: string;
  enabled: boolean;
  mode: ProviderCapabilityProbe["mode"];
  compatibleSchema: boolean;
  capabilitySchemaVersion?: string;
  providerVersion?: string;
  health: AgentProxyProviderHealthSummary;
  runtime: AgentProxyProviderRuntimeSummary;
  capabilities: AgentProxyProviderCapabilitySummary;
}

export interface AgentProxyProvidersListReport {
  ok: true;
  workspacePath: string;
  providers: AgentProxyProviderSummary[];
}

export interface AgentProxyProviderInspectReport {
  ok: true;
  workspacePath: string;
  provider: AgentProxyProviderSummary & {
    models: AgentProxyProviderModelsSummary;
  };
}

interface ProviderCommandContext {
  config: AgentProxyConfig;
  runtime: OpenCodeRuntimeBaseUrlSelection;
  providerRegistry: ProviderRegistry;
}

const PROVIDERS_OPERATION = "providers";
const PROVIDERS_LIST_OPERATION = "providers.list";
const PROVIDERS_INSPECT_OPERATION = "providers.inspect";
const DEFAULT_PROVIDERS_REQUEST_TIMEOUT_MS = 1_000;

export async function listAgentProxyProviders(
  options: RunAgentProxyProvidersOptions = {},
): Promise<AgentProxyProvidersListReport> {
  assertProviderSupported(options.providerId ?? OPENCODE_PROVIDER_ID, PROVIDERS_LIST_OPERATION);
  return await withProviderCommandContext(options, { requireEnabled: false }, async (context) => {
    const summary = await summarizeOpenCodeProvider(context, PROVIDERS_LIST_OPERATION);
    return redactValue({
      ok: true,
      workspacePath: context.config.workspacePath,
      providers: [summary],
    }) as AgentProxyProvidersListReport;
  });
}

export async function inspectAgentProxyProvider(
  providerId: string,
  options: RunAgentProxyProvidersOptions = {},
): Promise<AgentProxyProviderInspectReport> {
  assertProviderSupported(providerId, PROVIDERS_INSPECT_OPERATION);
  return await withProviderCommandContext(options, { requireEnabled: true }, async (context) => {
    const summary = await summarizeOpenCodeProvider(context, PROVIDERS_INSPECT_OPERATION);
    const models = await summarizeOpenCodeModels(context);
    return redactValue({
      ok: true,
      workspacePath: context.config.workspacePath,
      provider: {
        ...summary,
        models,
      },
    }) as AgentProxyProviderInspectReport;
  });
}

export function formatProvidersListHumanReport(report: AgentProxyProvidersListReport): string {
  const lines = [`AgentProxy providers: ${report.providers.length}`];
  for (const provider of report.providers) {
    lines.push(
      `- ${sanitizeHumanInline(provider.id)} (${sanitizeHumanInline(
        provider.displayName,
      )}): ${sanitizeHumanInline(provider.health.status)}, ${sanitizeHumanInline(provider.mode)}`,
    );
    lines.push(
      `  Runtime: ${sanitizeHumanInline(provider.runtime.baseUrlSource)}${formatRuntimeMode(
        provider.runtime,
      )}`,
    );
    lines.push(`  Capabilities: ${formatCapabilitySummary(provider.capabilities)}`);
  }

  return lines.join("\n");
}

export function formatProviderInspectHumanReport(report: AgentProxyProviderInspectReport): string {
  const provider = report.provider;
  const lines = [
    `Provider: ${sanitizeHumanInline(provider.id)} (${sanitizeHumanInline(provider.displayName)})`,
    `Health: ${sanitizeHumanInline(provider.health.status)}${
      provider.health.providerVersion === undefined
        ? ""
        : ` (${sanitizeHumanInline(provider.health.providerVersion)})`
    }`,
    `Runtime: ${sanitizeHumanInline(provider.runtime.baseUrlSource)}${formatRuntimeMode(
      provider.runtime,
    )}`,
    "Capabilities:",
    `  Runtime: ${formatEnabledCapabilities(provider.capabilities.runtime)}`,
    `  Sessions: ${formatEnabledCapabilities(provider.capabilities.sessions)}`,
    `  Interaction: ${formatEnabledCapabilities(provider.capabilities.interaction)}`,
    `  Ecosystem: ${formatEnabledCapabilities(provider.capabilities.ecosystem)}`,
  ];

  if (provider.models.status === "available") {
    lines.push(`Models: ${provider.models.count} available`);
    for (const model of provider.models.items.slice(0, 20)) {
      const context =
        model.contextWindowTokens === undefined
          ? ""
          : ` (context ${model.contextWindowTokens.toString()})`;
      lines.push(
        `- ${sanitizeHumanInline(model.id)} - ${sanitizeHumanInline(model.displayName)}${context}`,
      );
    }
    if (provider.models.items.length > 20) {
      lines.push(`- ${provider.models.items.length - 20} more models omitted`);
    }
  } else if (provider.models.status === "skipped") {
    lines.push(
      `Models: skipped - ${sanitizeHumanInline(provider.models.message ?? "unavailable")}`,
    );
  } else {
    lines.push(
      `Models: failed - ${sanitizeHumanInline(
        provider.models.error?.message ?? "model listing failed",
      )}`,
    );
  }

  return lines.join("\n");
}

async function withProviderCommandContext<T>(
  options: RunAgentProxyProvidersOptions,
  behavior: { requireEnabled: boolean },
  callback: (context: ProviderCommandContext) => Promise<T>,
): Promise<T> {
  const resolvedConfig = await resolveAgentProxyConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cli !== undefined ? { cli: options.cli } : {}),
  });

  if (behavior.requireEnabled) {
    assertOpenCodeProviderEnabled(resolvedConfig.config, PROVIDERS_OPERATION);
  }

  let storage: AgentProxyStorage | undefined;
  try {
    let runtime = selectOpenCodeRuntimeBaseUrl(resolvedConfig.config, undefined);
    if (runtime.baseUrl === undefined && existsSync(resolvedConfig.config.storage.path)) {
      storage = openAgentProxyStorage({
        databasePath: resolvedConfig.config.storage.path,
        migrate: false,
        readonly: true,
        fileMustExist: true,
      });
      const registry = new RuntimeRegistry({
        storage,
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
      runtime = selectOpenCodeRuntimeBaseUrl(resolvedConfig.config, registry);
    }
    const providerRegistry = createConfiguredProviderRegistry({
      config: resolvedConfig.config,
      runtime,
      env: options.env,
    });

    return await callback({
      config: resolvedConfig.config,
      runtime,
      providerRegistry,
    });
  } finally {
    storage?.close();
  }
}

async function summarizeOpenCodeProvider(
  context: ProviderCommandContext,
  operation: string,
): Promise<AgentProxyProviderSummary> {
  const providerContext = {
    providerId: OPENCODE_PROVIDER_ID,
    workspacePath: context.config.workspacePath,
    metadata: providerRuntimeMetadata(context.runtime),
  };
  if (!context.config.providers.opencode.enabled) {
    return disabledOpenCodeProviderSummary(context);
  }

  const probe = await context.providerRegistry.probeCapabilities(
    OPENCODE_PROVIDER_ID,
    providerContext,
  );
  const health = healthFromProbe(probe);

  if (probe.mode !== "available" && probe.limitedReason === "capability_probe_failed") {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider capability probing failed.",
      operation,
      providerId: OPENCODE_PROVIDER_ID,
      details: {
        probe: probe.metadata,
        suggestion: "Run agentproxy doctor for a deeper OpenCode provider diagnostic.",
      },
    });
  }

  return {
    id: probe.providerId,
    displayName: probe.displayName,
    enabled: context.config.providers.opencode.enabled,
    mode: probe.mode,
    compatibleSchema: probe.compatibleSchema,
    ...(probe.sourceCapabilitySchemaVersion !== undefined
      ? { capabilitySchemaVersion: probe.sourceCapabilitySchemaVersion }
      : {}),
    ...(probe.capabilities.providerVersion !== undefined
      ? { providerVersion: sanitizeMachineString(probe.capabilities.providerVersion) }
      : {}),
    health: summarizeProviderHealth(health),
    runtime: summarizeRuntime(context.runtime),
    capabilities: summarizeCapabilities(probe.capabilities),
  };
}

function disabledOpenCodeProviderSummary(
  context: ProviderCommandContext,
): AgentProxyProviderSummary {
  return {
    id: OPENCODE_PROVIDER_ID,
    displayName: "OpenCode",
    enabled: false,
    mode: "limited",
    compatibleSchema: false,
    health: {
      status: "unknown",
      checkedAt: new Date(0).toISOString(),
      message: "OpenCode provider is disabled in AgentProxy config.",
    },
    runtime: summarizeRuntime(context.runtime),
    capabilities: {
      runtime: [],
      sessions: [],
      interaction: [],
      ecosystem: [],
    },
  };
}

function healthFromProbe(probe: ProviderCapabilityProbe): ProviderHealth {
  const providerVersion = probe.capabilities.providerVersion;
  const runtimeAvailable = readBooleanProbePath(probe.metadata, ["runtime", "available"]);
  const binaryAvailable = readBooleanProbePath(probe.metadata, ["binary", "available"]);
  if (runtimeAvailable === true) {
    return {
      providerId: probe.providerId,
      status: "healthy",
      checkedAt: readProbeCheckedAt(probe.metadata),
      message: "OpenCode runtime is healthy.",
      ...(providerVersion !== undefined ? { providerVersion } : {}),
      metadata: probe.metadata,
    };
  }

  return {
    providerId: probe.providerId,
    status: binaryAvailable === true ? "degraded" : "unhealthy",
    checkedAt: readProbeCheckedAt(probe.metadata),
    message:
      binaryAvailable !== true
        ? "OpenCode binary is unavailable and no healthy runtime was detected."
        : probe.limitedReason === "capability_probe_failed"
          ? "OpenCode provider capability probing failed."
          : "OpenCode binary is available, but runtime probing did not pass.",
    ...(providerVersion !== undefined ? { providerVersion } : {}),
    metadata: probe.metadata,
  };
}

function readProbeCheckedAt(metadata: ProviderMetadata): string {
  const probe = metadata.agentproxyOpenCodeProviderProbe;
  if (typeof probe === "object" && probe !== null && !Array.isArray(probe)) {
    const checkedAt = (probe as Record<string, unknown>).checkedAt;
    if (typeof checkedAt === "string" && checkedAt.trim() !== "") {
      return checkedAt;
    }
  }

  return new Date(0).toISOString();
}

function readBooleanProbePath(
  metadata: ProviderMetadata,
  path: readonly string[],
): boolean | undefined {
  const probe = metadata.agentproxyOpenCodeProviderProbe;
  if (typeof probe !== "object" || probe === null || Array.isArray(probe)) {
    return undefined;
  }

  let current: unknown = probe;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "boolean" ? current : undefined;
}

async function summarizeOpenCodeModels(
  context: ProviderCommandContext,
): Promise<AgentProxyProviderModelsSummary> {
  if (context.runtime.baseUrl === undefined) {
    return {
      status: "skipped",
      count: 0,
      items: [],
      message:
        "No OpenCode runtime base URL is available; start or attach a runtime before listing models.",
    };
  }

  try {
    const provider = context.providerRegistry.getProvider(OPENCODE_PROVIDER_ID);
    const models = await provider.listModels({
      providerId: OPENCODE_PROVIDER_ID,
      workspacePath: context.config.workspacePath,
      metadata: providerRuntimeMetadata(context.runtime),
    });
    const items = models.map(summarizeModel);
    return {
      status: "available",
      count: items.length,
      items,
    };
  } catch (error) {
    return {
      status: "failed",
      count: 0,
      items: [],
      error: summarizeError(error),
    };
  }
}

function createConfiguredProviderRegistry(input: {
  config: AgentProxyConfig;
  runtime: OpenCodeRuntimeBaseUrlSelection;
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
}): ProviderRegistry {
  return createDefaultProviderRegistry({
    opencode: {
      binary: input.config.providers.opencode.binary,
      cwd: input.config.workspacePath,
      requestTimeoutMs: DEFAULT_PROVIDERS_REQUEST_TIMEOUT_MS,
      ...(input.runtime.baseUrl !== undefined ? { baseUrl: input.runtime.baseUrl } : {}),
      ...(input.env !== undefined ? { env: input.env } : {}),
    },
  });
}

function assertProviderSupported(providerId: string, operation: string): void {
  if (providerId === OPENCODE_PROVIDER_ID) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_NOT_FOUND",
    message: `Provider not found: ${providerId}`,
    operation,
    providerId,
    details: {
      suggestion: "AgentProxy v1 provider inspection currently supports the opencode provider.",
    },
  });
}

function assertOpenCodeProviderEnabled(config: AgentProxyConfig, operation: string): void {
  if (config.providers.opencode.enabled) {
    return;
  }

  throw createAgentProxyError({
    code: "PROVIDER_UNAVAILABLE",
    message: "OpenCode provider is disabled in AgentProxy config.",
    operation,
    providerId: OPENCODE_PROVIDER_ID,
    details: {
      suggestion: "Enable providers.opencode.enabled before inspecting OpenCode provider state.",
    },
  });
}

function providerRuntimeMetadata(runtime: OpenCodeRuntimeBaseUrlSelection): ProviderMetadata {
  return {
    ...(runtime.baseUrl !== undefined ? { runtimeBaseUrl: runtime.baseUrl } : {}),
    runtimeBaseUrlSource: runtime.source,
    ...(runtime.mode !== undefined ? { runtimeMode: runtime.mode } : {}),
    ...(runtime.runtimeId !== undefined ? { runtimeId: runtime.runtimeId } : {}),
  };
}

function summarizeProviderHealth(health: ProviderHealth): AgentProxyProviderHealthSummary {
  return {
    status: health.status,
    checkedAt: health.checkedAt,
    ...(health.message !== undefined ? { message: sanitizeMachineString(health.message) } : {}),
    ...(health.providerVersion !== undefined
      ? { providerVersion: sanitizeMachineString(health.providerVersion) }
      : {}),
  };
}

function summarizeRuntime(
  runtime: OpenCodeRuntimeBaseUrlSelection,
): AgentProxyProviderRuntimeSummary {
  return {
    baseUrlSource: runtime.source,
    ...(runtime.mode !== undefined ? { mode: runtime.mode } : {}),
    ...(runtime.runtimeId !== undefined
      ? { runtimeId: sanitizeMachineString(runtime.runtimeId) }
      : {}),
  };
}

function summarizeCapabilities(
  capabilities: ProviderCapabilities,
): AgentProxyProviderCapabilitySummary {
  return {
    runtime: enabledCapabilityNames(capabilities.runtime),
    sessions: enabledCapabilityNames(capabilities.sessions),
    interaction: enabledCapabilityNames(capabilities.interaction),
    ecosystem: enabledCapabilityNames(capabilities.ecosystem),
  };
}

function summarizeModel(model: ModelRef): AgentProxyProviderModelSummary {
  return {
    id: sanitizeMachineString(model.id),
    displayName: sanitizeMachineString(model.displayName),
    ...(model.family !== undefined ? { family: sanitizeMachineString(model.family) } : {}),
    ...(model.contextWindowTokens !== undefined
      ? { contextWindowTokens: model.contextWindowTokens }
      : {}),
  };
}

function enabledCapabilityNames<TCapabilities extends object>(
  capabilities: TCapabilities,
): string[] {
  return Object.entries(capabilities as Record<string, boolean>)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .sort();
}

function summarizeError(error: unknown): AgentProxyProviderErrorSummary {
  if (isAgentProxyError(error)) {
    return {
      code: error.code,
      message: sanitizeMachineString(error.message),
      ...(typeof error.details?.suggestion === "string"
        ? { next: sanitizeMachineString(error.details.suggestion) }
        : {}),
    };
  }

  return {
    code: "UNKNOWN",
    message: sanitizeMachineString(error instanceof Error ? error.message : String(error)),
  };
}

function formatRuntimeMode(runtime: AgentProxyProviderRuntimeSummary): string {
  return runtime.mode === undefined ? "" : ` (${sanitizeHumanInline(runtime.mode)})`;
}

function formatCapabilitySummary(summary: AgentProxyProviderCapabilitySummary): string {
  const groups = [
    `runtime ${summary.runtime.length}`,
    `sessions ${summary.sessions.length}`,
    `interaction ${summary.interaction.length}`,
    `ecosystem ${summary.ecosystem.length}`,
  ];
  return groups.join(", ");
}

function formatEnabledCapabilities(capabilities: readonly string[]): string {
  if (capabilities.length === 0) {
    return "none";
  }

  return capabilities.map(sanitizeHumanInline).join(", ");
}

function sanitizeMachineString(value: string): string {
  return sanitizeHumanText(value);
}
