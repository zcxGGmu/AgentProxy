import { describe, expect, it } from "vitest";
import { AgentProxyError } from "../src/core/index.js";
import {
  CAPABILITY_SCHEMA_VERSION,
  OPENCODE_PROVIDER_ID,
  ProviderRegistry,
  createDefaultProviderRegistry,
  normalizeProviderCapabilities,
  type AgentProvider,
} from "../src/providers/index.js";

function createMockProvider(
  overrides: Partial<AgentProvider> & Pick<AgentProvider, "id" | "displayName">,
): AgentProvider {
  const providerSession = {
    providerId: overrides.id,
    providerSessionId: "mock_session_1",
    status: "idle" as const,
    metadata: {},
  };

  return {
    id: overrides.id,
    displayName: overrides.displayName,
    metadata: overrides.metadata ?? {},
    getCapabilities:
      overrides.getCapabilities ??
      (async () =>
        normalizeProviderCapabilities({
          schemaVersion: CAPABILITY_SCHEMA_VERSION,
          sessions: {
            list: true,
          },
        })),
    healthCheck:
      overrides.healthCheck ??
      (async (ctx) => ({
        providerId: ctx.providerId,
        status: "unknown",
        checkedAt: "2026-05-19T00:00:00.000Z",
        metadata: {},
      })),
    ensureRuntime:
      overrides.ensureRuntime ??
      (async (ctx) => ({
        id: "runtime_1",
        providerId: ctx.providerId,
        mode: "managed",
        status: "discovered",
        startedAt: "2026-05-19T00:00:00.000Z",
        metadata: {},
      })),
    shutdownRuntime: overrides.shutdownRuntime ?? (async () => {}),
    listModels: overrides.listModels ?? (async () => []),
    listSessions: overrides.listSessions ?? (async () => [providerSession]),
    getSession: overrides.getSession ?? (async () => providerSession),
    startSession: overrides.startSession ?? (async () => providerSession),
    resumeSession: overrides.resumeSession ?? (async () => providerSession),
    sendMessage:
      overrides.sendMessage ??
      async function* () {
        yield {
          type: "provider.raw_event" as const,
          providerEventType: "mock.placeholder",
          raw: {},
          metadata: {},
        };
      },
    abortSession: overrides.abortSession ?? (async () => {}),
    deleteSession: overrides.deleteSession ?? (async () => {}),
    exportSession:
      overrides.exportSession ??
      (async () => ({
        providerId: overrides.id,
        providerSessionId: providerSession.providerSessionId,
        sanitized: true,
        data: {},
        metadata: {},
      })),
    importSession: overrides.importSession ?? (async () => providerSession),
    shareSession:
      overrides.shareSession ??
      (async () => ({
        providerId: overrides.id,
        providerSessionId: providerSession.providerSessionId,
        url: "https://example.test/mock_session_1",
        metadata: {},
      })),
    openNativeTui:
      overrides.openNativeTui ??
      (async () => ({
        launched: false,
        metadata: {},
      })),
    passthrough:
      overrides.passthrough ??
      (async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "not implemented",
        metadata: {},
      })),
  };
}

describe("provider registry", () => {
  it("registers, looks up, and lists providers as JSON-friendly records", () => {
    const registry = new ProviderRegistry();
    const nestedCycle: Record<string, unknown> = {
      label: "native-context",
    };
    nestedCycle.self = nestedCycle;
    const circularArray: unknown[] = ["head"];
    circularArray.push(circularArray);
    const circularMetadata: Record<string, unknown> = {
      nativeName: "mock-native",
      version: 3n,
      handler: () => undefined,
      nested: {
        enabled: true,
        skipped: undefined,
      },
      nativeContext: nestedCycle,
      nativeList: circularArray,
    };
    const provider = createMockProvider({
      id: "mock",
      displayName: "Mock Provider",
      metadata: circularMetadata,
    });

    registry.register(provider);

    expect(registry.getProvider("mock")).toBe(provider);
    expect(registry.listProviders()).toEqual([
      {
        id: "mock",
        displayName: "Mock Provider",
        mode: "unprobed",
        metadata: {
          nativeName: "mock-native",
          version: "3",
          nested: {
            enabled: true,
          },
          nativeContext: {
            label: "native-context",
            self: "[Circular]",
          },
          nativeList: ["head", "[Circular]"],
        },
      },
    ]);
    expect(JSON.parse(JSON.stringify(registry.listProviders()))).toEqual(registry.listProviders());
  });

  it("rejects duplicate provider registration", () => {
    const registry = new ProviderRegistry();
    const provider = createMockProvider({
      id: "dup",
      displayName: "Duplicate Provider",
    });

    registry.register(provider);

    expect(() => registry.register(provider)).toThrow(AgentProxyError);
    try {
      registry.register(provider);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("CONFIG_INVALID");
        expect(error.operation).toBe("provider.register");
        expect(error.providerId).toBe("dup");
      }
    }
  });

  it("maps unknown provider lookup to PROVIDER_NOT_FOUND", () => {
    const registry = new ProviderRegistry();

    expect(() => registry.getProvider("missing")).toThrow(AgentProxyError);

    try {
      registry.getProvider("missing");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentProxyError);
      if (error instanceof AgentProxyError) {
        expect(error.code).toBe("PROVIDER_NOT_FOUND");
        expect(error.providerId).toBe("missing");
        expect(error.operation).toBe("provider.lookup");
      }
    }
  });

  it("probes compatible provider capabilities without entering limited mode", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createMockProvider({
        id: "mock",
        displayName: "Mock Provider",
      }),
    );

    const probe = await registry.probeCapabilities("mock");

    expect(probe.mode).toBe("available");
    expect(probe.compatibleSchema).toBe(true);
    expect(probe.capabilities.schemaVersion).toBe(CAPABILITY_SCHEMA_VERSION);
    expect(probe.capabilities.sessions.list).toBe(true);
    expect(registry.listProviders()).toEqual([
      {
        id: "mock",
        displayName: "Mock Provider",
        mode: "available",
        capabilitySchemaVersion: CAPABILITY_SCHEMA_VERSION,
        compatibleSchema: true,
        metadata: {},
      },
    ]);
  });

  it("degrades incompatible capability schemas to limited mode without crashing", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createMockProvider({
        id: "future-provider",
        displayName: "Future Provider",
        getCapabilities: async () =>
          normalizeProviderCapabilities({
            schemaVersion: "999",
            sessions: {
              list: true,
              create: true,
            },
            interaction: {
              headlessRun: true,
            },
            metadata: {
              nativeSchema: "future",
            },
          }),
      }),
    );

    const probe = await registry.probeCapabilities("future-provider");

    expect(probe.mode).toBe("limited");
    expect(probe.compatibleSchema).toBe(false);
    expect(probe.limitedReason).toBe("capability_schema_incompatible");
    expect(probe.capabilities.schemaVersion).toBe(CAPABILITY_SCHEMA_VERSION);
    expect(probe.capabilities.sessions.list).toBe(true);
    expect(probe.capabilities.sessions.create).toBe(false);
    expect(probe.capabilities.interaction.headlessRun).toBe(false);
    expect(probe.capabilities.metadata.limitedMode).toEqual({
      expectedSchemaVersion: CAPABILITY_SCHEMA_VERSION,
      originalSchemaVersion: "999",
      reason: "capability_schema_incompatible",
    });
    expect(registry.listProviders({ scope: "limited" })).toEqual([
      {
        id: "future-provider",
        displayName: "Future Provider",
        mode: "limited",
        capabilitySchemaVersion: "999",
        compatibleSchema: false,
        limitedReason: "capability_schema_incompatible",
        metadata: {
          nativeSchema: "future",
          limitedMode: {
            expectedSchemaVersion: CAPABILITY_SCHEMA_VERSION,
            originalSchemaVersion: "999",
            reason: "capability_schema_incompatible",
          },
        },
      },
    ]);
  });

  it("captures probe failures as limited mode without crashing", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createMockProvider({
        id: "broken",
        displayName: "Broken Provider",
        getCapabilities: async () => {
          throw new Error("probe failed");
        },
      }),
    );

    const probe = await registry.probeCapabilities("broken");

    expect(probe.mode).toBe("limited");
    expect(probe.compatibleSchema).toBe(false);
    expect(probe.limitedReason).toBe("capability_probe_failed");
    expect(probe.metadata.probeError).toEqual({
      name: "Error",
      message: "probe failed",
    });
    expect(registry.listProviders({ scope: "limited" })).toEqual([
      {
        id: "broken",
        displayName: "Broken Provider",
        mode: "limited",
        compatibleSchema: false,
        limitedReason: "capability_probe_failed",
        metadata: {
          limitedMode: {
            reason: "capability_probe_failed",
          },
          probeError: {
            name: "Error",
            message: "probe failed",
          },
        },
      },
    ]);
  });

  it("registers the OpenCode placeholder provider in the default registry", async () => {
    const registry = createDefaultProviderRegistry();

    const provider = registry.getProvider(OPENCODE_PROVIDER_ID);
    const probe = await registry.probeCapabilities(OPENCODE_PROVIDER_ID);

    expect(provider.displayName).toBe("OpenCode");
    expect(probe.mode).toBe("available");
    expect(probe.capabilities.metadata.capabilitySource).toBe("phase-2-placeholder");
    expect(registry.listProviders()).toEqual([
      {
        id: OPENCODE_PROVIDER_ID,
        displayName: "OpenCode",
        mode: "available",
        capabilitySchemaVersion: CAPABILITY_SCHEMA_VERSION,
        compatibleSchema: true,
        metadata: {
          capabilitySource: "phase-2-placeholder",
          provider: OPENCODE_PROVIDER_ID,
        },
      },
    ]);
  });
});
