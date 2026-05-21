import type { AgentProxyConfig } from "../config/types.js";
import type { RuntimeMode } from "../core/types.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/constants.js";
import type { StoredRuntimeRecord } from "../storage/types.js";
import type { RuntimeRegistry } from "./registry.js";

export interface OpenCodeRuntimeBaseUrlSelection {
  baseUrl?: string;
  source: "config" | "registry" | "none";
  mode?: RuntimeMode;
  runtimeId?: string;
}

const ACTIVE_RUNTIME_STATUS_PRIORITY = [
  "healthy",
  "attached",
  "degraded",
  "reconnecting",
  "discovered",
  "starting",
] as const;

export function selectOpenCodeRuntimeBaseUrl(
  config: AgentProxyConfig,
  registry: RuntimeRegistry | undefined,
): OpenCodeRuntimeBaseUrlSelection {
  const configBaseUrl = config.providers.opencode.runtime.baseUrl;
  if (configBaseUrl !== undefined) {
    return {
      baseUrl: configBaseUrl,
      source: "config",
      mode: config.providers.opencode.runtime.mode,
    };
  }

  const runtime = selectActiveOpenCodeRuntime(registry, config.workspacePath);
  if (runtime?.baseUrl !== undefined) {
    return {
      baseUrl: runtime.baseUrl,
      source: "registry",
      mode: runtime.mode,
      runtimeId: runtime.id,
    };
  }

  return {
    source: "none",
  };
}

function selectActiveOpenCodeRuntime(
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
