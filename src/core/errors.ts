export const AGENTPROXY_ERROR_CODES = [
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
] as const;

export type AgentProxyErrorCode = (typeof AGENTPROXY_ERROR_CODES)[number];

export interface AgentProxyErrorInput {
  code: AgentProxyErrorCode;
  message: string;
  providerId?: string;
  operation?: string;
  rawCode?: string | number;
  rawMessage?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AgentProxyError extends Error {
  readonly code: AgentProxyErrorCode;
  readonly providerId?: string;
  readonly operation?: string;
  readonly rawCode?: string | number;
  readonly rawMessage?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: AgentProxyErrorInput) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = "AgentProxyError";
    this.code = input.code;
    if (input.providerId !== undefined) {
      this.providerId = input.providerId;
    }
    if (input.operation !== undefined) {
      this.operation = input.operation;
    }
    if (input.rawCode !== undefined) {
      this.rawCode = input.rawCode;
    }
    if (input.rawMessage !== undefined) {
      this.rawMessage = input.rawMessage;
    }
    if (input.details !== undefined) {
      this.details = input.details;
    }
  }
}

export function createAgentProxyError(input: AgentProxyErrorInput): AgentProxyError {
  return new AgentProxyError(input);
}

export function isAgentProxyError(value: unknown): value is AgentProxyError {
  return value instanceof AgentProxyError;
}
