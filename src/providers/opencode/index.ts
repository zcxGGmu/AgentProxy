import { createAgentProxyError } from "../../core/errors.js";
import type { AgentEvent } from "../../core/events.js";
import type { RuntimeHandle, RuntimeRequest } from "../../core/types.js";
import type { ProviderSession } from "../../sessions/types.js";
import { OPENCODE_PROVIDER_ID } from "./constants.js";
import { listOpenCodeModels } from "./models.js";
import {
  OPENCODE_PROVIDER_PROBE_METADATA_KEY,
  type OpenCodeProviderOptions,
  probeOpenCodeProvider,
} from "./probe.js";
import {
  abortOpenCodeSession,
  deleteOpenCodeSession,
  exportOpenCodeSession,
  getOpenCodeSession,
  importOpenCodeSession,
  listOpenCodeSessions,
  resumeOpenCodeSession,
  sendOpenCodeMessage,
  shareOpenCodeSession,
  startOpenCodeSession,
  unshareOpenCodeSession,
} from "./sessions.js";
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
    return listOpenCodeSessions(this.#options, ctx, _query);
  }

  async getSession(ctx: ProviderContext, _id: string): Promise<ProviderSession> {
    return getOpenCodeSession(this.#options, ctx, _id);
  }

  async startSession(ctx: StartSessionRequest): Promise<ProviderSession> {
    return startOpenCodeSession(this.#options, ctx);
  }

  async resumeSession(ctx: ResumeSessionRequest): Promise<ProviderSession> {
    return resumeOpenCodeSession(this.#options, ctx);
  }

  sendMessage(ctx: SendMessageRequest): AsyncIterable<AgentEvent> {
    return sendOpenCodeMessage(this.#options, ctx);
  }

  async abortSession(ctx: SessionActionRequest): Promise<void> {
    return abortOpenCodeSession(this.#options, ctx);
  }

  async deleteSession(ctx: SessionActionRequest): Promise<void> {
    return deleteOpenCodeSession(this.#options, ctx);
  }

  async exportSession(ctx: ExportSessionRequest): Promise<ExportResult> {
    return exportOpenCodeSession(this.#options, ctx);
  }

  async importSession(ctx: ImportSessionRequest): Promise<ProviderSession> {
    return importOpenCodeSession(this.#options, ctx);
  }

  async shareSession(ctx: SessionActionRequest): Promise<ShareResult> {
    return shareOpenCodeSession(this.#options, ctx);
  }

  async unshareSession(ctx: SessionActionRequest): Promise<void> {
    return unshareOpenCodeSession(this.#options, ctx);
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
