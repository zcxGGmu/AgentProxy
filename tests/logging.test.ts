import { describe, expect, it } from "vitest";
import { createAgentProxyError } from "../src/core/index.js";
import {
  AGENTPROXY_REDACTED_VALUE,
  createAgentProxyLogger,
  createOutputWriters,
  redactCommandArgs,
  redactString,
  redactValue,
} from "../src/logging/index.js";

function createMemorySink(): { chunks: string[]; write: (chunk: string) => boolean } {
  const chunks: string[] = [];

  return {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  };
}

function parseLogLine(chunk: string): Record<string, unknown> {
  return JSON.parse(chunk) as Record<string, unknown>;
}

describe("AgentProxy structured logging", () => {
  it("emits structured newline-delimited JSON logs to stderr-compatible sinks", () => {
    const sink = createMemorySink();
    const logger = createAgentProxyLogger({
      sink,
      now: () => new Date("2026-05-19T00:00:00.000Z"),
      context: {
        correlationId: "corr_1",
        providerId: "opencode",
        runtimeId: "runtime_1",
        sessionId: "session_1",
        providerSessionId: "provider_session_1",
        operation: "providers.inspect",
      },
    });

    logger.info("provider inspected", { result: "success" });

    expect(sink.chunks).toHaveLength(1);
    expect(sink.chunks[0]).toMatch(/\n$/);
    expect(parseLogLine(sink.chunks[0] ?? "")).toEqual({
      timestamp: "2026-05-19T00:00:00.000Z",
      level: "info",
      namespace: "agentproxy",
      correlationId: "corr_1",
      providerId: "opencode",
      runtimeId: "runtime_1",
      sessionId: "session_1",
      providerSessionId: "provider_session_1",
      operation: "providers.inspect",
      message: "provider inspected",
      data: {
        result: "success",
      },
    });
  });

  it("generates and preserves a correlationId across child logger contexts", () => {
    const sink = createMemorySink();
    const logger = createAgentProxyLogger({ sink });
    const child = logger.child({
      providerId: "opencode",
      operation: "run",
    });

    child.info("operation started");

    const record = parseLogLine(sink.chunks[0] ?? "");
    expect(typeof logger.correlationId).toBe("string");
    expect(logger.correlationId.length).toBeGreaterThan(0);
    expect(record.correlationId).toBe(logger.correlationId);
    expect(record.providerId).toBe("opencode");
    expect(record.operation).toBe("run");
  });

  it("emits debug logs only when debug is explicitly enabled", () => {
    const quietSink = createMemorySink();
    createAgentProxyLogger({ sink: quietSink, level: "info" }).debug("hidden debug");
    expect(quietSink.chunks).toEqual([]);

    const debugSink = createMemorySink();
    createAgentProxyLogger({ sink: debugSink, level: "info", debug: true }).debug("visible debug");
    expect(parseLogLine(debugSink.chunks[0] ?? "").level).toBe("debug");

    const levelSink = createMemorySink();
    createAgentProxyLogger({ sink: levelSink, level: "debug" }).debug("visible by level");
    expect(parseLogLine(levelSink.chunks[0] ?? "").message).toBe("visible by level");
  });

  it("redacts secret-shaped values in log messages", () => {
    const sink = createMemorySink();
    const logger = createAgentProxyLogger({
      sink,
      context: { correlationId: "corr_message" },
      now: () => new Date("2026-05-19T00:00:00.000Z"),
    });

    logger.warn('failed request {"apiKey":"sk-message-secret","password":"plain-secret"}');

    const output = sink.chunks.join("");
    expect(output).not.toContain("sk-message-secret");
    expect(output).not.toContain("plain-secret");
    expect(parseLogLine(sink.chunks[0] ?? "").message).toBe(
      'failed request {"apiKey":[REDACTED],"password":[REDACTED]}',
    );
  });

  it("redacts inline env-var style secrets in log messages", () => {
    const sink = createMemorySink();
    const logger = createAgentProxyLogger({
      sink,
      context: { correlationId: "corr_env_message" },
      now: () => new Date("2026-05-19T00:00:00.000Z"),
    });

    logger.error("OPENAI_API_KEY=sk-live-secret AGENTPROXY_TOKEN=agent-token-secret");

    expect(sink.chunks.join("")).not.toContain("sk-live-secret");
    expect(sink.chunks.join("")).not.toContain("agent-token-secret");
    expect(parseLogLine(sink.chunks[0] ?? "").message).toBe(
      "OPENAI_API_KEY=[REDACTED] AGENTPROXY_TOKEN=[REDACTED]",
    );
  });
});

describe("AgentProxy redaction", () => {
  it("redacts env-like and config-like secret fields by key", () => {
    const value = {
      env: {
        OPENAI_API_KEY: "sk-env-secret",
        AGENTPROXY_TOKEN: "agentproxy-token",
        PATH: "/usr/bin",
      },
      config: {
        providers: {
          opencode: {
            passthroughEnv: {
              OPENCODE_SERVER_PASSWORD: "native-password",
            },
          },
        },
      },
    };

    expect(redactValue(value)).toEqual({
      env: {
        OPENAI_API_KEY: AGENTPROXY_REDACTED_VALUE,
        AGENTPROXY_TOKEN: AGENTPROXY_REDACTED_VALUE,
        PATH: "/usr/bin",
      },
      config: {
        providers: {
          opencode: {
            passthroughEnv: {
              OPENCODE_SERVER_PASSWORD: AGENTPROXY_REDACTED_VALUE,
            },
          },
        },
      },
    });
    expect(JSON.stringify(redactValue(value))).not.toContain("sk-env-secret");
    expect(JSON.stringify(redactValue(value))).not.toContain("native-password");
  });

  it("redacts secret-shaped command arguments and inline authorization values", () => {
    const args = [
      "run",
      "--api-key",
      "sk-arg-secret",
      "--token=token-secret",
      "Authorization: Bearer bearer-secret",
      "--model",
      "openai/gpt-test",
    ];

    const redacted = redactCommandArgs(args);

    expect(redacted).toEqual([
      "run",
      "--api-key",
      AGENTPROXY_REDACTED_VALUE,
      "--token=[REDACTED]",
      "Authorization: [REDACTED]",
      "--model",
      "openai/gpt-test",
    ]);
    expect(JSON.stringify(redacted)).not.toContain("sk-arg-secret");
    expect(JSON.stringify(redacted)).not.toContain("token-secret");
    expect(JSON.stringify(redacted)).not.toContain("bearer-secret");
  });

  it("redacts Error and AgentProxyError payloads before logging", () => {
    const error = createAgentProxyError({
      code: "CONFIG_INVALID",
      message: "invalid password=plain-secret",
      operation: "config.validate",
      rawMessage: "Authorization: Bearer raw-secret",
      details: {
        token: "detail-token",
        field: "logging.level",
      },
    });

    const redacted = redactValue({
      error,
      cause: new Error("api_key=cause-secret"),
    });

    expect(redacted).toEqual({
      error: {
        name: "AgentProxyError",
        message: "invalid password=[REDACTED]",
        code: "CONFIG_INVALID",
        operation: "config.validate",
        rawMessage: "Authorization: [REDACTED]",
        details: {
          token: AGENTPROXY_REDACTED_VALUE,
          field: "logging.level",
        },
      },
      cause: {
        name: "Error",
        message: "api_key=[REDACTED]",
      },
    });
    expect(JSON.stringify(redacted)).not.toContain("plain-secret");
    expect(JSON.stringify(redacted)).not.toContain("raw-secret");
    expect(JSON.stringify(redacted)).not.toContain("detail-token");
    expect(JSON.stringify(redacted)).not.toContain("cause-secret");
  });

  it("redacts JSON-style inline secret strings", () => {
    const redacted = redactString(
      '{"api_key":"sk-json-secret","apiKey":"sk-camel-secret","password":"plain-secret","OPENAI_API_KEY":"sk-env-secret","safe":"ok"}',
    );

    expect(redacted).toBe(
      '{"api_key":[REDACTED],"apiKey":[REDACTED],"password":[REDACTED],"OPENAI_API_KEY":[REDACTED],"safe":"ok"}',
    );
    expect(redacted).not.toContain("sk-json-secret");
    expect(redacted).not.toContain("sk-camel-secret");
    expect(redacted).not.toContain("plain-secret");
    expect(redacted).not.toContain("sk-env-secret");
  });

  it("redacts prefixed env-style secret names inside strings", () => {
    const redacted = redactString(
      "OPENAI_API_KEY=sk-inline-secret OPENCODE_SERVER_PASSWORD=native-password safe=value",
    );

    expect(redacted).toBe(
      "OPENAI_API_KEY=[REDACTED] OPENCODE_SERVER_PASSWORD=[REDACTED] safe=value",
    );
    expect(redacted).not.toContain("sk-inline-secret");
    expect(redacted).not.toContain("native-password");
  });

  it("redacts space-separated CLI secret flags inside strings", () => {
    const redacted = redactString("agentproxy run --api-key sk-space-secret --model safe-model");

    expect(redacted).toBe("agentproxy run --api-key [REDACTED] --model safe-model");
    expect(redacted).not.toContain("sk-space-secret");
  });
});

describe("AgentProxy stdout and stderr separation", () => {
  it("keeps JSON results on stdout and diagnostics/logs on stderr", () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const writers = createOutputWriters({ stdout, stderr });
    const logger = createAgentProxyLogger({
      sink: stderr,
      context: { correlationId: "corr_json", operation: "sessions.list" },
      now: () => new Date("2026-05-19T00:00:00.000Z"),
    });

    writers.writeJson({ ok: true });
    writers.writeDiagnostic("warning: provider is in limited mode");
    logger.info("sessions listed", { apiKey: "sk-log-secret" });

    expect(stdout.chunks.join("")).toBe('{"ok":true}\n');
    expect(stderr.chunks[0]).toBe("warning: provider is in limited mode\n");
    expect(stderr.chunks).toHaveLength(2);
    expect(stderr.chunks.join("")).not.toContain("sk-log-secret");
    expect(parseLogLine(stderr.chunks[1] ?? "")).toMatchObject({
      level: "info",
      correlationId: "corr_json",
      operation: "sessions.list",
      data: {
        apiKey: AGENTPROXY_REDACTED_VALUE,
      },
    });
  });

  it("redacts diagnostic stderr output by default", () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const writers = createOutputWriters({ stdout, stderr });

    writers.writeDiagnostic("Authorization: Bearer diagnostic-secret");

    expect(stdout.chunks).toEqual([]);
    expect(stderr.chunks.join("")).toBe("Authorization: [REDACTED]\n");
    expect(stderr.chunks.join("")).not.toContain("diagnostic-secret");
  });

  it("redacts inline env-var style secrets in diagnostic stderr output", () => {
    const stdout = createMemorySink();
    const stderr = createMemorySink();
    const writers = createOutputWriters({ stdout, stderr });

    writers.writeDiagnostic("OPENAI_API_KEY=sk-live-secret AGENTPROXY_TOKEN=agent-token-secret");

    expect(stdout.chunks).toEqual([]);
    expect(stderr.chunks.join("")).toBe("OPENAI_API_KEY=[REDACTED] AGENTPROXY_TOKEN=[REDACTED]\n");
    expect(stderr.chunks.join("")).not.toContain("sk-live-secret");
    expect(stderr.chunks.join("")).not.toContain("agent-token-secret");
  });
});
