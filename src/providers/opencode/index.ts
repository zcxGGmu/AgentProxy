import { createAgentProxyError } from "../../core/errors.js";
import type { RuntimeHandle, RuntimeRequest } from "../../core/types.js";
import type { ProviderSession } from "../../sessions/types.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import { listOpenCodeModels } from "./models.js";
import {
  OPENCODE_PROVIDER_PROBE_METADATA_KEY,
  type OpenCodeProviderOptions,
  probeOpenCodeProvider,
} from "./probe.js";
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

export { OPENCODE_PROVIDER_ID } from "./constants.js";
export {
  OPENCODE_MINIMUM_SUPPORTED_VERSION,
  normalizeOpenCodeVersion,
  probeOpenCodeBinary,
} from "./binary.js";
export {
  OPENCODE_PROVIDER_PROBE_METADATA_KEY,
  OPENCODE_SDK_MODULE_NAME,
} from "./probe.js";
export type {
  OpenCodeBinaryProbe,
  OpenCodeBinarySource,
  ProbeOpenCodeBinaryOptions,
} from "./binary.js";
export type {
  OpenCodeProviderOptions,
  OpenCodeProviderProbeReport,
  OpenCodeSdkProbe,
  OpenCodeSdkResolver,
} from "./probe.js";

export class OpenCodeProvider implements AgentProvider {
  readonly id = OPENCODE_PROVIDER_ID;
  readonly displayName = "OpenCode";
  readonly metadata: Record<string, unknown>;

  #options: OpenCodeProviderOptions;

  constructor(options: OpenCodeProviderOptions = {}) {
    this.#options = options;
    this.metadata = {
      capabilitySource: "phase-4-runtime-probe",
      provider: OPENCODE_PROVIDER_ID,
      [OPENCODE_PROVIDER_PROBE_METADATA_KEY]: {
        availability: "probed",
      },
    };
  }

  async getCapabilities(ctx: ProviderContext): Promise<ProviderCapabilities> {
    const report = await probeOpenCodeProvider(this.#options, ctx, this.metadata);
    return report.capabilities;
  }

  async healthCheck(ctx: ProviderContext): Promise<ProviderHealth> {
    const report = await probeOpenCodeProvider(this.#options, ctx, this.metadata);
    return report.health;
  }

  async ensureRuntime(_ctx: RuntimeRequest): Promise<RuntimeHandle> {
    throw unsupportedOpenCodeOperation("provider.ensureRuntime");
  }

  async shutdownRuntime(handle: RuntimeHandle): Promise<void> {
    throw unsupportedOpenCodeOperation("provider.shutdownRuntime", handle.providerId);
  }

  async listModels(ctx: ProviderContext): Promise<ModelRef[]> {
    return listOpenCodeModels(this.#options, ctx);
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
