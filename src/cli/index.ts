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

export const AGENTPROXY_VERSION = "0.1.0";

const plannedCoreWorkflows = [
  "agentproxy doctor",
  "agentproxy run [prompt]",
  "agentproxy chat",
  "agentproxy sessions list|show|resume|abort|delete|export|import|share|unshare",
  "agentproxy providers list|inspect",
  "agentproxy provider exec <id> -- <native args>",
  "agentproxy runtime list|stop",
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
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const program = new Command();
  const output = options.output ?? createOutputWriters();

  program.configureOutput({
    writeOut: (chunk) => output.stdout.write(chunk),
    writeErr: (chunk) => output.writeDiagnostic(chunk),
    outputError: (chunk, write) => write(chunk),
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
    `\nPlanned core workflows:\n  ${plannedCoreWorkflows.join("\n  ")}\n`,
  );

  program
    .command("doctor")
    .description("Check AgentProxy, provider, runtime, and workspace health.")
    .action(plannedAction("doctor", output));

  program
    .command("run")
    .argument("[prompt]", "Prompt to send to the provider runtime.")
    .option("--model <model>", "Provider model selection.")
    .description("Run a headless OpenCode task through AgentProxy.")
    .action(plannedAction("run", output));

  program
    .command("chat")
    .option("--session <id>", "Open an existing AgentProxy session.")
    .description("Open the AgentProxy control-plane TUI.")
    .action(plannedAction("chat", output));

  const sessions = program.command("sessions").description("Manage indexed provider sessions.");
  sessions
    .command("list")
    .description("List known sessions.")
    .action(plannedAction("sessions list", output));
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
    .action(plannedAction("providers list", output));
  providers
    .command("inspect")
    .argument("<id>", "Provider id.")
    .description("Inspect provider health and capabilities.")
    .action(plannedAction("providers inspect", output));

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
    .action(plannedAction("runtime list", output));
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

  output.writeDiagnostic(formatCliError(error));
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
      output.writeDiagnostic(formatCliError(error));
    }
  });
}
