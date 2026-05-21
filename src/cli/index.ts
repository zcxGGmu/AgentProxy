#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import {
  resolveAgentProxyConfig,
  type AgentProxyCliConfigOverrides,
  type AgentProxyConfig,
} from "../config/index.js";
import { createAgentProxyError, isAgentProxyError } from "../core/index.js";
import {
  createOutputWriters,
  redactValue,
  type AgentProxyOutputWriters,
} from "../logging/index.js";
import { OPENCODE_PROVIDER_ID, OpenCodeProvider } from "../providers/opencode/index.js";
import type { AgentProvider } from "../providers/types.js";
import { launchAgentProxyChat } from "./chat.js";
import {
  formatDoctorHumanReport,
  mapDoctorReportToExitCode,
  runAgentProxyDoctor,
} from "./doctor.js";
import {
  formatProviderInspectHumanReport,
  formatProvidersListHumanReport,
  inspectAgentProxyProvider,
  listAgentProxyProviders,
} from "./providers.js";
import {
  formatRunEventForHuman,
  formatRunReportForJson,
  runAgentProxyPrompt,
  sanitizeHumanInline,
  sanitizeHumanText,
  type AgentProxyRunEventSummary,
} from "./run.js";
import { formatRuntimeListHumanReport, listAgentProxyRuntimes } from "./runtime.js";
import { formatSessionListHumanReport, listAgentProxySessions } from "./sessions.js";

export const AGENTPROXY_VERSION = "0.1.0";

const implementedCoreWorkflows = [
  "agentproxy doctor",
  "agentproxy run [prompt]",
  "agentproxy chat [--workspace .]",
  "agentproxy providers list|inspect",
  "agentproxy runtime list",
  "agentproxy sessions list",
  "agentproxy provider exec <id> -- <native args>",
];

const plannedCoreWorkflows = [
  "agentproxy sessions show|resume|abort|delete|export|import|share|unshare",
  "agentproxy runtime stop",
  "agentproxy config get|set",
];

const globalOptionDefinitions = [
  {
    flags: "--provider <id>",
    description: "Provider id to use.",
    defaultValue: OPENCODE_PROVIDER_ID,
  },
  { flags: "--workspace <path>", description: "Workspace path.", defaultValue: "." },
  { flags: "--json", description: "Print machine-readable JSON output." },
  { flags: "--verbose", description: "Print more human-readable progress details." },
  { flags: "--debug", description: "Print opt-in diagnostic details." },
  { flags: "--config <path>", description: "Path to an AgentProxy config file." },
] as const;

type GlobalOptionName = "provider" | "workspace" | "json" | "verbose" | "debug" | "config";

interface CliGlobalOptions {
  provider: string;
  workspace: string;
  json: boolean;
  verbose: boolean;
  debug: boolean;
  config?: string;
}

function plannedAction(
  commandName: string,
  output: AgentProxyOutputWriters,
): (this: Command) => void {
  return function (this: Command) {
    handleCliError(
      createAgentProxyError({
        code: "CAPABILITY_UNSUPPORTED",
        message: `agentproxy ${commandName} is planned for a later phase and is not implemented yet.`,
        operation: commandName,
        details: {
          suggestion:
            "Use provider passthrough for provider-native commands that are not abstracted yet.",
        },
      }),
      output,
      this,
    );
  };
}

export interface CreateProgramOptions {
  output?: AgentProxyOutputWriters;
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  stdin?: AsyncIterable<string | Buffer | Uint8Array>;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const program = new Command();
  const output = options.output ?? createOutputWriters();

  program.configureOutput({
    writeOut: (chunk) => output.stdout.write(chunk),
    writeErr: (chunk) => output.writeDiagnostic(sanitizeHumanDiagnostic(chunk)),
    outputError: (chunk, write) => write(sanitizeHumanDiagnostic(chunk)),
  });

  program
    .name("agentproxy")
    .description("Thin control plane for Coding Agent runtimes. v1 targets OpenCode.")
    .version(AGENTPROXY_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError();

  addGlobalOptions(program, { includeDefaults: true });

  program.addHelpText(
    "after",
    `\nImplemented core workflows:\n  ${implementedCoreWorkflows.join(
      "\n  ",
    )}\n\nPlanned core workflows:\n  ${plannedCoreWorkflows.join("\n  ")}\n`,
  );

  program
    .command("doctor")
    .description("Check AgentProxy, provider, runtime, and workspace health.")
    .option("--managed-smoke", "Start and stop a temporary managed OpenCode runtime.")
    .action(createDoctorAction(output, options));

  program
    .command("run")
    .argument("[prompt]", "Prompt to send to the provider runtime.")
    .option("--model <model>", "Provider model selection.")
    .description("Run a headless OpenCode task through AgentProxy.")
    .action(createRunAction(output, options));

  program
    .command("chat")
    .option("--session <id>", "Reserved for later session-aware native TUI launch.")
    .description("Open the OpenCode native TUI for the selected workspace.")
    .action(createChatAction(output, options));

  const sessions = program.command("sessions").description("Manage indexed provider sessions.");
  sessions
    .command("list")
    .description("List known sessions.")
    .action(createSessionsListAction(output, options));
  sessions
    .command("show")
    .argument("<id>", "Session id.")
    .description("Show session details.")
    .action(plannedAction("sessions show", output));
  sessions
    .command("resume")
    .argument("<id>", "Session id.")
    .option("--prompt <prompt>", "Prompt to send after resuming.")
    .description("Resume a session.")
    .action(plannedAction("sessions resume", output));
  sessions
    .command("abort")
    .argument("<id>", "Session id.")
    .description("Abort a running session.")
    .action(plannedAction("sessions abort", output));
  sessions
    .command("delete")
    .argument("<id>", "Session id.")
    .option("--yes", "Skip interactive confirmation.")
    .description("Delete a session tombstone-aware.")
    .action(plannedAction("sessions delete", output));
  sessions
    .command("export")
    .argument("<id>", "Session id.")
    .option("--sanitize", "Sanitize exported data.")
    .option("--output <path>", "Output file.")
    .description("Export a session.")
    .action(plannedAction("sessions export", output));
  sessions
    .command("import")
    .argument("<source>", "File or URL.")
    .description("Import a provider session.")
    .action(plannedAction("sessions import", output));
  sessions
    .command("share")
    .argument("<id>", "Session id.")
    .description("Share a session through the provider.")
    .action(plannedAction("sessions share", output));
  sessions
    .command("unshare")
    .argument("<id>", "Session id.")
    .description("Remove provider session sharing.")
    .action(plannedAction("sessions unshare", output));

  const providers = program.command("providers").description("Inspect registered providers.");
  providers
    .command("list")
    .description("List providers and capabilities.")
    .action(createProvidersListAction(output, options));
  providers
    .command("inspect")
    .argument("<id>", "Provider id.")
    .description("Inspect provider health and capabilities.")
    .action(createProvidersInspectAction(output, options));

  const provider = program.command("provider").description("Provider passthrough commands.");
  provider
    .command("exec")
    .argument("<id>", "Provider id.")
    .argument("[nativeArgs...]", "Native provider arguments after --.")
    .allowUnknownOption(true)
    .description("Execute a provider-native command without changing AgentProxy state.")
    .action(createProviderExecAction(output, options));

  const runtime = program.command("runtime").description("Manage provider runtime connections.");
  runtime
    .command("list")
    .description("List known runtimes.")
    .action(createRuntimeListAction(output, options));
  runtime
    .command("stop")
    .argument("<runtime-id>", "Runtime id.")
    .description("Stop a managed runtime.")
    .action(plannedAction("runtime stop", output));

  const config = program
    .command("config")
    .description("Inspect or update AgentProxy configuration.");
  config
    .command("get")
    .argument("[key]", "Config key.")
    .description("Read config values.")
    .action(plannedAction("config get", output));
  config
    .command("set")
    .argument("<key>", "Config key.")
    .argument("<value>", "Config value.")
    .description("Set an AgentProxy config value.")
    .action(plannedAction("config set", output));

  addGlobalOptionsDeep(program, { includeDefaults: false });

  return program;
}

function addGlobalOptionsDeep(command: Command, options: { includeDefaults: boolean }): void {
  for (const child of command.commands) {
    addGlobalOptions(child, options);
    addGlobalOptionsDeep(child, options);
  }
}

function addGlobalOptions(command: Command, options: { includeDefaults: boolean }): void {
  for (const definition of globalOptionDefinitions) {
    if (options.includeDefaults && "defaultValue" in definition) {
      command.option(definition.flags, definition.description, definition.defaultValue);
      continue;
    }

    command.option(definition.flags, definition.description);
  }
}

function createDoctorAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command) => Promise<void> {
  return async function (this: Command) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      if (globalOptions.provider !== OPENCODE_PROVIDER_ID) {
        throw createAgentProxyError({
          code: "PROVIDER_NOT_FOUND",
          message: `Provider not found: ${globalOptions.provider}`,
          operation: "doctor",
          providerId: globalOptions.provider,
          details: {
            suggestion: "AgentProxy v1 doctor currently supports the opencode provider.",
          },
        });
      }

      const doctorOptions = this.opts<{ managedSmoke?: boolean }>();
      const report = await runAgentProxyDoctor({
        agentProxyVersion: AGENTPROXY_VERSION,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
        includeManagedSmoke: doctorOptions.managedSmoke === true,
      });

      if (globalOptions.json) {
        output.writeJson(report);
      } else {
        output.writeResult(
          formatDoctorHumanReport(report, {
            verbose: globalOptions.verbose,
            debug: globalOptions.debug,
          }),
        );
      }
      process.exitCode = mapDoctorReportToExitCode(report);
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createRunAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command, prompt?: string) => Promise<void> {
  return async function (this: Command, prompt) {
    let openTextLine = false;
    const writeHumanLine = (message: string): void => {
      if (openTextLine) {
        output.stdout.write("\n");
        openTextLine = false;
      }
      output.writeResult(message);
    };
    const writeHumanEvent = (event: AgentProxyRunEventSummary, humanOutput?: string): void => {
      const formatted = formatRunEventForHuman(event, humanOutput);
      if (formatted === undefined || formatted === "") {
        return;
      }
      if (event.type === "message.delta") {
        output.stdout.write(formatted);
        openTextLine = !formatted.endsWith("\n");
        return;
      }

      writeHumanLine(formatted);
    };

    try {
      const globalOptions = getCliGlobalOptions(this);
      const runOptions = this.opts<{ model?: string }>();
      const report = await runAgentProxyPrompt({
        providerId: globalOptions.provider,
        ...(prompt !== undefined ? { prompt } : {}),
        ...(runOptions.model !== undefined ? { model: runOptions.model } : {}),
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
        cli: createCliConfigOverrides(this),
        ...(globalOptions.json
          ? {}
          : {
              onSessionStarted: (session) => {
                writeHumanLine(`Session: ${sanitizeHumanInline(session.sessionId)}`);
                writeHumanLine(
                  `Provider session: ${sanitizeHumanInline(session.providerSessionId)}`,
                );
                writeHumanLine(
                  `Runtime: ${sanitizeHumanInline(
                    session.runtime.runtimeId ?? "configured",
                  )} (${sanitizeHumanInline(session.runtime.mode)})`,
                );
              },
              onEvent: writeHumanEvent,
            }),
      });

      if (globalOptions.json) {
        output.writeJson(formatRunReportForJson(report));
      } else {
        if (openTextLine) {
          output.stdout.write("\n");
          openTextLine = false;
        }
        output.writeResult(`Status: ${report.status}`);
      }
      process.exitCode = mapRunReportToExitCode(report);
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createChatAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command) => Promise<void> {
  return async function (this: Command) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      const chatOptions = this.opts<{ session?: string }>();
      if (globalOptions.provider !== OPENCODE_PROVIDER_ID) {
        throw createAgentProxyError({
          code: "PROVIDER_NOT_FOUND",
          message: `Provider not found: ${globalOptions.provider}`,
          operation: "chat",
          providerId: globalOptions.provider,
          details: {
            suggestion: "AgentProxy v1 chat currently supports the opencode provider only.",
          },
        });
      }
      if (chatOptions.session !== undefined) {
        throw createAgentProxyError({
          code: "CAPABILITY_UNSUPPORTED",
          message: "agentproxy chat --session is not implemented yet.",
          operation: "chat",
          providerId: globalOptions.provider,
          details: {
            suggestion:
              "Use agentproxy run for headless prompts and await later session-aware chat support.",
          },
        });
      }
      if (globalOptions.json) {
        throw createAgentProxyError({
          code: "CAPABILITY_UNSUPPORTED",
          message: "agentproxy chat --json is not supported for the native TUI launcher.",
          operation: "chat",
          providerId: globalOptions.provider,
          details: {
            suggestion: "Run agentproxy chat without --json to hand the terminal to OpenCode.",
          },
        });
      }

      const result = await launchAgentProxyChat({
        providerId: globalOptions.provider,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });
      process.exitCode = result.exitCode;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createProvidersListAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command) => Promise<void> {
  return async function (this: Command) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      const report = await listAgentProxyProviders({
        providerId: globalOptions.provider,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });

      if (globalOptions.json) {
        output.writeJson(report);
      } else {
        output.writeResult(formatProvidersListHumanReport(report));
      }
      process.exitCode = 0;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createProvidersInspectAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command, providerId: string) => Promise<void> {
  return async function (this: Command, providerId) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      const report = await inspectAgentProxyProvider(providerId, {
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });

      if (globalOptions.json) {
        output.writeJson(report);
      } else {
        output.writeResult(formatProviderInspectHumanReport(report));
      }
      process.exitCode = 0;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createRuntimeListAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command) => Promise<void> {
  return async function (this: Command) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      const report = await listAgentProxyRuntimes({
        providerId: globalOptions.provider,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });

      if (globalOptions.json) {
        output.writeJson(report);
      } else {
        output.writeResult(formatRuntimeListHumanReport(report));
      }
      process.exitCode = 0;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function createSessionsListAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command) => Promise<void> {
  return async function (this: Command) {
    try {
      const globalOptions = getCliGlobalOptions(this);
      const report = await listAgentProxySessions({
        providerId: globalOptions.provider,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });

      if (globalOptions.json) {
        output.writeJson(report);
      } else {
        output.writeResult(formatSessionListHumanReport(report));
      }
      process.exitCode = 0;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function mapRunReportToExitCode(report: { status: string }): number {
  if (report.status === "completed") {
    return 0;
  }
  if (report.status === "failed") {
    return 1;
  }
  return 9;
}

function createProviderExecAction(
  output: AgentProxyOutputWriters,
  options: CreateProgramOptions,
): (this: Command, providerId: string, nativeArgs?: string[]) => Promise<void> {
  return async function (this: Command, providerId, nativeArgs = []) {
    try {
      const resolvedConfig = await resolveAgentProxyConfig({
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        cli: createCliConfigOverrides(this),
      });
      const provider = createConfiguredProvider(providerId, resolvedConfig.config, options);
      const result = await provider.passthrough({
        providerId,
        workspacePath: resolvedConfig.config.workspacePath,
        args: nativeArgs,
        metadata: {},
      });

      if (result.stdout !== "") {
        output.stdout.write(result.stdout);
      }
      if (result.stderr !== "") {
        output.stderr.write(result.stderr);
      }
      process.exitCode = result.exitCode;
    } catch (error) {
      handleCliError(error, output, this);
    }
  };
}

function getRootCommand(command: Command): Command {
  let current = command;
  while (current.parent !== null) {
    current = current.parent;
  }
  return current;
}

function createCliConfigOverrides(command: Command): AgentProxyCliConfigOverrides {
  const options = getCliGlobalOptions(command);
  const overrides: AgentProxyCliConfigOverrides = {};

  if (getOptionValueSourceFromChain(command, "config") === "cli" && options.config !== undefined) {
    overrides.configPath = options.config;
  }
  if (getOptionValueSourceFromChain(command, "workspace") === "cli") {
    overrides.workspacePath = options.workspace;
  }

  return overrides;
}

function getCliGlobalOptions(command: Command): CliGlobalOptions {
  const provider = getOptionValueFromChain<string>(command, "provider") ?? OPENCODE_PROVIDER_ID;
  const workspace = getOptionValueFromChain<string>(command, "workspace") ?? ".";
  const config = getOptionValueFromChain<string>(command, "config");

  return {
    provider,
    workspace,
    json: Boolean(getOptionValueFromChain<boolean>(command, "json")),
    verbose: Boolean(getOptionValueFromChain<boolean>(command, "verbose")),
    debug: Boolean(getOptionValueFromChain<boolean>(command, "debug")),
    ...(config !== undefined ? { config } : {}),
  };
}

function getOptionValueFromChain<T>(command: Command, optionName: GlobalOptionName): T | undefined {
  for (const candidate of getCommandChain(command)) {
    if (candidate.getOptionValueSource(optionName) === "cli") {
      return candidate.getOptionValue(optionName) as T | undefined;
    }
  }

  return getRootCommand(command).getOptionValue(optionName) as T | undefined;
}

function getOptionValueSourceFromChain(
  command: Command,
  optionName: GlobalOptionName,
): string | undefined {
  for (const candidate of getCommandChain(command)) {
    const source = candidate.getOptionValueSource(optionName);
    if (source === "cli") {
      return source;
    }
  }

  return getRootCommand(command).getOptionValueSource(optionName);
}

function getCommandChain(command: Command): Command[] {
  const chain: Command[] = [];
  let current: Command | null = command;

  while (current !== null) {
    chain.push(current);
    current = current.parent;
  }

  return chain;
}

function createConfiguredProvider(
  providerId: string,
  config: AgentProxyConfig,
  options: CreateProgramOptions,
): AgentProvider {
  if (providerId !== OPENCODE_PROVIDER_ID) {
    throw createAgentProxyError({
      code: "PROVIDER_NOT_FOUND",
      message: `Provider not found: ${providerId}`,
      operation: "provider.exec",
      providerId,
    });
  }

  const opencode = config.providers.opencode;
  if (!opencode.enabled) {
    throw createAgentProxyError({
      code: "PROVIDER_UNAVAILABLE",
      message: "OpenCode provider is disabled in AgentProxy config.",
      operation: "provider.exec",
      providerId,
      details: {
        suggestion: "Enable providers.opencode.enabled before running provider passthrough.",
      },
    });
  }

  return new OpenCodeProvider({
    binary: opencode.binary,
    cwd: config.workspacePath,
    passthroughEnv: opencode.passthroughEnv,
    ...(options.env !== undefined ? { env: options.env } : {}),
  });
}

function handleCliError(error: unknown, output: AgentProxyOutputWriters, command?: Command): void {
  process.exitCode = mapCliErrorToExitCode(error);

  if (isCommanderError(error)) {
    return;
  }

  if (command !== undefined && getCliGlobalOptions(command).json) {
    output.writeJson(formatCliJsonError(error));
    return;
  }

  output.writeDiagnostic(sanitizeHumanDiagnostic(formatCliError(error)));
}

function formatCliError(error: unknown): string {
  if (isAgentProxyError(error)) {
    const suggestion =
      typeof error.details?.suggestion === "string" ? `\n${error.details.suggestion}` : "";
    return `${error.code}: ${error.message}${suggestion}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function formatCliJsonError(error: unknown): unknown {
  if (!isAgentProxyError(error)) {
    return redactValue({
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return redactValue({
    ok: false,
    error: {
      code: error.code,
      ...(error.providerId !== undefined ? { providerId: error.providerId } : {}),
      ...(error.operation !== undefined ? { operation: error.operation } : {}),
      message: error.message,
      ...(typeof error.details?.suggestion === "string" ? { next: error.details.suggestion } : {}),
    },
  });
}

export function mapCliErrorToExitCode(error: unknown): number {
  if (isCommanderError(error)) {
    return error.exitCode === 0 ? 0 : 2;
  }

  if (!isAgentProxyError(error)) {
    return 1;
  }

  switch (error.code) {
    case "CONFIG_INVALID":
      return 3;
    case "PROVIDER_NOT_FOUND":
    case "PROVIDER_UNAVAILABLE":
      return 4;
    case "CAPABILITY_UNSUPPORTED":
      return 6;
    case "PERMISSION_DENIED":
      return 8;
    case "RUNTIME_START_FAILED":
      return 5;
    case "RUNTIME_HEALTH_FAILED":
    case "EVENT_STREAM_INTERRUPTED":
      return 9;
    case "STORAGE_ERROR":
      return 10;
    case "SESSION_NOT_FOUND":
    case "PASSTHROUGH_FAILED":
      return 1;
  }
}

function isCommanderError(error: unknown): error is { code: string; exitCode: number } {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const maybeCommanderError = error as { code?: unknown; exitCode?: unknown };
  return (
    typeof maybeCommanderError.code === "string" &&
    maybeCommanderError.code.startsWith("commander.") &&
    typeof maybeCommanderError.exitCode === "number"
  );
}

export function normalizeCliArgv(argv: string[]): string[] {
  return argv[2] === "--" ? [argv[0] ?? "node", argv[1] ?? "agentproxy", ...argv.slice(3)] : argv;
}

function exitOverrideDeep(command: Command): void {
  command.exitOverride();
  for (const child of command.commands) {
    exitOverrideDeep(child);
  }
}

export async function main(argv = process.argv, options: CreateProgramOptions = {}): Promise<void> {
  const normalizedArgv = normalizeCliArgv(argv);
  const output = options.output ?? createOutputWriters();
  const program = createProgram({ ...options, output });
  exitOverrideDeep(program);

  if (normalizedArgv.length <= 2) {
    program.outputHelp();
    process.exitCode = 0;
    return;
  }

  try {
    await program.parseAsync(normalizedArgv);
  } catch (error) {
    handleCliError(error, output, program);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const output = createOutputWriters();
    process.exitCode = mapCliErrorToExitCode(error);
    if (!isCommanderError(error)) {
      output.writeDiagnostic(sanitizeHumanDiagnostic(formatCliError(error)));
    }
  });
}

function sanitizeHumanDiagnostic(value: string): string {
  return sanitizeHumanInline(sanitizeHumanText(value));
}
