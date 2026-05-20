import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  createAgentProxyError,
  isAgentProxyError,
  type AgentEvent,
  type AgentEventEnvelope,
  type ProviderMetadata,
  type RuntimeStatus,
} from "../core/index.js";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/constants.js";
import type { AgentProxyStorage, StoredRuntimeRecord } from "../storage/index.js";
import { RuntimeRegistry } from "./registry.js";

export const OPENCODE_EVENT_STREAM_METADATA_KEY = "agentproxyOpenCodeEventStream";
export const OPENCODE_EVENT_STREAM_PATH = "/event";
export const OPENCODE_GLOBAL_EVENT_STREAM_PATH = "/global/event";

export interface OpenCodeEventStreamClientOptions {
  storage?: AgentProxyStorage;
  registry?: RuntimeRegistry;
  now?: () => Date;
  eventPath?: string;
  connectTimeoutMs?: number;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  eventIdFactory?: () => string;
  fetchImplementation?: typeof fetch;
  compensateSessionStatus?: (
    input: OpenCodeEventStreamStatusCompensationInput,
  ) => void | Promise<void>;
}

export interface StreamOpenCodeRuntimeEventsInput {
  runtimeId: string;
  providerSessionId?: string;
  agentproxySessionId?: string;
  metadata?: ProviderMetadata;
  signal?: AbortSignal;
}

export interface OpenCodeEventStreamStatusCompensationInput {
  runtimeId: string;
  providerId: typeof OPENCODE_PROVIDER_ID;
  providerSessionId?: string;
  agentproxySessionId?: string;
  reconnectAttempt: number;
  metadata: ProviderMetadata;
}

export interface OpenCodeEventStreamRuntimeMetadata {
  eventPath: string;
  connectedAt?: string;
  lastConnectedAt?: string;
  lastInterruptedAt?: string;
  lastReconnectingAt?: string;
  failedAt?: string;
  interruptCount: number;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  reconnectDelayMs?: number;
  failureReason?: string;
  lastHttpStatus?: number;
  lastStatusCompensatedAt?: string;
  statusCompensationFailedAt?: string;
}

interface NormalizedRuntimeUrl {
  baseUrl: string;
}

interface OpenCodeSseMessage {
  raw: unknown;
  sseEventName?: string;
  sseId?: string;
}

interface ParsedSseEvent {
  data: string;
  event?: string;
  id?: string;
}

type EventStreamResponse = Response & {
  body: ReadableStream<Uint8Array>;
};

interface ProviderEventContext {
  runtimeId?: string;
  eventPath: string;
  providerSessionId?: string;
  agentproxySessionId?: string;
  metadata: ProviderMetadata;
  eventIdFactory: () => string;
  timestamp: string;
}

export interface StreamOpenCodeEventEnvelopesFromResponseInput {
  runtimeId?: string;
  eventPath?: string;
  providerSessionId?: string;
  agentproxySessionId?: string;
  metadata?: ProviderMetadata;
  signal?: AbortSignal;
  eventIdFactory?: () => string;
  now?: () => Date;
}

interface RuntimeStreamGuard {
  runtimeId: string;
  providerId: string;
  mode: StoredRuntimeRecord["mode"];
  startedAt: string;
  baseUrl: string;
  eventPath: string;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 250;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 2_000;

export class OpenCodeEventStreamClient {
  readonly registry: RuntimeRegistry;

  private readonly now: () => Date;
  private readonly eventPath: string;
  private readonly connectTimeoutMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly eventIdFactory: () => string;
  private readonly fetchImplementation: typeof fetch;
  private readonly compensateSessionStatus:
    | ((input: OpenCodeEventStreamStatusCompensationInput) => void | Promise<void>)
    | undefined;

  constructor(options: OpenCodeEventStreamClientOptions) {
    this.now = options.now ?? (() => new Date());
    this.registry = buildRuntimeRegistry(options, this.now);
    this.eventPath = normalizeEventPath(options.eventPath ?? OPENCODE_EVENT_STREAM_PATH);
    this.connectTimeoutMs = validatePositiveNumberOption(
      "connectTimeoutMs",
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    );
    this.maxReconnectAttempts = validateReconnectAttempts(
      options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    );
    this.reconnectBaseDelayMs = validateNonNegativeNumberOption(
      "reconnectBaseDelayMs",
      options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
    );
    this.reconnectMaxDelayMs = validateNonNegativeNumberOption(
      "reconnectMaxDelayMs",
      options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
    );
    assertReconnectDelayRange(this.reconnectBaseDelayMs, this.reconnectMaxDelayMs);
    this.eventIdFactory = options.eventIdFactory ?? defaultEventIdFactory;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.compensateSessionStatus = options.compensateSessionStatus;
  }

  streamRuntime(input: StreamOpenCodeRuntimeEventsInput): AsyncIterable<AgentEventEnvelope> {
    return this.streamRuntimeEvents(input);
  }

  private async *streamRuntimeEvents(
    input: StreamOpenCodeRuntimeEventsInput,
  ): AsyncGenerator<AgentEventEnvelope> {
    const runtime = this.resolveRuntime(input.runtimeId);
    const runtimeUrl = normalizeRuntimeBaseUrl(runtime.baseUrl);
    const runtimeGuard = buildRuntimeStreamGuard(runtime, runtimeUrl, this.eventPath);
    let reconnectAttempt = 0;

    while (!isSignalAborted(input.signal)) {
      this.assertRuntimeStillCurrent(runtimeGuard);
      if (reconnectAttempt > 0) {
        const reconnectDelayMs = reconnectDelayForAttempt(reconnectAttempt, {
          baseDelayMs: this.reconnectBaseDelayMs,
          maxDelayMs: this.reconnectMaxDelayMs,
        });
        this.registerRuntimeStatus(
          "reconnecting",
          {
            lastReconnectingAt: this.nowIso(),
            reconnectAttempt,
            reconnectDelayMs,
          },
          runtimeGuard,
        );
        await waitForReconnectDelay(reconnectDelayMs, input.signal);
        if (isSignalAborted(input.signal)) {
          return;
        }
      }

      try {
        const response = await this.connect(runtimeUrl, input.signal);
        this.registerRuntimeStatus(
          "healthy",
          {
            connectedAt: this.readEventStreamMetadata(runtime.id)?.connectedAt ?? this.nowIso(),
            lastConnectedAt: this.nowIso(),
            reconnectAttempt,
          },
          runtimeGuard,
        );
        if (reconnectAttempt > 0) {
          await this.compensateSessionStatusAfterReconnect(input, reconnectAttempt, runtimeGuard);
        }

        for await (const message of readServerSentEventMessages(response.body, input.signal)) {
          yield mapOpenCodeSseMessageToEnvelope(message, {
            runtimeId: runtime.id,
            eventPath: this.eventPath,
            ...(input.providerSessionId !== undefined
              ? { providerSessionId: input.providerSessionId }
              : {}),
            ...(input.agentproxySessionId !== undefined
              ? { agentproxySessionId: input.agentproxySessionId }
              : {}),
            metadata: input.metadata ?? {},
            eventIdFactory: this.eventIdFactory,
            timestamp: this.nowIso(),
          });
        }

        throw createEventStreamInterruptedError("OpenCode event stream ended.", {
          runtimeId: runtime.id,
          serverUrl: runtimeUrl.baseUrl,
          eventPath: this.eventPath,
          failureReason: "stream_ended",
          reconnectAttempt,
          maxReconnectAttempts: this.maxReconnectAttempts,
        });
      } catch (error) {
        if (isSignalAborted(input.signal)) {
          return;
        }

        const interruption = normalizeEventStreamInterruption(error, {
          runtimeId: runtime.id,
          serverUrl: runtimeUrl.baseUrl,
          eventPath: this.eventPath,
          reconnectAttempt,
          maxReconnectAttempts: this.maxReconnectAttempts,
        });
        const interruptCount = this.incrementInterruptCount(runtime.id);
        this.registerRuntimeStatus(
          "degraded",
          {
            lastInterruptedAt: this.nowIso(),
            interruptCount,
            reconnectAttempt,
            failureReason: readFailureReason(interruption),
            ...readLastHttpStatusPatch(interruption),
          },
          runtimeGuard,
        );

        if (reconnectAttempt >= this.maxReconnectAttempts) {
          const exhaustedInterruption = createEventStreamInterruptedError(
            "OpenCode event stream reconnect attempts were exhausted.",
            {
              runtimeId: runtime.id,
              serverUrl: runtimeUrl.baseUrl,
              eventPath: this.eventPath,
              failureReason: "reconnect_exhausted",
              lastFailureReason: readFailureReason(interruption),
              reconnectAttempt,
              maxReconnectAttempts: this.maxReconnectAttempts,
            },
          );
          this.registerRuntimeStatus(
            "failed",
            {
              failedAt: this.nowIso(),
              interruptCount,
              reconnectAttempt,
              failureReason: "reconnect_exhausted",
            },
            runtimeGuard,
          );
          throw exhaustedInterruption;
        }

        reconnectAttempt += 1;
      }
    }
  }

  private resolveRuntime(runtimeId: string): StoredRuntimeRecord {
    const runtime = this.registry.get(runtimeId);
    if (runtime === undefined) {
      throw createAgentProxyError({
        code: "RUNTIME_HEALTH_FAILED",
        message: "OpenCode event stream requires a registered runtime.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.eventStream.subscribe",
        details: {
          runtimeId,
        },
      });
    }

    if (runtime.providerId !== OPENCODE_PROVIDER_ID) {
      throw createAgentProxyError({
        code: "CAPABILITY_UNSUPPORTED",
        message: "OpenCode event stream can only subscribe to OpenCode runtimes.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.eventStream.subscribe",
        details: {
          runtimeId,
          runtimeProviderId: runtime.providerId,
        },
      });
    }

    if (runtime.baseUrl === undefined) {
      throw createAgentProxyError({
        code: "RUNTIME_HEALTH_FAILED",
        message: "OpenCode event stream requires a runtime base URL.",
        providerId: OPENCODE_PROVIDER_ID,
        operation: "opencode.eventStream.subscribe",
        details: {
          runtimeId,
        },
      });
    }

    return runtime;
  }

  private async connect(
    runtimeUrl: NormalizedRuntimeUrl,
    signal: AbortSignal | undefined,
  ): Promise<EventStreamResponse> {
    if (isSignalAborted(signal)) {
      throw createEventStreamInterruptedError("OpenCode event stream subscription was aborted.", {
        serverUrl: runtimeUrl.baseUrl,
        eventPath: this.eventPath,
        failureReason: "aborted",
      });
    }

    const controller = new AbortController();
    const requestTimeout = setTimeout(() => {
      controller.abort();
    }, this.connectTimeoutMs);
    requestTimeout.unref();

    const abortExternalRequest = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", abortExternalRequest, { once: true });

    try {
      const response = await this.fetchImplementation(
        buildEventStreamUrl(runtimeUrl, this.eventPath),
        {
          headers: {
            accept: "text/event-stream",
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw createEventStreamInterruptedError("OpenCode event stream endpoint was unhealthy.", {
          serverUrl: runtimeUrl.baseUrl,
          eventPath: this.eventPath,
          failureReason: "unhealthy_response",
          httpStatus: response.status,
        });
      }
      if (response.body === null) {
        throw createEventStreamInterruptedError("OpenCode event stream did not return a body.", {
          serverUrl: runtimeUrl.baseUrl,
          eventPath: this.eventPath,
          failureReason: "missing_response_body",
        });
      }

      return response as EventStreamResponse;
    } catch (error) {
      if (isAgentProxyError(error)) {
        throw error;
      }

      throw createEventStreamInterruptedError("OpenCode event stream connection failed.", {
        serverUrl: runtimeUrl.baseUrl,
        eventPath: this.eventPath,
        failureReason: isSignalAborted(signal) ? "aborted" : "request_failed",
      });
    } finally {
      clearTimeout(requestTimeout);
      signal?.removeEventListener("abort", abortExternalRequest);
    }
  }

  private registerRuntimeStatus(
    status: RuntimeStatus,
    metadataPatch: Partial<OpenCodeEventStreamRuntimeMetadata>,
    runtimeGuard: RuntimeStreamGuard,
  ): StoredRuntimeRecord {
    const runtime = this.assertRuntimeStillCurrent(runtimeGuard);
    return this.registry.register({
      id: runtime.id,
      providerId: runtime.providerId,
      mode: runtime.mode,
      status,
      metadata: this.mergeEventStreamMetadata(runtime.id, metadataPatch),
    });
  }

  private mergeEventStreamMetadata(
    runtimeId: string,
    patch: Partial<OpenCodeEventStreamRuntimeMetadata>,
  ): ProviderMetadata {
    const existing = this.readEventStreamMetadata(runtimeId);
    return {
      [OPENCODE_EVENT_STREAM_METADATA_KEY]: {
        eventPath: this.eventPath,
        interruptCount: existing?.interruptCount ?? 0,
        reconnectAttempt: existing?.reconnectAttempt ?? 0,
        maxReconnectAttempts: this.maxReconnectAttempts,
        ...(existing ?? {}),
        ...patch,
      },
    };
  }

  private readEventStreamMetadata(
    runtimeId: string,
  ): OpenCodeEventStreamRuntimeMetadata | undefined {
    return readEventStreamMetadata(this.registry.get(runtimeId)?.metadata);
  }

  private incrementInterruptCount(runtimeId: string): number {
    return (this.readEventStreamMetadata(runtimeId)?.interruptCount ?? 0) + 1;
  }

  private async compensateSessionStatusAfterReconnect(
    input: StreamOpenCodeRuntimeEventsInput,
    reconnectAttempt: number,
    runtimeGuard: RuntimeStreamGuard,
  ): Promise<void> {
    if (this.compensateSessionStatus === undefined) {
      return;
    }

    try {
      await this.compensateSessionStatus({
        runtimeId: input.runtimeId,
        providerId: OPENCODE_PROVIDER_ID,
        ...(input.providerSessionId !== undefined
          ? { providerSessionId: input.providerSessionId }
          : {}),
        ...(input.agentproxySessionId !== undefined
          ? { agentproxySessionId: input.agentproxySessionId }
          : {}),
        reconnectAttempt,
        metadata: input.metadata ?? {},
      });
      this.registerRuntimeStatus(
        "healthy",
        {
          lastStatusCompensatedAt: this.nowIso(),
        },
        runtimeGuard,
      );
    } catch {
      this.registerRuntimeStatus(
        "healthy",
        {
          statusCompensationFailedAt: this.nowIso(),
        },
        runtimeGuard,
      );
    }
  }

  private assertRuntimeStillCurrent(runtimeGuard: RuntimeStreamGuard): StoredRuntimeRecord {
    const current = this.registry.get(runtimeGuard.runtimeId);
    if (current === undefined) {
      throw createRuntimeChangedError(runtimeGuard, {
        failureReason: "runtime_missing",
      });
    }

    if (
      current.providerId !== runtimeGuard.providerId ||
      current.mode !== runtimeGuard.mode ||
      current.startedAt !== runtimeGuard.startedAt ||
      tryNormalizeRuntimeBaseUrl(current.baseUrl) !== runtimeGuard.baseUrl
    ) {
      throw createRuntimeChangedError(runtimeGuard, {
        failureReason: "runtime_replaced",
        currentStatus: current.status,
        currentStartedAt: current.startedAt,
      });
    }

    if (isTerminalForActiveStream(current.status)) {
      throw createRuntimeChangedError(runtimeGuard, {
        failureReason: "runtime_terminal",
        currentStatus: current.status,
        currentStartedAt: current.startedAt,
      });
    }

    return current;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

export async function* streamOpenCodeEventEnvelopesFromResponse(
  body: ReadableStream<Uint8Array>,
  input: StreamOpenCodeEventEnvelopesFromResponseInput = {},
): AsyncGenerator<AgentEventEnvelope> {
  const eventPath = normalizeEventPath(input.eventPath ?? OPENCODE_EVENT_STREAM_PATH);
  const eventIdFactory = input.eventIdFactory ?? defaultEventIdFactory;
  const now = input.now ?? (() => new Date());

  for await (const message of readServerSentEventMessages(body, input.signal)) {
    yield mapOpenCodeSseMessageToEnvelope(message, {
      ...(input.runtimeId !== undefined ? { runtimeId: input.runtimeId } : {}),
      eventPath,
      ...(input.providerSessionId !== undefined
        ? { providerSessionId: input.providerSessionId }
        : {}),
      ...(input.agentproxySessionId !== undefined
        ? { agentproxySessionId: input.agentproxySessionId }
        : {}),
      metadata: input.metadata ?? {},
      eventIdFactory,
      timestamp: now().toISOString(),
    });
  }
}

function buildRuntimeRegistry(
  options: OpenCodeEventStreamClientOptions,
  now: () => Date,
): RuntimeRegistry {
  if (options.registry !== undefined) {
    return options.registry;
  }
  if (options.storage !== undefined) {
    return new RuntimeRegistry({
      storage: options.storage,
      now,
    });
  }

  throw createAgentProxyError({
    code: "CONFIG_INVALID",
    message: "OpenCode event stream client requires a storage or registry dependency.",
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.eventStream.create",
  });
}

function validatePositiveNumberOption(name: string, value: number): number {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  throw createInvalidEventStreamOptionError(name, value, "must be a positive finite number");
}

function validateNonNegativeNumberOption(name: string, value: number): number {
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  throw createInvalidEventStreamOptionError(name, value, "must be a non-negative finite number");
}

function validateReconnectAttempts(value: number): number {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw createInvalidEventStreamOptionError(
    "maxReconnectAttempts",
    value,
    "must be a non-negative integer",
  );
}

function assertReconnectDelayRange(baseDelayMs: number, maxDelayMs: number): void {
  if (maxDelayMs >= baseDelayMs) {
    return;
  }

  throw createInvalidEventStreamOptionError(
    "reconnectMaxDelayMs",
    maxDelayMs,
    "must be greater than or equal to reconnectBaseDelayMs",
  );
}

function createInvalidEventStreamOptionError(
  option: string,
  value: number,
  requirement: string,
): Error {
  return createAgentProxyError({
    code: "CONFIG_INVALID",
    message: `OpenCode event stream option ${option} ${requirement}.`,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.eventStream.create",
    details: {
      option,
      value: Number.isNaN(value) ? "NaN" : value,
      requirement,
    },
  });
}

function normalizeRuntimeBaseUrl(baseUrl: string | undefined): NormalizedRuntimeUrl {
  if (baseUrl === undefined) {
    throw createAgentProxyError({
      code: "RUNTIME_HEALTH_FAILED",
      message: "OpenCode event stream requires a runtime base URL.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.eventStream.parseRuntimeUrl",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL must be a valid URL.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.eventStream.parseRuntimeUrl",
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "OpenCode runtime base URL must use http or https.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.eventStream.parseRuntimeUrl",
      details: {
        protocol: parsed.protocol,
      },
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    throw createAgentProxyError({
      code: "CONFIG_INVALID",
      message:
        "OpenCode runtime base URL must not include credentials; configure authentication separately.",
      providerId: OPENCODE_PROVIDER_ID,
      operation: "opencode.eventStream.parseRuntimeUrl",
      details: {
        serverUrl: sanitizedBaseUrl(parsed),
      },
    });
  }

  parsed.search = "";
  parsed.hash = "";
  return {
    baseUrl: sanitizedBaseUrl(parsed),
  };
}

function tryNormalizeRuntimeBaseUrl(baseUrl: string | undefined): string | undefined {
  try {
    return normalizeRuntimeBaseUrl(baseUrl).baseUrl;
  } catch {
    return undefined;
  }
}

function buildRuntimeStreamGuard(
  runtime: StoredRuntimeRecord,
  runtimeUrl: NormalizedRuntimeUrl,
  eventPath = OPENCODE_EVENT_STREAM_PATH,
): RuntimeStreamGuard {
  return {
    runtimeId: runtime.id,
    providerId: runtime.providerId,
    mode: runtime.mode,
    startedAt: runtime.startedAt,
    baseUrl: runtimeUrl.baseUrl,
    eventPath,
  };
}

function isTerminalForActiveStream(status: RuntimeStatus): boolean {
  return (
    status === "stopping" || status === "stopped" || status === "detached" || status === "failed"
  );
}

function sanitizedBaseUrl(parsed: URL): string {
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, "");
  return `${parsed.origin}${pathname}`;
}

function normalizeEventPath(eventPath: string): string {
  const normalizedPath = eventPath.startsWith("/") ? eventPath : `/${eventPath}`;
  const secretBoundary = normalizedPath.search(/[?#]/u);
  return secretBoundary === -1 ? normalizedPath : normalizedPath.slice(0, secretBoundary);
}

function buildEventStreamUrl(runtimeUrl: NormalizedRuntimeUrl, eventPath: string): string {
  return `${runtimeUrl.baseUrl}${eventPath}`;
}

async function* readServerSentEventMessages(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
): AsyncGenerator<OpenCodeSseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let endedNaturally = false;

  const cancelReader = (): void => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    while (!isSignalAborted(signal)) {
      const { done, value } = await reader.read();
      if (done) {
        endedNaturally = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (parsed !== undefined) {
          yield sseEventToMessage(parsed);
        }
      }
    }

    if (isSignalAborted(signal)) {
      return;
    }

    buffer += decoder.decode();
    const finalFrame = parseSseFrame(buffer);
    if (finalFrame !== undefined) {
      yield sseEventToMessage(finalFrame);
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    if (!endedNaturally) {
      try {
        await reader.cancel();
      } catch {
        // Best-effort cancellation for early consumer return or abort.
      }
    }
    reader.releaseLock();
  }
}

function parseSseFrame(frame: string): ParsedSseEvent | undefined {
  const data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const rawLine of frame.split(/\r?\n/u)) {
    if (rawLine === "" || rawLine.startsWith(":")) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "data") {
      data.push(value);
    } else if (field === "event") {
      event = value;
    } else if (field === "id") {
      id = value;
    }
  }

  if (data.length === 0) {
    return undefined;
  }

  return {
    data: data.join("\n"),
    ...(event !== undefined ? { event } : {}),
    ...(id !== undefined ? { id } : {}),
  };
}

function sseEventToMessage(event: ParsedSseEvent): OpenCodeSseMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(event.data) as unknown;
  } catch {
    raw = event.data;
  }

  return {
    raw,
    ...(event.event !== undefined ? { sseEventName: event.event } : {}),
    ...(event.id !== undefined ? { sseId: event.id } : {}),
  };
}

function mapOpenCodeSseMessageToEnvelope(
  message: OpenCodeSseMessage,
  context: ProviderEventContext,
): AgentEventEnvelope {
  const providerEvent = unwrapProviderEvent(message.raw);
  const providerEventRecord = isRecord(providerEvent) ? providerEvent : undefined;
  const providerEventKind = readString(providerEventRecord?.type);
  const providerEventType =
    providerEventKind === "sync"
      ? (readString(providerEventRecord?.name) ?? providerEventKind)
      : (providerEventKind ?? message.sseEventName ?? "provider.unknown");
  const providerEventId =
    readString(providerEventRecord?.id) ?? message.sseId ?? context.eventIdFactory();
  const properties = isRecord(providerEventRecord?.data)
    ? providerEventRecord.data
    : isRecord(providerEventRecord?.properties)
      ? providerEventRecord.properties
      : {};
  const explicitProviderSessionId =
    readString(properties.sessionID) ?? readString(properties.sessionId);
  const providerSessionId = explicitProviderSessionId ?? context.providerSessionId;
  const eventMetadata = buildEventMetadata(context, {
    providerEventId,
    providerEventType,
    ...(explicitProviderSessionId !== undefined ? { explicitProviderSessionId } : {}),
    ...(message.sseEventName !== undefined ? { sseEventName: message.sseEventName } : {}),
    ...(message.sseId !== undefined ? { sseId: message.sseId } : {}),
  });
  const payload =
    mapKnownOpenCodeEvent(providerEventType, properties, eventMetadata) ??
    buildRawEvent(providerEventType, providerEvent, eventMetadata);

  return {
    id: providerEventId,
    providerId: OPENCODE_PROVIDER_ID,
    ...(providerSessionId !== undefined ? { providerSessionId } : {}),
    ...(context.agentproxySessionId !== undefined
      ? { agentproxySessionId: context.agentproxySessionId }
      : {}),
    type: payload.type,
    timestamp: context.timestamp,
    payload,
    raw: providerEvent,
    metadata: eventMetadata,
  };
}

function unwrapProviderEvent(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.payload) || typeof raw.payload.type !== "string") {
    return raw;
  }

  return raw.payload;
}

function mapKnownOpenCodeEvent(
  providerEventType: string,
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  if (providerEventType === "message.part.delta") {
    return mapMessageDelta(properties, metadata);
  }
  if (providerEventType === "session.next.text.delta") {
    return mapSessionNextTextDelta(properties, metadata);
  }
  if (providerEventType === "session.next.text.delta.1") {
    return mapSessionNextTextDelta(properties, metadata);
  }
  if (providerEventType === "session.next.tool.called.1") {
    return mapToolCalled(properties, metadata);
  }
  if (providerEventType === "session.next.tool.success.1") {
    return mapToolFinished(properties, metadata);
  }
  if (providerEventType === "session.next.tool.failed.1") {
    return mapToolFinished(properties, {
      ...metadata,
      providerToolStatus: "failed",
    });
  }
  if (providerEventType === "session.status") {
    return mapSessionStatus(properties, metadata);
  }
  if (providerEventType === "session.idle") {
    return {
      type: "session.status_changed",
      from: "unknown",
      to: "idle",
      metadata,
    };
  }
  if (providerEventType === "permission.asked") {
    return mapPermissionAsked(properties, metadata);
  }
  if (providerEventType === "permission.replied") {
    return mapPermissionReplied(properties, metadata);
  }
  if (providerEventType === "permission.updated") {
    return mapPermissionUpdated(properties, metadata);
  }
  if (providerEventType === "file.edited") {
    return mapFileEdited(properties, metadata);
  }
  if (providerEventType === "session.diff") {
    return mapSessionDiff(properties, metadata);
  }
  if (
    providerEventType === "session.error" ||
    providerEventType === "session.next.step.failed" ||
    providerEventType === "session.next.step.failed.1"
  ) {
    return mapSessionError(properties, metadata);
  }

  return undefined;
}

function mapMessageDelta(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const delta = readString(properties.delta);
  const field = readString(properties.field);
  if (delta === undefined || field !== "text") {
    return undefined;
  }

  const messageId = readString(properties.messageID);
  return {
    type: "message.delta",
    role: "assistant",
    delta,
    ...(messageId !== undefined ? { messageId } : {}),
    metadata,
  };
}

function mapSessionNextTextDelta(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const delta = readString(properties.delta);
  if (delta === undefined) {
    return undefined;
  }

  return {
    type: "message.delta",
    role: "assistant",
    delta,
    metadata,
  };
}

function mapToolCalled(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const toolCallId = readString(properties.callID) ?? readString(properties.callId);
  const toolName = readString(properties.tool) ?? readString(properties.name);
  if (toolCallId === undefined || toolName === undefined) {
    return undefined;
  }

  return {
    type: "tool.started",
    toolCallId,
    toolName,
    metadata,
  };
}

function mapToolFinished(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const toolCallId = readString(properties.callID) ?? readString(properties.callId);
  if (toolCallId === undefined) {
    return undefined;
  }

  return {
    type: "tool.finished",
    toolCallId,
    toolName: readString(properties.tool) ?? readString(properties.name) ?? "unknown",
    metadata,
  };
}

function mapSessionStatus(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const status = properties.status;
  const statusType = isRecord(status) ? readString(status.type) : readString(status);
  if (statusType === undefined) {
    return undefined;
  }

  return {
    type: "session.status_changed",
    from: "unknown",
    to: normalizeOpenCodeSessionStatus(statusType),
    metadata: {
      ...metadata,
      openCodeStatus: statusType,
    },
  };
}

function mapPermissionAsked(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const permissionId = readString(properties.id);
  const action = readString(properties.permission);
  if (permissionId === undefined || action === undefined) {
    return undefined;
  }

  return {
    type: "permission.requested",
    permissionId,
    action,
    metadata,
  };
}

function mapPermissionUpdated(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const permissionId = readString(properties.id);
  if (permissionId === undefined) {
    return undefined;
  }

  const action =
    readString(properties.permission) ??
    readString(properties.type) ??
    readString(properties.title);
  if (action === undefined) {
    return undefined;
  }

  return {
    type: "permission.requested",
    permissionId,
    action,
    metadata,
  };
}

function mapPermissionReplied(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const permissionId = readString(properties.requestID) ?? readString(properties.permissionID);
  const reply = readString(properties.reply) ?? readString(properties.response);
  if (permissionId === undefined || reply === undefined) {
    return undefined;
  }

  const decision = permissionDecisionFromReply(reply);
  if (decision === undefined) {
    return undefined;
  }

  return {
    type: "permission.resolved",
    permissionId,
    decision,
    metadata,
  };
}

function mapFileEdited(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const file = readString(properties.file);
  if (file === undefined) {
    return undefined;
  }

  return {
    type: "file.changed",
    path: file,
    change: "updated",
    metadata,
  };
}

function mapSessionDiff(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent | undefined {
  const diff = properties.diff;
  if (diff === undefined) {
    return undefined;
  }

  return {
    type: "diff.updated",
    diff: typeof diff === "string" ? diff : JSON.stringify(diff),
    metadata,
  };
}

function mapSessionError(
  properties: Record<string, unknown>,
  metadata: ProviderMetadata,
): AgentEvent {
  const error = properties.error;
  const code = isRecord(error) ? readString(error.type) : undefined;
  const message = isRecord(error) ? readString(error.message) : undefined;

  return {
    type: "error",
    code: code ?? "OPENCODE_SESSION_ERROR",
    message: message ?? "OpenCode session error.",
    metadata,
  };
}

function buildRawEvent(
  providerEventType: string,
  raw: unknown,
  metadata: ProviderMetadata,
): AgentEvent {
  return {
    type: "provider.raw_event",
    providerEventType,
    raw,
    metadata,
  };
}

function normalizeOpenCodeSessionStatus(status: string): string {
  if (status === "busy") {
    return "running";
  }
  if (status === "retry") {
    return "waiting";
  }
  if (status === "idle") {
    return "idle";
  }

  return "unknown";
}

function permissionDecisionFromReply(reply: string): "approved" | "denied" | undefined {
  const normalized = reply.toLowerCase();
  if (
    normalized === "once" ||
    normalized === "always" ||
    normalized === "allow" ||
    normalized === "allowed" ||
    normalized === "approve" ||
    normalized === "approved" ||
    normalized === "accept" ||
    normalized === "accepted" ||
    normalized === "granted"
  ) {
    return "approved";
  }
  if (
    normalized === "reject" ||
    normalized === "rejected" ||
    normalized === "deny" ||
    normalized === "denied" ||
    normalized === "disallow"
  ) {
    return "denied";
  }

  return undefined;
}

function buildEventMetadata(
  context: ProviderEventContext,
  input: {
    providerEventId: string;
    providerEventType: string;
    explicitProviderSessionId?: string;
    sseEventName?: string;
    sseId?: string;
  },
): ProviderMetadata {
  return {
    ...context.metadata,
    [OPENCODE_EVENT_STREAM_METADATA_KEY]: {
      eventPath: context.eventPath,
      ...(context.runtimeId !== undefined ? { runtimeId: context.runtimeId } : {}),
      providerEventId: input.providerEventId,
      providerEventType: input.providerEventType,
      ...(input.explicitProviderSessionId !== undefined
        ? { explicitProviderSessionId: input.explicitProviderSessionId }
        : {}),
      ...(input.sseEventName !== undefined ? { sseEventName: input.sseEventName } : {}),
      ...(input.sseId !== undefined ? { sseId: input.sseId } : {}),
    },
  };
}

function readEventStreamMetadata(
  metadata: ProviderMetadata | undefined,
): OpenCodeEventStreamRuntimeMetadata | undefined {
  const value = metadata?.[OPENCODE_EVENT_STREAM_METADATA_KEY];
  if (!isRecord(value)) {
    return undefined;
  }

  const eventPath = readString(value.eventPath);
  const interruptCount = readNumber(value.interruptCount);
  const reconnectAttempt = readNumber(value.reconnectAttempt);
  const maxReconnectAttempts = readNumber(value.maxReconnectAttempts);
  if (
    eventPath === undefined ||
    interruptCount === undefined ||
    reconnectAttempt === undefined ||
    maxReconnectAttempts === undefined
  ) {
    return undefined;
  }

  const runtimeMetadata: OpenCodeEventStreamRuntimeMetadata = {
    eventPath,
    interruptCount,
    reconnectAttempt,
    maxReconnectAttempts,
  };

  assignOptionalString(runtimeMetadata, "connectedAt", value.connectedAt);
  assignOptionalString(runtimeMetadata, "lastConnectedAt", value.lastConnectedAt);
  assignOptionalString(runtimeMetadata, "lastInterruptedAt", value.lastInterruptedAt);
  assignOptionalString(runtimeMetadata, "lastReconnectingAt", value.lastReconnectingAt);
  assignOptionalString(runtimeMetadata, "failedAt", value.failedAt);
  assignOptionalString(runtimeMetadata, "failureReason", value.failureReason);
  assignOptionalString(runtimeMetadata, "lastStatusCompensatedAt", value.lastStatusCompensatedAt);
  assignOptionalString(
    runtimeMetadata,
    "statusCompensationFailedAt",
    value.statusCompensationFailedAt,
  );
  assignOptionalNumber(runtimeMetadata, "reconnectDelayMs", value.reconnectDelayMs);
  assignOptionalNumber(runtimeMetadata, "lastHttpStatus", value.lastHttpStatus);

  return runtimeMetadata;
}

function assignOptionalString<TKey extends keyof OpenCodeEventStreamRuntimeMetadata>(
  metadata: OpenCodeEventStreamRuntimeMetadata,
  key: TKey,
  value: unknown,
): void {
  if (typeof value === "string") {
    metadata[key] = value as OpenCodeEventStreamRuntimeMetadata[TKey];
  }
}

function assignOptionalNumber<TKey extends keyof OpenCodeEventStreamRuntimeMetadata>(
  metadata: OpenCodeEventStreamRuntimeMetadata,
  key: TKey,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    metadata[key] = value as OpenCodeEventStreamRuntimeMetadata[TKey];
  }
}

function normalizeEventStreamInterruption(
  error: unknown,
  context: {
    runtimeId: string;
    serverUrl: string;
    eventPath: string;
    reconnectAttempt: number;
    maxReconnectAttempts: number;
  },
): Error {
  if (isAgentProxyError(error) && error.code === "EVENT_STREAM_INTERRUPTED") {
    return error;
  }

  return createEventStreamInterruptedError("OpenCode event stream was interrupted.", {
    ...context,
    failureReason: "stream_interrupted",
  });
}

function createEventStreamInterruptedError(
  message: string,
  details: Record<string, unknown>,
): Error {
  return createAgentProxyError({
    code: "EVENT_STREAM_INTERRUPTED",
    message,
    providerId: OPENCODE_PROVIDER_ID,
    operation: "opencode.eventStream.subscribe",
    details,
  });
}

function createRuntimeChangedError(
  runtimeGuard: RuntimeStreamGuard,
  details: Record<string, unknown>,
): Error {
  return createEventStreamInterruptedError("OpenCode event stream runtime changed.", {
    runtimeId: runtimeGuard.runtimeId,
    serverUrl: runtimeGuard.baseUrl,
    eventPath: runtimeGuard.eventPath,
    ...details,
  });
}

function readFailureReason(error: Error): string {
  if (!isAgentProxyError(error)) {
    return "stream_interrupted";
  }

  const failureReason = error.details?.failureReason;
  return typeof failureReason === "string" ? failureReason : "stream_interrupted";
}

function readLastHttpStatusPatch(error: Error): { lastHttpStatus: number } | Record<string, never> {
  if (!isAgentProxyError(error)) {
    return {};
  }

  const httpStatus = error.details?.httpStatus;
  return typeof httpStatus === "number" ? { lastHttpStatus: httpStatus } : {};
}

function reconnectDelayForAttempt(
  attempt: number,
  options: { baseDelayMs: number; maxDelayMs: number },
): number {
  const delayMs = options.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(Math.max(0, delayMs), Math.max(0, options.maxDelayMs));
}

async function waitForReconnectDelay(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  try {
    await delay(delayMs, undefined, signal === undefined ? undefined : { signal });
  } catch (error) {
    if (isSignalAborted(signal)) {
      return;
    }
    throw error;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function defaultEventIdFactory(): string {
  return `event_opencode_${randomUUID()}`;
}
