import { AgentProxyError } from "../core/errors.js";

export const AGENTPROXY_REDACTED_VALUE = "[REDACTED]";

export interface RedactionOptions {
  enabled?: boolean;
  maxDepth?: number;
}

interface RedactionState {
  enabled: boolean;
  maxDepth: number;
  depth: number;
  seen: WeakSet<object>;
}

const SENSITIVE_WORDS = new Set([
  "authorization",
  "credential",
  "credentials",
  "passwd",
  "password",
  "pwd",
  "secret",
  "token",
]);

const INLINE_SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/(\bAuthorization\s*[:=]\s*)(?:Bearer|Basic)?\s*[^\s,;]+/gi, "$1[REDACTED]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]"],
  [
    /(["']?\b[A-Za-z0-9_.-]*(?:access[-_\s]?token|refresh[-_\s]?token|api[-_\s]?key|apikey|authorization|credentials?|passwd|password|secret|token|pwd)[A-Za-z0-9_.-]*\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}'"]+)/gi,
    "$1[REDACTED]",
  ],
  [
    /(--(?:access[-_]?token|refresh[-_]?token|token|secret|password|passwd|pwd|api[-_]?key|apikey|authorization)=)([^\s'"]+)/gi,
    "$1[REDACTED]",
  ],
  [
    /(^|\s)(--(?:access[-_]?token|refresh[-_]?token|token|secret|password|passwd|pwd|api[-_]?key|apikey|authorization)\s+)([^\s'"]+)/gi,
    "$1$2[REDACTED]",
  ],
];

export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  return redactAny(value, {
    enabled: options.enabled ?? true,
    maxDepth: options.maxDepth ?? 24,
    depth: 0,
    seen: new WeakSet<object>(),
  });
}

export function redactError(error: unknown, options: RedactionOptions = {}): unknown {
  return redactValue(error, options);
}

export function redactCommandArgs(
  args: readonly unknown[],
  options: RedactionOptions = {},
): unknown[] {
  return redactArray(args, {
    enabled: options.enabled ?? true,
    maxDepth: options.maxDepth ?? 24,
    depth: 0,
    seen: new WeakSet<object>(),
  });
}

export function redactString(value: string, options: RedactionOptions = {}): string {
  if (options.enabled === false) {
    return value;
  }

  return INLINE_SECRET_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function redactAny(value: unknown, state: RedactionState): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return state.enabled ? redactString(value) : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value === undefined) {
    return undefined;
  }

  if (state.depth >= state.maxDepth) {
    return "[MaxDepth]";
  }

  if (state.seen.has(value)) {
    return "[Circular]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    state.seen.add(value);
    return redactErrorValue(value, nextState(state));
  }

  state.seen.add(value);

  if (Array.isArray(value)) {
    return redactArray(value, nextState(state));
  }

  return redactObject(value as Record<string, unknown>, nextState(state));
}

function redactArray(args: readonly unknown[], state: RedactionState): unknown[] {
  const output: unknown[] = [];
  let redactNext = false;

  for (const arg of args) {
    if (redactNext) {
      output.push(state.enabled ? AGENTPROXY_REDACTED_VALUE : redactAny(arg, state));
      redactNext = false;
      continue;
    }

    if (typeof arg === "string") {
      const redacted = state.enabled ? redactString(arg) : arg;
      output.push(redacted);
      redactNext = state.enabled && isSensitiveCliFlagWithoutValue(arg);
      continue;
    }

    output.push(redactAny(arg, state));
  }

  return output;
}

function redactObject(
  value: Record<string, unknown>,
  state: RedactionState,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }

    output[key] =
      state.enabled && isSensitiveKey(key) ? AGENTPROXY_REDACTED_VALUE : redactAny(entry, state);
  }

  return output;
}

function redactErrorValue(error: Error, state: RedactionState): Record<string, unknown> {
  const output: Record<string, unknown> = {
    name: error.name,
    message: state.enabled ? redactString(error.message) : error.message,
  };

  if (error instanceof AgentProxyError) {
    output.code = error.code;
    if (error.providerId !== undefined) {
      output.providerId = error.providerId;
    }
    if (error.operation !== undefined) {
      output.operation = error.operation;
    }
    if (error.rawCode !== undefined) {
      output.rawCode = redactAny(error.rawCode, state);
    }
    if (error.rawMessage !== undefined) {
      output.rawMessage = redactAny(error.rawMessage, state);
    }
    if (error.details !== undefined) {
      output.details = redactAny(error.details, state);
    }
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause !== undefined) {
    output.cause = redactAny(cause, state);
  }

  return output;
}

function isSensitiveCliFlagWithoutValue(value: string): boolean {
  if (!value.startsWith("-") || value.includes("=")) {
    return false;
  }

  return isSensitiveKey(value.replace(/^-+/, ""));
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  if (parts.some((part) => SENSITIVE_WORDS.has(part))) {
    return true;
  }

  if (normalized.includes("apikey") || normalized.includes("api_key")) {
    return true;
  }

  return parts.some((part, index) => part === "api" && parts[index + 1] === "key");
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^-+/, "")
    .toLowerCase();
}

function nextState(state: RedactionState): RedactionState {
  return {
    enabled: state.enabled,
    maxDepth: state.maxDepth,
    depth: state.depth + 1,
    seen: state.seen,
  };
}
