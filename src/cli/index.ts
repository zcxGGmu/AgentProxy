#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { OPENCODE_PROVIDER_ID } from "../providers/opencode/index.js";

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

function plannedAction(commandName: string): () => void {
  return () => {
    console.error(
      `agentproxy ${commandName} is planned for a later phase and is not implemented yet.`,
    );
    process.exitCode = 1;
  };
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("agentproxy")
    .description("Thin control plane for Coding Agent runtimes. v1 targets OpenCode.")
    .version(AGENTPROXY_VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option("--provider <id>", "Provider id to use.", OPENCODE_PROVIDER_ID)
    .option("--workspace <path>", "Workspace path.", ".")
    .option("--json", "Print machine-readable JSON output.")
    .option("--verbose", "Print more human-readable progress details.")
    .option("--debug", "Print opt-in diagnostic details.")
    .option("--config <path>", "Path to an AgentProxy config file.");

  program.addHelpText(
    "after",
    `\nPlanned core workflows:\n  ${plannedCoreWorkflows.join("\n  ")}\n`,
  );

  program
    .command("doctor")
    .description("Check AgentProxy, provider, runtime, and workspace health.")
    .action(plannedAction("doctor"));

  program
    .command("run")
    .argument("[prompt]", "Prompt to send to the provider runtime.")
    .option("--model <model>", "Provider model selection.")
    .description("Run a headless OpenCode task through AgentProxy.")
    .action(plannedAction("run"));

  program
    .command("chat")
    .option("--session <id>", "Open an existing AgentProxy session.")
    .description("Open the AgentProxy control-plane TUI.")
    .action(plannedAction("chat"));

  const sessions = program.command("sessions").description("Manage indexed provider sessions.");
  sessions
    .command("list")
    .description("List known sessions.")
    .action(plannedAction("sessions list"));
  sessions
    .command("show")
    .argument("<id>", "Session id.")
    .description("Show session details.")
    .action(plannedAction("sessions show"));
  sessions
    .command("resume")
    .argument("<id>", "Session id.")
    .option("--prompt <prompt>", "Prompt to send after resuming.")
    .description("Resume a session.")
    .action(plannedAction("sessions resume"));
  sessions
    .command("abort")
    .argument("<id>", "Session id.")
    .description("Abort a running session.")
    .action(plannedAction("sessions abort"));
  sessions
    .command("delete")
    .argument("<id>", "Session id.")
    .option("--yes", "Skip interactive confirmation.")
    .description("Delete a session tombstone-aware.")
    .action(plannedAction("sessions delete"));
  sessions
    .command("export")
    .argument("<id>", "Session id.")
    .option("--sanitize", "Sanitize exported data.")
    .option("--output <path>", "Output file.")
    .description("Export a session.")
    .action(plannedAction("sessions export"));
  sessions
    .command("import")
    .argument("<source>", "File or URL.")
    .description("Import a provider session.")
    .action(plannedAction("sessions import"));
  sessions
    .command("share")
    .argument("<id>", "Session id.")
    .description("Share a session through the provider.")
    .action(plannedAction("sessions share"));
  sessions
    .command("unshare")
    .argument("<id>", "Session id.")
    .description("Remove provider session sharing.")
    .action(plannedAction("sessions unshare"));

  const providers = program.command("providers").description("Inspect registered providers.");
  providers
    .command("list")
    .description("List providers and capabilities.")
    .action(plannedAction("providers list"));
  providers
    .command("inspect")
    .argument("<id>", "Provider id.")
    .description("Inspect provider health and capabilities.")
    .action(plannedAction("providers inspect"));

  const provider = program.command("provider").description("Provider passthrough commands.");
  provider
    .command("exec")
    .argument("<id>", "Provider id.")
    .argument("[nativeArgs...]", "Native provider arguments after --.")
    .allowUnknownOption(true)
    .description("Execute a provider-native command without changing AgentProxy state.")
    .action(plannedAction("provider exec"));

  const runtime = program.command("runtime").description("Manage provider runtime connections.");
  runtime.command("list").description("List known runtimes.").action(plannedAction("runtime list"));
  runtime
    .command("stop")
    .argument("<runtime-id>", "Runtime id.")
    .description("Stop a managed runtime.")
    .action(plannedAction("runtime stop"));

  const config = program
    .command("config")
    .description("Inspect or update AgentProxy configuration.");
  config
    .command("get")
    .argument("[key]", "Config key.")
    .description("Read config values.")
    .action(plannedAction("config get"));
  config
    .command("set")
    .argument("<key>", "Config key.")
    .argument("<value>", "Config value.")
    .description("Set an AgentProxy config value.")
    .action(plannedAction("config set"));

  return program;
}

export function normalizeCliArgv(argv: string[]): string[] {
  return argv[2] === "--" ? [argv[0] ?? "node", argv[1] ?? "agentproxy", ...argv.slice(3)] : argv;
}

export async function main(argv = process.argv): Promise<void> {
  const normalizedArgv = normalizeCliArgv(argv);
  const program = createProgram();

  if (normalizedArgv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(normalizedArgv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
