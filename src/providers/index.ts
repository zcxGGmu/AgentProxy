export { OPENCODE_PROVIDER_ID } from "./opencode/index.js";

export type {
  AgentProvider,
  EcosystemCapabilities,
  ExportResult,
  ExportSessionRequest,
  ImportSessionRequest,
  InteractionCapabilities,
  ModelRef,
  NativeTuiRequest,
  NativeTuiResult,
  PassthroughRequest,
  PassthroughResult,
  ProviderCapabilities,
  ProviderCapabilitiesInput,
  ProviderCapabilitySchemaVersion,
  ProviderContext,
  ProviderHealth,
  ProviderHealthInput,
  ProviderListScope,
  ResumeSessionRequest,
  RuntimeCapabilities,
  SendMessageRequest,
  SessionActionRequest,
  SessionQuery,
  SessionCapabilities,
  ShareResult,
  StartSessionRequest,
} from "./types.js";
export {
  CAPABILITY_SCHEMA_VERSION,
  normalizeProviderCapabilities,
} from "./types.js";
export type { ProviderMetadata } from "./metadata.js";
export {
  isProviderMetadata,
  preserveProviderMetadata,
} from "./metadata.js";
