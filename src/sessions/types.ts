import type { ProviderMetadata } from "../core/metadata.js";

export type SessionStatus =
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "completed"
  | "unknown"
  | "missing_in_provider";

export interface AgentProxySession {
  id: string;
  providerId: string;
  providerSessionId: string;
  workspacePath: string;
  title?: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastSyncAt?: string;
  lastSyncFailedAt?: string;
  lastError?: string;
  model?: string;
  runtimeId?: string;
  parentSessionId?: string;
  tags: string[];
  deletedAt?: string;
  tombstoneReason?: string;
  sourceOfTruth?: "provider_content_agentproxy_index";
  metadata: ProviderMetadata;
}

export interface ProviderSession {
  providerId: string;
  providerSessionId: string;
  workspacePath?: string;
  title?: string;
  status: SessionStatus;
  createdAt?: string;
  updatedAt?: string;
  lastRunAt?: string;
  model?: string;
  parentProviderSessionId?: string;
  metadata: ProviderMetadata;
  raw?: unknown;
}

export interface SessionListItem extends ProviderSession {
  agentproxySessionId?: string;
}
