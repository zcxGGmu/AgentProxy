export const AGENTPROXY_APP_NAME = "AgentProxy";

export type {
  AgentErrorEvent,
  AgentEvent,
  AgentEventEnvelope,
  DiffUpdatedEvent,
  FileChangedEvent,
  MessageDeltaEvent,
  PermissionRequestedEvent,
  PermissionResolvedEvent,
  ProviderRawEvent,
  SessionCompletedEvent,
  SessionStartedEvent,
  SessionStatusChangedEvent,
  ToolFinishedEvent,
  ToolStartedEvent,
} from "./events.js";
export type {
  AgentProxyErrorCode,
  AgentProxyErrorInput,
} from "./errors.js";
export {
  AGENTPROXY_ERROR_CODES,
  AgentProxyError,
  createAgentProxyError,
  isAgentProxyError,
} from "./errors.js";
export type { ProviderMetadata } from "./metadata.js";
export {
  isProviderMetadata,
  preserveProviderMetadata,
} from "./metadata.js";
export type {
  RuntimeHandle,
  RuntimeMode,
  RuntimeRequest,
  RuntimeStatus,
} from "./types.js";
