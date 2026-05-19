import { createAgentProxyError } from "../../core/errors.js";
import type { RuntimeHandle, RuntimeRequest } from "../../core/types.js";
import type { ProviderSession } from "../../sessions/types.js";
import type {
  AgentProvider,
  ExportResult,
  ExportSessionRequest,
  ImportSessionRequest,
  ModelRef,
  NativeTuiRequest,
  NativeTuiResult,
  PassthroughRequest,
  PassthroughResult,
  ProviderCapabilities,
  ProviderContext,
  ProviderHealth,
  ResumeSessionRequest,
  SendMessageRequest,
  SessionActionRequest,
  SessionQuery,
  ShareResult,
  StartSessionRequest,
} from "../types.js";
import { CAPABILITY_SCHEMA_VERSION, normalizeProviderCapabilities } from "../types.js";

export const OPENCODE_PROVIDER_ID = "opencode";

export class OpenCodeProvider implements AgentProvider {
  readonly id = OPENCODE_PROVIDER_ID;
  readonly displayName = "OpenCode";
  readonly metadata = {
    capabilitySource: "phase-2-placeholder",
    provider: OPENCODE_PROVIDER_ID,
  };

  async getCapabilities(_ctx: ProviderContext): Promise<ProviderCapabilities> {
    return normalizeProviderCapabilities({
      schemaVersion: CAPABILITY_SCHEMA_VERSION,
      metadata: this.metadata,
    });
  }

  async healthCheck(ctx: ProviderContext): Promise<ProviderHealth> {
    return {
      providerId: ctx.providerId,
      status: "unknown",
      checkedAt: new Date().toISOString(),
      message: "OpenCode runtime probing is not implemented in Phase 2.2.",
      metadata: this.metadata,
    };
  }

  async ensureRuntime(_ctx: RuntimeRequest): Promise<RuntimeHandle> {
    throw unsupportedOpenCodeOperation("provider.ensureRuntime");
  }

  async shutdownRuntime(handle: RuntimeHandle): Promise<void> {
    throw unsupportedOpenCodeOperation("provider.shutdownRuntime", handle.providerId);
  }

  async listModels(ctx: ProviderContext): Promise<ModelRef[]> {
    throw unsupportedOpenCodeOperation("provider.listModels", ctx.providerId);
  }

  async listSessions(ctx: ProviderContext, _query?: SessionQuery): Promise<ProviderSession[]> {
    throw unsupportedOpenCodeOperation("provider.listSessions", ctx.providerId);
  }

  async getSession(ctx: ProviderContext, _id: string): Promise<ProviderSession> {
    throw unsupportedOpenCodeOperation("provider.getSession", ctx.providerId);
  }

  async startSession(ctx: StartSessionRequest): Promise<ProviderSession> {
    throw unsupportedOpenCodeOperation("provider.startSession", ctx.providerId);
  }

  async resumeSession(ctx: ResumeSessionRequest): Promise<ProviderSession> {
    throw unsupportedOpenCodeOperation("provider.resumeSession", ctx.providerId);
  }

  sendMessage(ctx: SendMessageRequest): AsyncIterable<never> {
    return unsupportedOpenCodeEventStream(ctx.providerId);
  }

  async abortSession(ctx: SessionActionRequest): Promise<void> {
    throw unsupportedOpenCodeOperation("provider.abortSession", ctx.providerId);
  }

  async deleteSession(ctx: SessionActionRequest): Promise<void> {
    throw unsupportedOpenCodeOperation("provider.deleteSession", ctx.providerId);
  }

  async exportSession(ctx: ExportSessionRequest): Promise<ExportResult> {
    throw unsupportedOpenCodeOperation("provider.exportSession", ctx.providerId);
  }

  async importSession(ctx: ImportSessionRequest): Promise<ProviderSession> {
    throw unsupportedOpenCodeOperation("provider.importSession", ctx.providerId);
  }

  async shareSession(ctx: SessionActionRequest): Promise<ShareResult> {
    throw unsupportedOpenCodeOperation("provider.shareSession", ctx.providerId);
  }

  async unshareSession(ctx: SessionActionRequest): Promise<void> {
    throw unsupportedOpenCodeOperation("provider.unshareSession", ctx.providerId);
  }

  async openNativeTui(ctx: NativeTuiRequest): Promise<NativeTuiResult> {
    throw unsupportedOpenCodeOperation("provider.openNativeTui", ctx.providerId);
  }

  async passthrough(ctx: PassthroughRequest): Promise<PassthroughResult> {
    throw unsupportedOpenCodeOperation("provider.passthrough", ctx.providerId);
  }
}

function unsupportedOpenCodeOperation(operation: string, providerId = OPENCODE_PROVIDER_ID): Error {
  return createAgentProxyError({
    code: "CAPABILITY_UNSUPPORTED",
    message: `${operation} is not implemented for OpenCode in Phase 2.2.`,
    operation,
    providerId,
  });
}

function unsupportedOpenCodeEventStream(providerId: string): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<never> {
      return {
        async next(): Promise<IteratorResult<never>> {
          throw unsupportedOpenCodeOperation("provider.sendMessage", providerId);
        },
      };
    },
  };
}
