import { redactString } from "./redact.js";

export interface OutputSink {
  write(chunk: string): unknown;
}

export interface AgentProxyOutputWriters {
  stdout: OutputSink;
  stderr: OutputSink;
  writeResult(message: string): void;
  writeJson(value: unknown): void;
  writeDiagnostic(message: string): void;
}

export interface CreateOutputWritersOptions {
  stdout?: OutputSink;
  stderr?: OutputSink;
  redactDiagnostics?: boolean;
}

export function createOutputWriters(
  options: CreateOutputWritersOptions = {},
): AgentProxyOutputWriters {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const redactDiagnostics = options.redactDiagnostics ?? true;

  return {
    stdout,
    stderr,
    writeResult(message: string): void {
      stdout.write(ensureTrailingNewline(message));
    },
    writeJson(value: unknown): void {
      stdout.write(`${JSON.stringify(value)}\n`);
    },
    writeDiagnostic(message: string): void {
      stderr.write(ensureTrailingNewline(redactDiagnostics ? redactString(message) : message));
    },
  };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
