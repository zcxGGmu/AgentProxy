import type { ProviderMetadata } from "./metadata.js";

export type RuntimeMode = "managed" | "attached";

export type RuntimeStatus =
  | "discovered"
  | "starting"
  | "attached"
  | "healthy"
  | "degraded"
  | "reconnecting"
  | "failed"
  | "stopping"
  | "stopped"
  | "detached";

export interface RuntimeHandle {
  id: string;
  providerId: string;
  mode: RuntimeMode;
  status: RuntimeStatus;
  baseUrl?: string;
  hostname?: string;
  port?: number;
  pid?: number;
  workspacePath?: string;
  startedAt: string;
  stoppedAt?: string;
  metadata: ProviderMetadata;
}

export interface RuntimeRequest {
  providerId: string;
  workspacePath?: string;
  mode?: RuntimeMode;
  baseUrl?: string;
  hostname?: string;
  port?: number;
  pid?: number;
  correlationId?: string;
  signal?: AbortSignal;
  metadata: ProviderMetadata;
}
