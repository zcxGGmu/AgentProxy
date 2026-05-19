import { randomUUID } from "node:crypto";
import type { AgentProxyLogLevel as ConfigLogLevel } from "../config/types.js";
import { redactString, redactValue } from "./redact.js";

export const AGENTPROXY_LOG_NAMESPACE = "agentproxy";

export type AgentProxyLogLevel = ConfigLogLevel;

export interface AgentProxyLogSink {
  write(chunk: string): unknown;
}

export interface AgentProxyLogContext {
  correlationId?: string;
  providerId?: string;
  runtimeId?: string;
  sessionId?: string;
  providerSessionId?: string;
  operation?: string;
}

export interface AgentProxyLoggerOptions {
  namespace?: string;
  level?: AgentProxyLogLevel;
  debug?: boolean;
  redact?: boolean;
  sink?: AgentProxyLogSink;
  now?: () => Date;
  context?: AgentProxyLogContext;
}

export interface AgentProxyLogRecord extends AgentProxyLogContext {
  timestamp: string;
  level: AgentProxyLogLevel;
  namespace: string;
  correlationId: string;
  message: string;
  data?: unknown;
}

const LOG_LEVEL_WEIGHT: Record<AgentProxyLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface AgentProxyLogger {
  readonly correlationId: string;
  readonly context: Required<Pick<AgentProxyLogContext, "correlationId">> &
    Omit<AgentProxyLogContext, "correlationId">;
  child(context: AgentProxyLogContext): AgentProxyLogger;
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createAgentProxyLogger(options: AgentProxyLoggerOptions = {}): AgentProxyLogger {
  return new StructuredAgentProxyLogger(options);
}

class StructuredAgentProxyLogger implements AgentProxyLogger {
  readonly #namespace: string;
  readonly #level: AgentProxyLogLevel;
  readonly #debug: boolean;
  readonly #redact: boolean;
  readonly #sink: AgentProxyLogSink;
  readonly #now: () => Date;
  readonly context: Required<Pick<AgentProxyLogContext, "correlationId">> &
    Omit<AgentProxyLogContext, "correlationId">;

  constructor(options: AgentProxyLoggerOptions = {}) {
    this.#namespace = options.namespace ?? AGENTPROXY_LOG_NAMESPACE;
    this.#level = options.level ?? "info";
    this.#debug = options.debug ?? false;
    this.#redact = options.redact ?? true;
    this.#sink = options.sink ?? process.stderr;
    this.#now = options.now ?? (() => new Date());
    this.context = {
      ...(options.context ?? {}),
      correlationId: options.context?.correlationId ?? randomUUID(),
    };
  }

  get correlationId(): string {
    return this.context.correlationId;
  }

  child(context: AgentProxyLogContext): AgentProxyLogger {
    return new StructuredAgentProxyLogger({
      namespace: this.#namespace,
      level: this.#level,
      debug: this.#debug,
      redact: this.#redact,
      sink: this.#sink,
      now: this.#now,
      context: {
        ...this.context,
        ...context,
        correlationId: context.correlationId ?? this.context.correlationId,
      },
    });
  }

  debug(message: string, data?: unknown): void {
    this.#write("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.#write("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.#write("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.#write("error", message, data);
  }

  #write(level: AgentProxyLogLevel, message: string, data: unknown): void {
    if (!this.#isEnabled(level)) {
      return;
    }

    const record: AgentProxyLogRecord = {
      timestamp: this.#now().toISOString(),
      level,
      namespace: this.#namespace,
      ...this.context,
      message: this.#redact ? redactString(message) : message,
      ...(data !== undefined ? { data: redactValue(data, { enabled: this.#redact }) } : {}),
    };

    this.#sink.write(`${JSON.stringify(record)}\n`);
  }

  #isEnabled(level: AgentProxyLogLevel): boolean {
    if (level === "debug" && !this.#debug && this.#level !== "debug") {
      return false;
    }

    const effectiveLevel = this.#debug ? "debug" : this.#level;
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[effectiveLevel];
  }
}
