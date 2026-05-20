import type { AgentEvent } from "../core/events.js";
import type { ProviderMetadata } from "../core/metadata.js";
import type { RuntimeHandle, RuntimeRequest } from "../core/types.js";
import type { ProviderSession, SessionStatus } from "../sessions/types.js";

export type ProviderCapabilitySchemaVersion = string;

export interface RuntimeCapabilities {
  serve: boolean;
  attach: boolean;
  managedLifecycle: boolean;
  sse: boolean;
  openApi: boolean;
  sdk: boolean;
}

export interface SessionCapabilities {
  list: boolean;
  create: boolean;
  resume: boolean;
  fork: boolean;
  delete: boolean;
  export: boolean;
  import: boolean;
  share: boolean;
  diff: boolean;
  revert: boolean;
  todo: boolean;
}

export interface InteractionCapabilities {
  nativeTui: boolean;
  headlessRun: boolean;
  promptPrefill: boolean;
  slashCommands: boolean;
  permissions: boolean;
}

export interface EcosystemCapabilities {
  mcp: boolean;
  lsp: boolean;
  formatters: boolean;
  customAgents: boolean;
  customCommands: boolean;
  plugins: boolean;
}

export interface ProviderCapabilities {
  schemaVersion: ProviderCapabilitySchemaVersion;
  providerVersion?: string;
  runtime: RuntimeCapabilities;
  sessions: SessionCapabilities;
  interaction: InteractionCapabilities;
  ecosystem: EcosystemCapabilities;
  metadata: ProviderMetadata;
}

export type ProviderCapabilitiesInput = {
  schemaVersion?: ProviderCapabilitySchemaVersion;
  providerVersion?: string;
  runtime?: Partial<RuntimeCapabilities>;
  sessions?: Partial<SessionCapabilities>;
  interaction?: Partial<InteractionCapabilities>;
  ecosystem?: Partial<EcosystemCapabilities>;
  metadata?: ProviderMetadata;
} & Record<string, unknown>;

export const CAPABILITY_SCHEMA_VERSION = "1";

const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  schemaVersion: CAPABILITY_SCHEMA_VERSION,
  runtime: {
    serve: false,
    attach: false,
    managedLifecycle: false,
    sse: false,
    openApi: false,
    sdk: false,
  },
  sessions: {
    list: false,
    create: false,
    resume: false,
    fork: false,
    delete: false,
    export: false,
    import: false,
    share: false,
    diff: false,
    revert: false,
    todo: false,
  },
  interaction: {
    nativeTui: false,
    headlessRun: false,
    promptPrefill: false,
    slashCommands: false,
    permissions: false,
  },
  ecosystem: {
    mcp: false,
    lsp: false,
    formatters: false,
    customAgents: false,
    customCommands: false,
    plugins: false,
  },
  metadata: {},
};

const PROVIDER_CAPABILITY_KNOWN_KEYS = [
  "schemaVersion",
  "providerVersion",
  "runtime",
  "sessions",
  "interaction",
  "ecosystem",
  "metadata",
] as const;
const providerCapabilityKnownKeySet = new Set<string>(PROVIDER_CAPABILITY_KNOWN_KEYS);

export function normalizeProviderCapabilities(
  input: ProviderCapabilitiesInput = {},
): ProviderCapabilities {
  const runtime = {
    ...DEFAULT_PROVIDER_CAPABILITIES.runtime,
    ...input.runtime,
  };
  const sessions = {
    ...DEFAULT_PROVIDER_CAPABILITIES.sessions,
    ...input.sessions,
  };
  const interaction = {
    ...DEFAULT_PROVIDER_CAPABILITIES.interaction,
    ...input.interaction,
  };
  const ecosystem = {
    ...DEFAULT_PROVIDER_CAPABILITIES.ecosystem,
    ...input.ecosystem,
  };

  const metadata = Object.fromEntries(
    Object.entries(input).filter(([key]) => !providerCapabilityKnownKeySet.has(key)),
  );

  return {
    schemaVersion: input.schemaVersion ?? CAPABILITY_SCHEMA_VERSION,
    ...(input.providerVersion !== undefined ? { providerVersion: input.providerVersion } : {}),
    runtime,
    sessions,
    interaction,
    ecosystem,
    metadata: {
      ...metadata,
      ...(input.metadata ?? {}),
    },
  };
}

export interface ProviderHealth {
  providerId: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  checkedAt: string;
  message?: string;
  providerVersion?: string;
  metadata: ProviderMetadata;
}

export type ProviderHealthInput = {
  providerId: string;
  status?: ProviderHealth["status"];
  checkedAt?: string;
  message?: string;
  providerVersion?: string;
  metadata?: ProviderMetadata;
} & Record<string, unknown>;

export interface ProviderContext {
  providerId: string;
  workspacePath?: string;
  runtimeId?: string;
  sessionId?: string;
  correlationId?: string;
  signal?: AbortSignal;
  metadata: ProviderMetadata;
}

export type ProviderListScope = "all" | "available" | "limited";

export interface ModelRef {
  id: string;
  providerId: string;
  displayName: string;
  family?: string;
  contextWindowTokens?: number;
  metadata: ProviderMetadata;
}

export interface SessionQuery {
  providerId?: string;
  workspacePath?: string;
  status?: SessionStatus | readonly SessionStatus[];
  includeTombstones?: boolean;
  limit?: number;
  cursor?: string;
  metadata: ProviderMetadata;
}

export interface StartSessionRequest extends ProviderContext {
  prompt?: string;
  model?: string;
  parentSessionId?: string;
}

export interface ResumeSessionRequest extends ProviderContext {
  providerSessionId: string;
  prompt?: string;
  model?: string;
}

export interface SendMessageRequest extends ProviderContext {
  providerSessionId: string;
  agentproxySessionId?: string;
  prompt: string;
  attachments?: readonly unknown[];
}

export interface SessionActionRequest extends ProviderContext {
  providerSessionId: string;
}

export interface ExportSessionRequest extends SessionActionRequest {
  sanitize?: boolean;
  raw?: boolean;
}

export interface ExportResult {
  providerId: string;
  providerSessionId: string;
  sanitized: boolean;
  data: unknown;
  metadata: ProviderMetadata;
}

export interface ImportSessionRequest extends ProviderContext {
  source: string;
}

export interface ShareResult {
  providerId: string;
  providerSessionId: string;
  url: string;
  metadata: ProviderMetadata;
}

export interface NativeTuiRequest extends ProviderContext {
  workspacePath: string;
  providerSessionId?: string;
  prompt?: string;
}

export interface NativeTuiResult {
  launched: boolean;
  metadata: ProviderMetadata;
}

export interface PassthroughRequest extends ProviderContext {
  args: readonly string[];
}

export interface PassthroughResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  metadata: ProviderMetadata;
}

export interface AgentProvider {
  readonly id: string;
  readonly displayName: string;
  readonly metadata?: ProviderMetadata;

  getCapabilities(ctx: ProviderContext): Promise<ProviderCapabilities>;
  healthCheck(ctx: ProviderContext): Promise<ProviderHealth>;

  ensureRuntime(ctx: RuntimeRequest): Promise<RuntimeHandle>;
  shutdownRuntime(handle: RuntimeHandle): Promise<void>;

  listModels(ctx: ProviderContext): Promise<ModelRef[]>;
  listSessions(ctx: ProviderContext, query?: SessionQuery): Promise<ProviderSession[]>;
  getSession(ctx: ProviderContext, id: string): Promise<ProviderSession>;

  startSession(ctx: StartSessionRequest): Promise<ProviderSession>;
  resumeSession(ctx: ResumeSessionRequest): Promise<ProviderSession>;
  sendMessage(ctx: SendMessageRequest): AsyncIterable<AgentEvent>;

  abortSession(ctx: SessionActionRequest): Promise<void>;
  deleteSession(ctx: SessionActionRequest): Promise<void>;
  exportSession(ctx: ExportSessionRequest): Promise<ExportResult>;
  importSession(ctx: ImportSessionRequest): Promise<ProviderSession>;
  shareSession(ctx: SessionActionRequest): Promise<ShareResult>;
  unshareSession?(ctx: SessionActionRequest): Promise<void>;

  openNativeTui(ctx: NativeTuiRequest): Promise<NativeTuiResult>;
  passthrough(ctx: PassthroughRequest): Promise<PassthroughResult>;
}
