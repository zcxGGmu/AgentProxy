import { describe, expect, it } from "vitest";
import {
  AGENTPROXY_ERROR_CODES,
  createAgentProxyError,
  isAgentProxyError,
  type AgentEvent,
} from "../src/core/index.js";
import {
  CAPABILITY_SCHEMA_VERSION,
  normalizeProviderCapabilities,
  preserveProviderMetadata,
  type AgentProvider,
} from "../src/providers/index.js";

describe("core domain contracts", () => {
  it("exposes stable error codes as runtime values", () => {
    expect(AGENTPROXY_ERROR_CODES).toEqual([
      "CONFIG_INVALID",
      "PROVIDER_NOT_FOUND",
      "PROVIDER_UNAVAILABLE",
      "CAPABILITY_UNSUPPORTED",
      "RUNTIME_START_FAILED",
      "RUNTIME_HEALTH_FAILED",
      "SESSION_NOT_FOUND",
      "PERMISSION_DENIED",
      "EVENT_STREAM_INTERRUPTED",
      "STORAGE_ERROR",
      "PASSTHROUGH_FAILED",
    ]);
    expect(new Set(AGENTPROXY_ERROR_CODES).size).toBe(AGENTPROXY_ERROR_CODES.length);

    const error = createAgentProxyError({
      code: "PROVIDER_NOT_FOUND",
      message: "Provider not found: mock",
      operation: "provider.lookup",
      providerId: "mock",
      rawCode: "ENOENT",
      rawMessage: "missing provider",
    });

    expect(isAgentProxyError(error)).toBe(true);
    expect(error.code).toBe("PROVIDER_NOT_FOUND");
    expect(error.providerId).toBe("mock");
    expect(error.operation).toBe("provider.lookup");
    expect(error.rawCode).toBe("ENOENT");
    expect(error.rawMessage).toBe("missing provider");
  });

  it("defaults missing provider capabilities to unsupported", () => {
    const capabilities = normalizeProviderCapabilities({
      schemaVersion: CAPABILITY_SCHEMA_VERSION,
      runtime: {
        serve: true,
      },
      providerVersion: "1.2.3",
      nativeExtra: {
        retained: true,
      },
    });

    expect(capabilities.schemaVersion).toBe(CAPABILITY_SCHEMA_VERSION);
    expect(capabilities.providerVersion).toBe("1.2.3");
    expect(capabilities.runtime.serve).toBe(true);
    expect(capabilities.runtime.attach).toBe(false);
    expect(capabilities.sessions.create).toBe(false);
    expect(capabilities.interaction.nativeTui).toBe(false);
    expect(capabilities.ecosystem.mcp).toBe(false);
    expect(capabilities.metadata.nativeExtra).toEqual({ retained: true });
  });

  it("preserves provider-specific fields as metadata", () => {
    const metadata = preserveProviderMetadata(
      {
        id: "opencode",
        displayName: "OpenCode",
        serverCapabilities: ["sse", "openapi"],
        nativeStatus: {
          auth: "unknown",
        },
      },
      ["id", "displayName"],
    );

    expect(metadata).toEqual({
      serverCapabilities: ["sse", "openapi"],
      nativeStatus: {
        auth: "unknown",
      },
    });
  });

  it("allows a mock provider to satisfy the public contract", async () => {
    const providerSession = {
      providerId: "mock",
      providerSessionId: "provider_session_1",
      status: "running" as const,
      title: "Mock session",
      metadata: {
        nativeConversationId: "native_1",
      },
    };

    const provider: AgentProvider = {
      id: "mock",
      displayName: "Mock Provider",
      metadata: {
        nativeName: "mock-native",
      },
      getCapabilities: async () =>
        normalizeProviderCapabilities({
          schemaVersion: CAPABILITY_SCHEMA_VERSION,
          sessions: {
            create: true,
            resume: true,
          },
          interaction: {
            headlessRun: true,
          },
        }),
      healthCheck: async (ctx) => ({
        providerId: ctx.providerId,
        status: "healthy",
        checkedAt: "2026-05-19T00:00:00.000Z",
        metadata: {},
      }),
      ensureRuntime: async (ctx) => ({
        id: "runtime_1",
        providerId: ctx.providerId,
        mode: "managed",
        status: "healthy",
        startedAt: "2026-05-19T00:00:00.000Z",
        metadata: {},
      }),
      shutdownRuntime: async () => {},
      listModels: async (ctx) => [
        {
          id: "mock/default",
          providerId: ctx.providerId,
          displayName: "Mock Default",
          metadata: {},
        },
      ],
      listSessions: async () => [providerSession],
      getSession: async () => providerSession,
      startSession: async () => providerSession,
      resumeSession: async () => providerSession,
      sendMessage: async function* (ctx) {
        yield {
          type: "message.delta",
          role: "assistant",
          delta: ctx.prompt,
          metadata: {},
        };
      },
      abortSession: async () => {},
      deleteSession: async () => {},
      exportSession: async () => ({
        providerId: "mock",
        providerSessionId: providerSession.providerSessionId,
        sanitized: true,
        data: {
          title: providerSession.title,
        },
        metadata: {},
      }),
      importSession: async () => providerSession,
      shareSession: async () => ({
        providerId: "mock",
        providerSessionId: providerSession.providerSessionId,
        url: "https://example.test/share/provider_session_1",
        metadata: {},
      }),
      openNativeTui: async () => ({
        launched: true,
        exitCode: 0,
        metadata: {},
      }),
      passthrough: async () => ({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        metadata: {},
      }),
    };

    const [capabilities, health, runtime, sessions] = await Promise.all([
      provider.getCapabilities({ providerId: provider.id, metadata: {} }),
      provider.healthCheck({ providerId: provider.id, metadata: {} }),
      provider.ensureRuntime({ providerId: provider.id, workspacePath: "/tmp/repo", metadata: {} }),
      provider.listSessions({ providerId: provider.id, metadata: {} }),
    ]);

    expect(capabilities.sessions.create).toBe(true);
    expect(capabilities.sessions.delete).toBe(false);
    expect(health.status).toBe("healthy");
    expect(runtime.status).toBe("healthy");
    expect(sessions[0]?.metadata.nativeConversationId).toBe("native_1");

    const events: AgentEvent[] = [];
    for await (const event of provider.sendMessage({
      providerId: provider.id,
      providerSessionId: providerSession.providerSessionId,
      prompt: "hello",
      metadata: {},
    })) {
      events.push(event);
    }

    const firstEvent = events[0];
    expect(firstEvent?.type).toBe("message.delta");
    if (firstEvent?.type === "message.delta") {
      expect(firstEvent.delta).toBe("hello");
    }
  });
});
