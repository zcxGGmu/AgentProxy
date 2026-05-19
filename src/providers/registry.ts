import { createAgentProxyError } from "../core/errors.js";
import type { ProviderMetadata } from "../core/metadata.js";
import { OpenCodeProvider } from "./opencode/index.js";
import type {
  AgentProvider,
  ProviderCapabilities,
  ProviderContext,
  ProviderListScope,
} from "./types.js";
import { CAPABILITY_SCHEMA_VERSION, normalizeProviderCapabilities } from "./types.js";

export type ProviderRegistryMode = "unprobed" | "available" | "limited";

export type ProviderLimitedReason = "capability_probe_failed" | "capability_schema_incompatible";

export interface ProviderCapabilityProbe {
  providerId: string;
  displayName: string;
  mode: Exclude<ProviderRegistryMode, "unprobed">;
  compatibleSchema: boolean;
  sourceCapabilitySchemaVersion?: string;
  capabilities: ProviderCapabilities;
  limitedReason?: ProviderLimitedReason;
  metadata: ProviderMetadata;
}

export interface ProviderListItem {
  id: string;
  displayName: string;
  mode: ProviderRegistryMode;
  capabilitySchemaVersion?: string;
  compatibleSchema?: boolean;
  limitedReason?: ProviderLimitedReason;
  metadata: ProviderMetadata;
}

export interface ProviderListOptions {
  scope?: ProviderListScope;
}

export type ProviderProbeContext = Omit<Partial<ProviderContext>, "providerId" | "metadata"> & {
  metadata?: ProviderMetadata;
};

export class ProviderRegistry {
  readonly #providers = new Map<string, AgentProvider>();
  readonly #probeCache = new Map<string, ProviderCapabilityProbe>();

  register(provider: AgentProvider): void {
    if (this.#providers.has(provider.id)) {
      throw createAgentProxyError({
        code: "CONFIG_INVALID",
        message: `Provider already registered: ${provider.id}`,
        operation: "provider.register",
        providerId: provider.id,
      });
    }

    this.#providers.set(provider.id, provider);
    this.#probeCache.delete(provider.id);
  }

  getProvider(providerId: string): AgentProvider {
    const provider = this.#providers.get(providerId);
    if (provider === undefined) {
      throw createAgentProxyError({
        code: "PROVIDER_NOT_FOUND",
        message: `Provider not found: ${providerId}`,
        operation: "provider.lookup",
        providerId,
      });
    }

    return provider;
  }

  lookup(providerId: string): AgentProvider {
    return this.getProvider(providerId);
  }

  listProviders(options: ProviderListOptions = {}): ProviderListItem[] {
    return Array.from(this.#providers.values())
      .map((provider) => this.#toListItem(provider))
      .filter((item) => matchesScope(item, options.scope ?? "all"));
  }

  async probeCapabilities(
    providerId: string,
    context: ProviderProbeContext = {},
  ): Promise<ProviderCapabilityProbe> {
    const provider = this.getProvider(providerId);
    const providerContext: ProviderContext = {
      ...context,
      providerId,
      metadata: context.metadata ?? {},
    };

    try {
      const capabilities = await provider.getCapabilities(providerContext);

      const probe =
        capabilities.schemaVersion === CAPABILITY_SCHEMA_VERSION
          ? createAvailableProbe(provider, capabilities)
          : createLimitedProbe(provider, capabilities, "capability_schema_incompatible");

      this.#probeCache.set(providerId, probe);
      return probe;
    } catch (error) {
      const probe = createFailedProbe(provider, error);
      this.#probeCache.set(providerId, probe);
      return probe;
    }
  }

  #toListItem(provider: AgentProvider): ProviderListItem {
    const probe = this.#probeCache.get(provider.id);
    const metadata = toJsonReadyMetadata({
      ...(provider.metadata ?? {}),
      ...(probe?.metadata ?? {}),
    });

    if (probe === undefined) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        mode: "unprobed",
        metadata,
      };
    }

    return {
      id: provider.id,
      displayName: provider.displayName,
      mode: probe.mode,
      ...(probe.sourceCapabilitySchemaVersion !== undefined
        ? { capabilitySchemaVersion: probe.sourceCapabilitySchemaVersion }
        : {}),
      compatibleSchema: probe.compatibleSchema,
      ...(probe.limitedReason !== undefined ? { limitedReason: probe.limitedReason } : {}),
      metadata,
    };
  }
}

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OpenCodeProvider());
  return registry;
}

function matchesScope(item: ProviderListItem, scope: ProviderListScope): boolean {
  if (scope === "all") {
    return true;
  }

  return item.mode === scope;
}

function createAvailableProbe(
  provider: AgentProvider,
  capabilities: ProviderCapabilities,
): ProviderCapabilityProbe {
  return {
    providerId: provider.id,
    displayName: provider.displayName,
    mode: "available",
    compatibleSchema: true,
    sourceCapabilitySchemaVersion: capabilities.schemaVersion,
    capabilities,
    metadata: capabilities.metadata,
  };
}

function createLimitedProbe(
  provider: AgentProvider,
  capabilities: ProviderCapabilities,
  reason: ProviderLimitedReason,
): ProviderCapabilityProbe {
  return {
    providerId: provider.id,
    displayName: provider.displayName,
    mode: "limited",
    compatibleSchema: false,
    sourceCapabilitySchemaVersion: capabilities.schemaVersion,
    capabilities: normalizeProviderCapabilities({
      schemaVersion: CAPABILITY_SCHEMA_VERSION,
      ...(capabilities.providerVersion !== undefined
        ? { providerVersion: capabilities.providerVersion }
        : {}),
      sessions: {
        list: capabilities.sessions.list,
      },
      metadata: {
        ...capabilities.metadata,
        limitedMode: {
          expectedSchemaVersion: CAPABILITY_SCHEMA_VERSION,
          originalSchemaVersion: capabilities.schemaVersion,
          reason,
        },
      },
    }),
    limitedReason: reason,
    metadata: {
      ...capabilities.metadata,
      limitedMode: {
        expectedSchemaVersion: CAPABILITY_SCHEMA_VERSION,
        originalSchemaVersion: capabilities.schemaVersion,
        reason,
      },
    },
  };
}

function createFailedProbe(provider: AgentProvider, error: unknown): ProviderCapabilityProbe {
  return {
    providerId: provider.id,
    displayName: provider.displayName,
    mode: "limited",
    compatibleSchema: false,
    capabilities: normalizeProviderCapabilities({
      schemaVersion: CAPABILITY_SCHEMA_VERSION,
      metadata: {
        limitedMode: {
          reason: "capability_probe_failed",
        },
        probeError: formatProbeError(error),
      },
    }),
    limitedReason: "capability_probe_failed",
    metadata: {
      limitedMode: {
        reason: "capability_probe_failed",
      },
      probeError: formatProbeError(error),
    },
  };
}

function formatProbeError(error: unknown): ProviderMetadata {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function toJsonReadyMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const value = toJsonReadyValue(metadata, new WeakSet<object>());

  return isPlainObject(value) ? value : {};
}

function toJsonReadyValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== "object") {
    return undefined;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => toJsonReadyValue(item, seen) ?? null);
    seen.delete(value);

    return items;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, toJsonReadyValue(entryValue, seen)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  seen.delete(value);

  return Object.fromEntries(entries);
}

function isPlainObject(value: unknown): value is ProviderMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
