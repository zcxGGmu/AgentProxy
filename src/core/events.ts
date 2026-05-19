import type { AgentProxyErrorCode } from "./errors.js";
import type { ProviderMetadata } from "./metadata.js";

export type AgentEvent =
  | SessionStartedEvent
  | SessionStatusChangedEvent
  | MessageDeltaEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | FileChangedEvent
  | DiffUpdatedEvent
  | AgentErrorEvent
  | SessionCompletedEvent
  | ProviderRawEvent;

export interface SessionStartedEvent {
  type: "session.started";
  providerSessionId: string;
  agentproxySessionId?: string;
  workspacePath: string;
  model?: string;
  metadata: ProviderMetadata;
}

export interface SessionStatusChangedEvent {
  type: "session.status_changed";
  from: string;
  to: string;
  metadata: ProviderMetadata;
}

export interface MessageDeltaEvent {
  type: "message.delta";
  role: "assistant" | "user" | "system" | "tool";
  delta: string;
  messageId?: string;
  metadata: ProviderMetadata;
}

export interface ToolStartedEvent {
  type: "tool.started";
  toolCallId: string;
  toolName: string;
  input?: unknown;
  metadata: ProviderMetadata;
}

export interface ToolFinishedEvent {
  type: "tool.finished";
  toolCallId: string;
  toolName: string;
  output?: unknown;
  durationMs?: number;
  metadata: ProviderMetadata;
}

export interface PermissionRequestedEvent {
  type: "permission.requested";
  permissionId: string;
  action: string;
  metadata: ProviderMetadata;
}

export interface PermissionResolvedEvent {
  type: "permission.resolved";
  permissionId: string;
  decision: "approved" | "denied";
  metadata: ProviderMetadata;
}

export interface FileChangedEvent {
  type: "file.changed";
  path: string;
  change: "created" | "updated" | "deleted";
  metadata: ProviderMetadata;
}

export interface DiffUpdatedEvent {
  type: "diff.updated";
  diff: string;
  metadata: ProviderMetadata;
}

export interface AgentErrorEvent {
  type: "error";
  code: AgentProxyErrorCode | string;
  message: string;
  metadata: ProviderMetadata;
}

export interface SessionCompletedEvent {
  type: "session.completed";
  status: "completed" | "failed" | "aborted";
  metadata: ProviderMetadata;
}

export interface ProviderRawEvent {
  type: "provider.raw_event";
  providerEventType: string;
  raw: unknown;
  metadata: ProviderMetadata;
}

export interface AgentEventEnvelope<TEvent extends AgentEvent = AgentEvent> {
  id: string;
  providerId: string;
  providerSessionId?: string;
  agentproxySessionId?: string;
  type: TEvent["type"];
  timestamp: string;
  payload: TEvent;
  raw?: unknown;
  metadata: ProviderMetadata;
}
