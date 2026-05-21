# AgentProxy Development Tracker

- Source plan: `docs/agentproxy-development-plan.md`
- Current plan version: Draft v3
- Primary goal: v1 uses OpenCode as the first full runtime provider
- Working rule: do not mark an item done until implementation, tests, docs, and verification evidence are complete

## Status Legend

- `[ ]` Not started
- `[x]` Done and verified
- Use the Review section to record date, scope, verification command, and unresolved risks after each iteration.

## Current Iteration - 2026-05-21 Phase 5 Runtime List CLI Minimal Workflow

Scope: advance only the Phase 5 `agentproxy runtime list` read-only CLI task group. This workflow reads AgentProxy runtime registry metadata and prints a sanitized runtime inventory for the selected workspace/provider. Do not implement `runtime stop`, `sessions`, `config`, Phase 6 AgentProxy TUI, managed runtime start/attach behavior, or new Agent runtime behavior.

Implementation checklist:

- [x] Add focused CLI tests for `runtime list` human/JSON output, missing registry DB behavior, provider/workspace filtering, disabled/invalid provider behavior, terminal/control-character safety, and later-command placeholder boundaries.
- [x] Implement a narrow `src/cli/runtime.ts` action/service layer that resolves config and opens SQLite readonly only when the registry DB exists.
- [x] Wire only `agentproxy runtime list` from planned placeholder to a real action; keep `runtime stop`, `sessions`, `config`, session-aware `chat`, and Phase 6 TUI untouched.
- [x] Keep JSON output transcript-free and provider-payload-safe by emitting only stable runtime fields and sanitized metadata status/source details.
- [x] Update `docs/development-progress-tracker.zh.md` completed/unfinished status and Review notes after verification.
- [x] Run focused runtime CLI tests, related CLI/runtime tests, full applicable project verification, code review, and create one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial working tree is clean; `git log -1 --oneline` is `1dea00f 文档：同步 Phase 5 Providers 后续开发状态`, so the latest Phase 5 implementation baseline remains `c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Phase 3.2 already provides storage-backed `RuntimeRegistry` list/query behavior and state-machine metadata.
- Phase 5.1 already provides shared Commander parsing, global flags, stdout/stderr split, JSON error output, and stable exit-code mapping.
- Phase 5 provider CLI already established the read-only SQLite pattern: do not create or migrate the DB for read-only visibility commands when the DB is absent.

Acceptance criteria for this iteration:

- [x] `agentproxy runtime list` is a real command and no longer returns the generic planned `CAPABILITY_UNSUPPORTED` placeholder.
- [x] When the AgentProxy SQLite registry DB is absent, `runtime list` succeeds with an empty list and does not create the DB or parent data directory.
- [x] Existing runtimes are listed for the selected provider/workspace by default, sorted consistently with registry ordering, with optional stable fields for mode/status/base URL/PID/started/stopped timestamps.
- [x] `runtime list --json` emits exactly one valid redacted JSON object on stdout, with no human prose mixed in.
- [x] Human output is terminal-control-character safe and does not print raw metadata blobs, URL credentials, query strings, headers, secrets, transcript content, or provider event payloads.
- [x] Non-OpenCode provider selection maps to `PROVIDER_NOT_FOUND`; disabled OpenCode config maps to `PROVIDER_UNAVAILABLE`.
- [x] `runtime stop`, `sessions`, `config`, `chat --session`, and Phase 6 AgentProxy TUI remain unimplemented or explicitly unsupported.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not start, attach, stop, detach, or health-check runtimes from this command; it is only a registry visibility command.
- Do not treat stale registry metadata as live runtime truth; show stored status and leave active cleanup/health revalidation to existing runtime services and future runtime commands.
- Avoid adding migrations or schema fields; reuse existing runtime registry records.
- Keep AgentProxy as a thin control plane and do not inspect or duplicate OpenCode runtime internals.

Review notes:

- 2026-05-21: Completed the Phase 5 `runtime list` read-only CLI minimal workflow. Added `src/cli/runtime.ts`, wired only `agentproxy runtime list` in `src/cli/index.ts`, added `tests/cli-runtime.test.ts`, and updated stale placeholder tests in provider/chat CLI suites to keep `runtime stop`, `sessions`, and `config` as planned boundaries. The command resolves config, opens existing SQLite registry DBs with `readonly: true`, `migrate: false`, and `fileMustExist: true`, returns an empty list without creating the DB or parent data directory when absent, and emits only sanitized stable runtime fields without raw metadata. Verification passed: `pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts`, `pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/cli-help.test.ts tests/runtime-registry.test.ts tests/opencode-managed-runtime.test.ts tests/opencode-attached-runtime.test.ts`, `pnpm exec vitest run tests/cli-runtime.test.ts tests/cli-providers.test.ts tests/cli-chat.test.ts`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test` (28 files, 214 tests), and `pnpm run build`. Code review found one blocking stale test, which was fixed before full verification. Residual risk: real registry data from older schema/corrupt DB still relies on storage-layer `STORAGE_ERROR`; `runtime stop`, `sessions`, `config`, `chat --session`, and Phase 6 AgentProxy TUI remain intentionally unimplemented.

## Current Iteration - 2026-05-21 Documentation Sync After Phase 5 Providers CLI

Scope: update tracking documents after `c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`. This is a documentation-only synchronization so the next Codex session can continue from the correct first unfinished Phase 5 CLI MVP task group. Do not change source code, tests, provider behavior, runtime behavior, CLI command behavior, or TUI behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` latest status, concrete implementation baseline, completed/unfinished summaries, Review entry, and next-start prompt.
- [x] Keep Phase 5 remaining CLI MVP commands limited to `sessions`, `runtime`, and `config`; keep Phase 6 AgentProxy TUI explicitly not started.
- [x] Run documentation-appropriate verification.
- [x] Commit the documentation sync with a detailed Chinese commit message.

Dependencies confirmed before implementation:

- Initial working tree is clean; `git log -1 --oneline` is `c620a4c 阶段进展：完成 Phase 5 Providers List/Inspect CLI`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Phase 5 implementation baseline should now be `c620a4c` unless a later documentation-only commit is on top.

Acceptance criteria:

- [x] The tracker explicitly states completed work through Phase 5 `providers list/inspect`.
- [x] The tracker explicitly states Phase 5 is still in progress and `sessions`, `runtime`, and `config` remain unfinished.
- [x] The next-start prompt tells the next Codex session to verify git state and continue from one remaining Phase 5 CLI MVP task group, not Phase 6 TUI.
- [x] The tracker uses concrete commit `c620a4c` for the latest Phase 5 providers implementation baseline instead of a placeholder.

Risks and constraints:

- Do not mark Phase 5 complete.
- Do not treat `agentproxy chat` as Phase 6 AgentProxy TUI.
- Do not edit source or tests for this documentation sync.

Review notes:

- 2026-05-21: Documentation sync completed after confirming a clean tree at `c620a4c`. Updated `docs/development-progress-tracker.zh.md` to use concrete Phase 5 providers implementation baseline `c620a4c`, kept Phase 5 remaining CLI MVP commands limited to `sessions`, `runtime`, and `config`, and kept Phase 6 AgentProxy TUI explicitly not started. Verification passed: `git status --short`, `git log -1 --oneline`, `git diff --check`, and `pnpm run format:check`. Source code and tests were not changed.

## Current Iteration - 2026-05-21 Phase 5 Providers List/Inspect CLI Minimal Workflow

Scope: advance only the Phase 5 `providers list` and `providers inspect <id>` CLI task group. This is a read-only provider visibility workflow: resolve AgentProxy config, probe the registered OpenCode provider, summarize provider health/capabilities, and inspect OpenCode model metadata through existing provider-layer APIs. Do not implement `sessions`, `runtime`, `config`, session-aware `chat --session`, Phase 6 AgentProxy TUI, or new Agent runtime behavior.

User journey:

- As a CLI user, I can run `agentproxy providers list --workspace .` and see the registered OpenCode provider, health state, capability mode, and high-level capability summary.
- As a script user, I can run `agentproxy providers list --json` or `agentproxy providers inspect opencode --json` and receive exactly one redacted JSON object on stdout.
- As an operator, I can run `agentproxy providers inspect opencode` to see provider health, runtime-base-url source, capability groups, and a sanitized OpenCode model summary when a runtime provider list endpoint is reachable.

Implementation checklist:

- [x] Add focused CLI tests for `providers list` and `providers inspect opencode` human/JSON output, invalid provider, missing/disabled OpenCode provider config, no runtime base URL, model-list failure handling, redaction, and later-command placeholder boundaries.
- [x] Implement a narrow `src/cli/providers.ts` action/service layer that resolves config, opens SQLite only for runtime registry selection, builds the configured OpenCode provider, probes health/capabilities, and optionally lists models for inspect.
- [x] Wire only `agentproxy providers list` and `agentproxy providers inspect <id>` from planned placeholders to real actions; keep `sessions`, `runtime`, `config`, session-aware chat, and Phase 6 TUI untouched.
- [x] Keep JSON output transcript-free and provider-payload-safe by emitting only stable provider, health, capability, runtime-source, and sanitized model fields.
- [x] Update `docs/development-progress-tracker.zh.md` completed/unfinished status and Review notes after verification.
- [x] Run focused providers CLI tests, related CLI/provider tests, full applicable project verification, code review, and create one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial working tree is clean; `git log -1 --oneline` is `8030f2a 文档：同步 Phase 5.3 Chat CLI 边界与下次启动提示`, so the latest Phase 5 implementation baseline remains `4e07797 阶段进展：完成 Phase 5.3 Chat Native TUI Launcher`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Phase 5.1 already provides shared Commander parsing, global flags, stdout/stderr split, JSON error output, and stable exit-code mapping.
- Phase 4.1 and Phase 4.2 already provide provider-layer health/capability probing and `OpenCodeProvider.listModels()`; this iteration should wrap those APIs rather than reaching into OpenCode internals.
- Phase 3.2 runtime registry plus `selectOpenCodeRuntimeBaseUrl()` can select a configured or active runtime base URL without adding runtime management commands.

Acceptance criteria for this iteration:

- [x] `agentproxy providers list` is a real command and no longer returns the generic planned `CAPABILITY_UNSUPPORTED` placeholder.
- [x] `agentproxy providers inspect opencode` is a real command and reports OpenCode provider health, capability groups, provider version, runtime base URL source, and sanitized model summary when available.
- [x] `providers list --json` and `providers inspect opencode --json` each emit exactly one valid redacted JSON object on stdout, with no human prose mixed in.
- [x] Invalid provider ids map to `PROVIDER_NOT_FOUND`; disabled OpenCode config maps to `PROVIDER_UNAVAILABLE`.
- [x] Missing runtime base URL does not start a managed runtime and does not fail the whole read-only command; it reports degraded health and skips model listing with an actionable status.
- [x] Provider-controlled model metadata in CLI JSON is redacted and constrained to existing `ModelRef` fields; human output is terminal-control-character safe.
- [x] `sessions`, `runtime`, `config`, `chat --session`, and Phase 6 AgentProxy TUI remain unimplemented or explicitly unsupported.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not parse OpenCode TUI output or provider logs.
- Do not start or stop runtimes from provider visibility commands; runtime lifecycle remains for existing `run`/doctor and future `runtime` CLI work.
- Do not output raw provider `/provider` payloads, raw headers, auth env values, URL credentials, query strings, or transcript content.
- Keep capability semantics conservative: health success does not imply unsupported AgentProvider operations are available.
- If model listing fails, surface it as inspect metadata unless the provider id/config itself is invalid.

Review notes:

- 2026-05-21: Added `tests/cli-providers.test.ts` and first confirmed the planned placeholder red state for `providers list/inspect`. Implemented `src/cli/providers.ts` plus `src/cli/index.ts` wiring so the commands now resolve config, choose a configured or registered OpenCode runtime base URL without starting/stopping runtimes, probe provider health/capabilities, and optionally list sanitized models for inspect.
- 2026-05-21: Code review found blocking read-only and terminal-safety issues. Fixed providers list/inspect so a missing runtime and absent SQLite DB does not create/migrate storage, added readonly/fileMustExist storage opening for existing registry DB reads, made disabled provider list return a diagnostic disabled state while inspect still fails stably, and sanitized Commander parse/fallback human diagnostics for ANSI/OSC/C0/C1 controls. Recorded both reusable rules in `tasks/lessons.md`.
- 2026-05-21: Verification passed: `pnpm exec vitest run tests/cli-providers.test.ts`, `pnpm exec vitest run tests/cli-help.test.ts tests/cli-providers.test.ts`, `pnpm exec vitest run tests/cli-providers.test.ts tests/cli-help.test.ts tests/cli-doctor.test.ts tests/provider-registry.test.ts tests/opencode-provider-health.test.ts tests/opencode-provider-models.test.ts tests/storage-sqlite.test.ts`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test` (27 files, 209 tests), `pnpm run build`, and `git diff --check`. Residual risk: real OpenCode `/provider` smoke calibration remains a later compatibility task; `sessions`, `runtime`, `config`, `chat --session`, and Phase 6 AgentProxy TUI remain intentionally unimplemented.

## Current Iteration - 2026-05-21 Documentation Sync After Phase 5.3 Chat CLI Launcher

Scope: update tracking documents after `4e07797 阶段进展：完成 Phase 5.3 Chat Native TUI Launcher`, clarifying that the completed work is still Phase 5 CLI work: `agentproxy chat` launches the provider-native OpenCode UI and does not mean Phase 6 AgentProxy TUI has started. Do not change source code or implement any `sessions`, `providers`, `runtime`, `config`, or TUI behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` latest status, completed/unfinished lists, current baseline, and next-start prompt.
- [x] Preserve the corrected lesson that Phase 5 `chat` must be described as a CLI native OpenCode launcher rather than Phase 6 AgentProxy TUI.
- [x] Run documentation-appropriate verification.
- [x] Commit the documentation sync with a detailed Chinese commit message.

Acceptance criteria:

- [x] The tracker clearly lists Phase 5.1, Phase 5.2, Phase 5.3 `run`, and Phase 5.3 CLI `chat` native OpenCode launcher as completed.
- [x] The tracker clearly lists Phase 5 remaining CLI MVP commands (`sessions`, `providers list/inspect`, `runtime`, `config`) as unfinished.
- [x] Phase 6 AgentProxy TUI remains explicitly unfinished and not started.
- [x] The next-start prompt tells the next Codex session to continue from Phase 5 remaining CLI MVP commands, not full TUI.

Risks and constraints:

- Do not rewrite the development plan unless this documentation sync exposes a real design gap.
- Do not treat the documentation sync as a new implementation phase.
- Avoid ambiguous wording that says "TUI completed"; the completed item is only the CLI launcher for OpenCode's native UI.

Review notes:

- 2026-05-21: Refreshed the progress tracker after the Phase 5.3 chat boundary correction. The tracker now states that `agentproxy chat` is a Phase 5 CLI native OpenCode launcher, not Phase 6 AgentProxy TUI. It also keeps Phase 5 remaining CLI MVP commands (`sessions`, `providers list/inspect`, `runtime`, `config`) as the next unfinished work, and keeps Phase 6 AgentProxy TUI explicitly not started. Verification passed with `git status --short`, `git log -1 --oneline`, `git diff --check`, and `pnpm run format:check`; source code was not touched.

## Current Iteration - 2026-05-21 Phase 5.3 Chat CLI Native OpenCode Launcher Minimal Entry

Scope: advance only the smallest `agentproxy chat` entry from Phase 5.3 by launching the OpenCode native TUI as the provider-owned interactive surface for the selected workspace. Do not implement a full AgentProxy Ink TUI, session-specific native resume, prompt prefill, `/tui` server API control, `sessions`, `runtime`, `config`, `providers list/inspect`, or new Agent runtime behavior.

User journey:

- As a local CLI user, I can run `agentproxy chat --workspace .` and AgentProxy resolves config, locates the configured OpenCode binary, then hands the terminal to OpenCode native TUI for the selected workspace.
- As a scripted user, I can observe stable launcher errors and exit codes when provider id, config, disabled provider, or OpenCode binary resolution fails.
- As a security-conscious user, parent process secrets are not passed to the native TUI child unless they are explicitly allowed through AgentProxy OpenCode passthrough config.

Implementation checklist:

- [x] Add focused tests for `agentproxy chat` native launcher success, configured workspace/binary usage, parent secret env isolation, provider exit-code preservation, unsupported `--session`, invalid provider, and help/planned workflow boundaries.
- [x] Implement a narrow OpenCode native TUI launcher service/provider method that resolves the configured binary and spawns `opencode <workspace>` with interactive stdio and a minimal allowlisted environment.
- [x] Wire only `agentproxy chat` to the launcher and move only the workspace-level native launcher from planned to implemented help text.
- [x] Keep `--session`, full AgentProxy TUI, `/tui` prompt/session control, `sessions`, `runtime`, `config`, and `providers list/inspect` as planned or explicitly unsupported.
- [x] Update `docs/development-progress-tracker.zh.md` completed/unfinished status and Review notes after verification.
- [x] Run focused chat tests, full applicable project verification, code review, and create one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial working tree is clean; `git log -1 --oneline` is `66c2163 文档：同步 Phase 5.3 完成状态与下次启动提示`, so the latest Phase 5 implementation baseline remains `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Phase 5.1 already provides shared Commander parsing, global flags, stdout/stderr split, JSON error output, and stable error mapping.
- Phase 4.7 already provides safe OpenCode binary resolution and provider-native process boundaries; chat should reuse the same safety posture but use interactive stdio for native TUI.
- `docs/agentproxy-development-plan.md` defines TUI as a control plane and native TUI launcher, not a replacement chat engine.

Acceptance criteria for this iteration:

- [x] `agentproxy chat --workspace <path>` is a real command and no longer returns the generic planned `CAPABILITY_UNSUPPORTED` placeholder.
- [x] The launcher uses only the `opencode` provider in v1 and maps non-OpenCode provider selection to `PROVIDER_NOT_FOUND`.
- [x] The launcher executes the configured OpenCode binary with the selected workspace as the native TUI target and preserves the provider process exit code.
- [x] The native TUI child receives only an allowlisted execution environment plus explicit OpenCode passthrough env, not full parent env secrets.
- [x] `--session <id>` remains explicitly unsupported for this minimal entry and does not silently pretend to resume a provider session.
- [x] `chat`, `sessions`, `runtime`, `config`, and `providers list/inspect` do not gain any extra business behavior beyond this native launcher.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not parse OpenCode TUI screen output or provider logs.
- Do not route chat through AgentProxy message APIs; `run [prompt]` remains the headless workflow and OpenCode remains the interactive runtime.
- Do not pass raw parent env to the child process; TUI terminal env needs should be handled through a small allowlist.
- Do not implement session-specific native TUI launch until the provider-native contract is proven rather than guessed.

Review notes:

- 2026-05-21: Completed the Phase 5.3 Chat Native TUI Launcher minimal entry. Added `tests/cli-chat.test.ts` for success, runtime exit-code preservation, invalid provider, `chat --json` unsupported, disabled provider, missing binary, `--session` unsupported, redaction, and later-command placeholder boundaries; added `src/cli/chat.ts` plus `src/providers/opencode/native-tui.ts`; wired `agentproxy chat` in `src/cli/index.ts`; updated OpenCode provider capabilities so `interaction.nativeTui` reflects binary availability; and extended the NativeTuiResult contract with `exitCode`. Code review found no blockers and one P2 test-gap finding, which was fixed before final verification. Verification passed: `pnpm exec vitest run tests/cli-chat.test.ts tests/cli-help.test.ts tests/cli-run.test.ts tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`. Residual risk: real OpenCode native TUI smoke calibration remains a later compatibility task, and Phase 5 后续真实业务命令仍未实现.

## Current Iteration - 2026-05-21 Documentation Sync After Phase 5.3

Scope: update only project tracking documents after `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`. Do not implement Phase 5.3 `chat`, sessions, runtime, config, provider list/inspect, TUI, provider behavior, or runtime behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest Phase 5.3 implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 5.3 Chat / native TUI launcher as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification.
- [x] Give the user a ready-to-send next-start prompt.

Dependencies confirmed before implementation:

- Initial working tree is clean and `git log -1 --oneline` is `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Latest Phase 5 implementation baseline is `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 5.3 `run [prompt]`, unfinished work starting at Phase 5.3 Chat / native TUI launcher, and full TUI still pending.
- [x] The next-start prompt includes the concrete Phase 5.3 implementation commit and instructs the next Codex session to start at `chat` / native TUI launcher only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 5.3 Chat implementation start.
- Do not change source code, tests, provider behavior, runtime behavior, CLI behavior, TUI, or completed implementation.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the latest Phase 5.3 implementation baseline.

Review notes:

- 2026-05-21: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `f2424eb 阶段进展：完成 Phase 5.3 Run Prompt Minimal Workflow`.
- Updated `docs/development-progress-tracker.zh.md` latest status, baseline fields, completed/unfinished summaries, Review entry, and next-start prompt to use Phase 5.3 `run [prompt]` as complete and Phase 5.3 Chat / native TUI launcher as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This is documentation-only; no source code, tests, provider behavior, runtime behavior, CLI behavior, Phase 5.3 Chat, `sessions`, `runtime`, `config`, provider list/inspect, or TUI work is changed.

## Current Iteration - 2026-05-21 Phase 5.3 Run Prompt Minimal Workflow

Scope: advance only the minimal `agentproxy run [prompt]` workflow from Phase 5.3. Implement a script-friendly one-shot run path that creates an AgentProxy-indexed OpenCode session, sends a text prompt through the existing provider/runtime/session services, renders the live event stream, and returns stable session identifiers. Do not implement `chat` TUI, `sessions`, `runtime`, `config`, `providers list/inspect`, full resume UX, permission approval, provider passthrough changes, or any new Agent runtime behavior.

User journey:

- As a CLI user, I can run `agentproxy run "hello"` against a configured/registered OpenCode runtime and get a stable AgentProxy session id plus streamed assistant output.
- As a script user, I can run `agentproxy run "hello" --json` and receive exactly one valid redacted JSON object on stdout with session ids, status, and event summaries.
- As a local user, I can pipe a prompt over stdin when `[prompt]` is omitted without entering a TUI or storing the raw prompt in SQLite.

Implementation checklist:

- [x] Add focused CLI tests for `run [prompt]`, stdin prompt, `--model`, provider/workspace/config overrides, JSON output, missing prompt, missing runtime, event streaming, redaction, and planned `chat`/other command boundaries.
- [x] Add a narrow `src/cli/run.ts` service/action layer or equivalent small CLI module that resolves config, opens/closes SQLite, selects an active/configured OpenCode runtime base URL, creates a configured provider, starts a local session mapping, sends the message stream, and formats human/JSON output.
- [x] Replace only the `agentproxy run` placeholder with the real action and move only `run [prompt]` from planned to implemented help text.
- [x] Keep `chat`, `sessions`, `runtime`, `config`, `providers list/inspect`, and full TUI as planned placeholders.
- [x] Update `docs/development-progress-tracker.zh.md` Phase 5.3 checklist and Review notes after verification.
- [x] Run focused run CLI tests, full project verification, code review, and create one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial `git log -1 --oneline` is `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`.
- Initial `git status --short` showed existing documentation-sync edits in `docs/development-progress-tracker.zh.md` and `tasks/todo.md`; preserve and build on those edits instead of overwriting them.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`; latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Phase 5.1 already provides shared Commander parsing, global flags, JSON/human error output, stdout/stderr split, and stable exit-code mapping.
- Phase 5.2 already provides config/storage/provider/runtime diagnostic patterns and active runtime selection logic that can be reused narrowly.
- Phase 4.4 and 4.5 already provide `startAgentProxySession()` and `sendAgentProxyMessage()`; `run` should compose these instead of reimplementing provider session/message behavior.

Acceptance criteria for this iteration:

- [x] `agentproxy run "prompt"` is a real workflow and no longer returns the `CAPABILITY_UNSUPPORTED` planned placeholder.
- [x] `run` creates a provider session, persists a local AgentProxy session mapping before sending the prompt, sends the text prompt through OpenCode server APIs, and stores only sanitized event projections.
- [x] `run` selects runtime base URL from explicit OpenCode config first, then active runtime registry records for the workspace; missing runtime fails with a stable, actionable error.
- [x] Human mode writes session id/status and assistant deltas to stdout, keeps AgentProxy diagnostics/errors on stderr, and does not dump raw provider payloads.
- [x] `run --json` writes exactly one valid redacted JSON object to stdout with `ok`, `sessionId`, `providerSessionId`, `status`, `events`, and `runtime` summary fields.
- [x] Empty prompt from argument/stdin fails as `CONFIG_INVALID` with exit code `3`; invalid provider fails as `PROVIDER_NOT_FOUND` with exit code `4`.
- [x] `--model`, `--workspace`, `--provider`, `--config`, and stdin prompt behavior are covered by focused tests.
- [x] `chat`, `sessions`, `runtime`, `config`, and `providers list/inspect` remain unimplemented placeholders.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not start a full TUI or implement a chat engine; `run` is a headless one-shot CLI workflow.
- Do not default to parsing provider stdout or TUI output; prefer existing OpenCode server APIs and event stream.
- Do not persist raw prompts, raw assistant transcript text, raw tool output, URL query secrets, or provider-controlled raw payloads in SQLite or JSON summaries.
- Managed runtime lifecycle should remain conservative: this task may use an already configured/registered runtime base URL; broader runtime CLI management stays for later Phase 5 work.
- Permission events must be surfaced, never auto-approved.
- If the implementation feels like it is duplicating doctor/runtime internals, pause and extract only a narrow reusable helper instead of widening Phase 5.3.

Review notes:

- 2026-05-21: Added focused TDD coverage in `tests/cli-run.test.ts`. Initial red run failed with `CAPABILITY_UNSUPPORTED` placeholder exit code `6`, proving `agentproxy run` was not implemented yet.
- Implemented `src/cli/run.ts`, wired `agentproxy run [prompt]` in `src/cli/index.ts`, extracted shared OpenCode runtime base URL selection to `src/runtimes/selection.ts`, and kept `chat`, `sessions`, `runtime`, `config`, and `providers list/inspect` as planned placeholders.
- Focused verification passed so far: `pnpm exec vitest run tests/cli-run.test.ts`, `pnpm exec vitest run tests/cli-run.test.ts tests/cli-help.test.ts tests/cli-doctor.test.ts tests/cli-provider-exec.test.ts tests/opencode-runtime-diagnostics.test.ts`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run format:check`.
- Security review found and the implementation fixed transcript leakage in JSON output, terminal-control-character exposure in human output, full parent env propagation for managed run, and unbounded prompt/event accumulation. Follow-up review found no blockers.
- Code review findings were fixed before final verification: validate `--model` before session creation, report the actual selected runtime mode for registry runtimes, and preserve the original prompt text for dispatch while still rejecting empty trimmed input.
- Final code review found two high-risk terminal-state issues; fixed non-completed `run` reports returning exit 0, fixed timeout abort being treated as completed, added regression coverage, and recorded the reusable rule in `tasks/lessons.md`.
- Final verification passed: `pnpm exec vitest run tests/cli-run.test.ts` (12 tests), `pnpm exec vitest run tests/cli-run.test.ts tests/cli-help.test.ts tests/cli-doctor.test.ts tests/cli-provider-exec.test.ts tests/opencode-runtime-diagnostics.test.ts`, `pnpm run test` (25 files, 194 tests), `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- Residual boundary: real OpenCode end-to-end smoke remains a later compatibility task; `chat`, `sessions`, `runtime`, `config`, and `providers list/inspect` remain intentionally unimplemented.

## Current Iteration - 2026-05-21 Documentation Sync After Phase 5.2

Scope: update only project tracking documents after `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`. Do not implement Phase 5.3 `run`, `chat`, sessions, runtime, config, provider list/inspect, TUI, provider behavior, or runtime behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest Phase 5.2 implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 5.3 `run [prompt]` as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification.
- [x] Give the user a ready-to-send next-start prompt.

Dependencies confirmed before implementation:

- Initial working tree is clean and `git log -1 --oneline` is `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Latest Phase 5 implementation baseline is `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 5.2, unfinished work starting at Phase 5.3 `run [prompt]`, and TUI still pending.
- [x] The next-start prompt includes the concrete Phase 5.2 implementation commit and instructs the next Codex session to start at Phase 5.3 `run [prompt]` only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 5.3 start.
- Do not change source code, tests, provider behavior, runtime behavior, CLI behavior, TUI, or completed implementation.
- If this documentation update is committed later, the next startup prompt must distinguish the documentation commit from the latest Phase 5.2 implementation baseline.

Review notes:

- 2026-05-21: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `c707f2c 阶段进展：完成 Phase 5.2 Doctor CLI 工作流`.
- Updated `docs/development-progress-tracker.zh.md` latest status, baseline fields, completed/unfinished summaries, Review entry, and next-start prompt to use Phase 5.2 as complete and Phase 5.3 `run [prompt]` as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This is documentation-only; no source code, tests, provider behavior, runtime behavior, CLI behavior, Phase 5.3, or TUI work is changed.

## Current Iteration - 2026-05-21 Phase 5.2 Doctor CLI Workflow

Scope: advance only Phase 5.2 `agentproxy doctor`. Implement a script-friendly diagnostic workflow that wraps existing config, storage, provider, and OpenCode runtime diagnostic primitives. Do not implement `run`, `sessions`, `runtime`, `config`, providers list/inspect commands, native TUI, or new Agent runtime behavior.

Implementation checklist:

- [x] Confirm the latest commit/worktree baseline and treat `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation` as the latest Phase 5 implementation baseline because the newest commit is documentation-only.
- [x] Add focused CLI tests for `agentproxy doctor` human output, `--json` output, exit codes, secret redaction, config failure, storage failure, and provider/runtime diagnostic summaries.
- [x] Implement a narrow doctor CLI action that resolves config, opens SQLite storage, runs reusable OpenCode runtime diagnostics, probes provider capabilities, checks Node.js version, checks workspace Git status, and reports MCP/provider-list capability status without adding separate provider/runtime/config commands.
- [x] Keep normal human results on stdout, warnings/details on stdout only as part of the final doctor report, and JSON mode as one valid redacted JSON document on stdout.
- [x] Update `docs/development-progress-tracker.zh.md` Phase 5.2 checklist and Review notes after verification.
- [x] Run focused doctor tests, full project verification, code review, and create one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial working tree is clean and `git log -1 --oneline` is `c66bafc 文档：同步 Phase 5.1 完成状态与下次启动提示`, so Phase 5 latest implementation baseline remains `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`; latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Phase 3 runtime diagnostics already provide binary, registry, health, event stream, and optional managed smoke checks; Phase 5.2 should wrap/reuse this service instead of duplicating runtime lifecycle logic.
- Phase 4.1 provider health/capability probing already checks OpenCode API endpoints including `/provider` and `/mcp`; doctor can summarize those capability results without implementing `providers inspect`.
- Phase 5.1 shared CLI behavior already handles global flags, JSON error mode, stable exit codes, parse error redaction, and stdout/stderr separation.

Acceptance criteria for this iteration:

- [x] `agentproxy doctor` runs as a real command and no longer returns the planned-command `CAPABILITY_UNSUPPORTED` placeholder.
- [x] Doctor output includes check statuses for Node.js, AgentProxy config, SQLite read/write, OpenCode binary/version, runtime server health, provider list capability, MCP status, and workspace Git status.
- [x] `agentproxy doctor --json` emits exactly one valid JSON object on stdout with every check item status and no diagnostic prose mixed in.
- [x] Missing OpenCode or runtime dependencies produce failed/skipped checks with next-step suggestions; the command remains diagnostic and does not crash on expected missing dependencies.
- [x] Exit code is `0` when no check fails, and maps to the first failed check's stable AgentProxy error class when checks fail.
- [x] Human and JSON doctor output redact inline secrets, URL credentials, query secrets, bearer tokens, and secret-shaped config/env values.
- [x] Existing `provider exec` behavior and planned placeholders for `run`, `sessions`, `runtime`, `config`, and TUI remain unchanged.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not make doctor start a managed runtime by default; managed smoke can remain an explicit internal option or later flag if needed. The default CLI doctor should be safe and diagnostic-first.
- Do not treat provider capability probing as proof that future CLI workflows are implemented; it only reports capability health for diagnosis.
- Provider list and MCP checks should report capability/probe status using existing OpenCode endpoint probes, not add new standalone `providers` or `mcp` commands.
- SQLite check must close storage handles after diagnostics, including failure paths.
- Doctor must preserve AgentProxy's thin control-plane role and never parse OpenCode TUI output or rewrite provider runtime behavior.

Review notes:

- 2026-05-21: Completed Phase 5.2 Doctor CLI Workflow. Added `src/cli/doctor.ts` and replaced the `agentproxy doctor` placeholder with a real diagnostic command while leaving `run`, `sessions`, `runtime`, `config`, provider list/inspect, and TUI as planned placeholders.
- Doctor now reports Node.js, AgentProxy config, SQLite read/write, OpenCode config, OpenCode binary/version, runtime registry/health/event stream, OpenCode server health, provider list capability, MCP status, and workspace Git state. JSON mode writes exactly one redacted report object to stdout; human mode writes the final doctor report to stdout; failures map to stable exit codes.
- Added `tests/cli-doctor.test.ts` and updated `tests/cli-help.test.ts` and `tests/opencode-runtime-diagnostics.test.ts` for successful JSON reports, missing binary, config failure, storage failure, storage probe record preservation, terminal runtime skipping, Node version exit-code mapping, Git status warning handling, redaction, and placeholder removal. Focused verification passed: `pnpm exec vitest run tests/cli-doctor.test.ts tests/cli-help.test.ts` and `pnpm exec vitest run tests/cli-doctor.test.ts tests/cli-help.test.ts tests/cli-provider-exec.test.ts tests/opencode-runtime-diagnostics.test.ts tests/opencode-provider-health.test.ts`.
- Code review found blockers in the initial doctor implementation: fixed random SQLite probe IDs so existing provider records are not overwritten/deleted, filtered default runtime diagnostics to active runtime states so stopped/detached/failed records are skipped, mapped unsupported Node.js to `CONFIG_INVALID`, treated Git status failures as warnings instead of clean state, and moved implemented doctor out of the planned help list.
- Project verification passed: `pnpm run typecheck`, `pnpm run test` (24 files, 182 tests), `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- Residual boundary: doctor uses fake OpenCode binary/server coverage in tests; real OpenCode smoke calibration remains later. Phase 5.3 `run`, sessions, runtime, config, providers list/inspect, and full TUI remain intentionally unimplemented.

## Current Iteration - 2026-05-21 Documentation Sync After Phase 5.1

Scope: update only project tracking documents after `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`. Do not implement Phase 5.2 `doctor`, `run`, `sessions`, `runtime`, `config`, TUI, provider behavior, or runtime behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest Phase 5.1 implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 5.2 `doctor` as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification and create a detailed Chinese documentation commit.

Dependencies confirmed before implementation:

- Initial working tree is clean and `git log -1 --oneline` is `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`.
- Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Latest Phase 5 implementation baseline is `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 5.1, unfinished work starting at Phase 5.2 `doctor`, and TUI still pending.
- [x] The next-start prompt includes the concrete Phase 5.1 implementation commit and instructs the next Codex session to start at Phase 5.2 `doctor` only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 5.2 start.
- Do not change source code, tests, provider behavior, CLI behavior, TUI, or completed implementation.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the latest Phase 5.1 implementation baseline.

Review notes:

- 2026-05-21: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `4ce1687 阶段进展：完成 Phase 5.1 CLI Framework Foundation`.
- Updated `docs/development-progress-tracker.zh.md` latest status, baseline fields, completed/unfinished summaries, Review entry, and next-start prompt to use Phase 5.1 as complete and Phase 5.2 `doctor` as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This is documentation-only; no source code, tests, provider behavior, runtime behavior, CLI behavior, Phase 5.2, or TUI work is changed.

## Current Iteration - 2026-05-21 Phase 5.1 CLI Framework Foundation

Scope: advance only the first small Phase 5 CLI MVP task group: CLI framework foundation. Finish shared CLI parsing/output/error behavior for later commands without implementing `doctor`, `run`, `sessions`, `runtime`, `config`, TUI, or new provider/runtime behavior.

Implementation checklist:

- [x] Confirm Phase 5 CLI contracts, current Commander setup, and reusable service boundaries before code changes.
- [x] Add focused CLI tests for global flags, per-command help availability, JSON error output, stdout/stderr separation, stable exit code mapping, and command routing behavior.
- [x] Refactor `src/cli/index.ts` only as needed to centralize CLI context, JSON/human error formatting, and exit-code handling.
- [x] Keep existing `agentproxy provider exec opencode -- <native args>` behavior intact, including provider stdout/stderr and original exit code preservation.
- [x] Leave planned workflow commands as non-implemented placeholders except where Phase 5.1 needs shared framework behavior.
- [x] Update `docs/development-progress-tracker.zh.md` Phase 5.1 checklist and Review notes after verification.
- [x] Run focused CLI tests and full project verification before creating one detailed Chinese commit.

Dependencies confirmed before implementation:

- Initial working tree is clean and `git log -1 --oneline` is `5669a57 文档：同步 Phase 5.1 启动前状态与计划`.
- Per tracker rules, Gate 4 validation baseline remains `549a979 阶段进展：完成 Gate 4 汇总验证`, and latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- `docs/development-progress-tracker.zh.md` identifies Phase 5 CLI MVP as the first unfinished item and explicitly says not to enter TUI.
- `docs/agentproxy-development-plan.md` records Commander as the selected CLI framework, the Phase 5 command matrix, global flags, stdout/stderr contract, JSON output contract, and stable exit-code table.
- Existing CLI already has Commander wiring, global flags, help/version, planned command placeholders, stable error-code mapping, and implemented Phase 4.7 `provider exec`; this iteration should harden shared behavior rather than broaden command functionality.

Acceptance criteria for this iteration:

- [x] Every registered command and subcommand exposes help without throwing.
- [x] Global flags `--provider`, `--workspace`, `--json`, `--verbose`, `--debug`, and `--config` are parsed consistently at the root command.
- [x] Human-mode errors and planned-command diagnostics go to stderr; normal output stays on stdout.
- [x] JSON-mode AgentProxy errors print one valid JSON object to stdout and do not mix diagnostics into stdout.
- [x] Stable exit-code mapping follows the plan table for config, provider, runtime, capability, permission, connection, storage, argument, and generic failures.
- [x] Commander parse errors are still redacted and map to argument error exit code `2`.
- [x] Existing `provider exec` tests still prove native args, provider stdout/stderr, env allowlist, and original exit code preservation.
- [x] Focused CLI tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

Risks and constraints:

- Do not implement `agentproxy doctor`, `run`, `sessions *`, `runtime *`, `config *`, or `chat` behavior in this task group.
- Do not enter TUI or add native TUI launcher behavior.
- Do not change completed Phase 2.4, Phase 2.5, Phase 3, Gate 3, Phase 4.1-4.7, or Gate 4 semantics.
- Preserve AgentProxy's thin control-plane role; v1 still only connects to OpenCode and does not reimplement agent runtime behavior.
- JSON error output must not leak secrets through inline args, config paths with credentials, URL query strings, or provider diagnostic details.

Review notes:

- 2026-05-21: Completed Phase 5.1 CLI Framework Foundation. Centralized CLI global option handling, human/JSON AgentProxy error formatting, stable exit-code mapping, and main parse error handling while keeping planned workflow commands as non-implemented placeholders and preserving `provider exec` passthrough behavior.
- Added focused CLI coverage in `tests/cli-help.test.ts` and `tests/cli-provider-exec.test.ts` for nested global flags, per-command help rendering, JSON errors on stdout, human diagnostics on stderr, Commander parse error redaction with exit code `2`, stable exit code mapping, and redacted JSON provider lookup errors.
- Verification passed: `pnpm exec vitest run tests/cli-help.test.ts tests/cli-provider-exec.test.ts`, `pnpm exec vitest run tests/cli-help.test.ts tests/cli-provider-exec.test.ts tests/config-resolver.test.ts tests/logging.test.ts`, `pnpm run typecheck`, `pnpm run test` (23 files, 172 tests), `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- Code review found no correctness or regression findings. Residual boundary: real `doctor`, `run`, `sessions`, `runtime`, `config`, `chat`, TUI, and broader CLI MVP workflows remain intentionally unimplemented.
- Pre-implementation check-in is superseded by the completed implementation and verification notes above.
- 2026-05-21: User requested a documentation-only progress sync before implementation. `docs/development-progress-tracker.zh.md` now records Phase 5.1 as the next implementation task and explicitly keeps CLI MVP/TUI unfinished.

## Current Iteration - 2026-05-21 Documentation Sync After Gate 4

Scope: update only project tracking documents after `549a979 阶段进展：完成 Gate 4 汇总验证`. Do not implement Phase 5 CLI MVP, TUI, or runtime/provider behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest Gate 4 baseline, completed items, unfinished items, and next startup prompt all point to Gate 4 as complete and Phase 5 CLI MVP as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification and create a detailed Chinese documentation commit.

Dependencies confirmed before implementation:

- Initial working tree was clean and `git log -1 --oneline` was `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Gate 4 implementation/validation evidence already exists in the tracker Review; this task only replaces placeholder baseline text with the concrete commit and clarifies next-start instructions.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Gate 4, unfinished work starting at Phase 5 CLI MVP, and TUI still pending.
- [x] The next-start prompt includes the concrete Gate 4 validation commit and instructs the next Codex session to start at Phase 5 CLI MVP only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 5 start.
- Do not change source code, tests, provider behavior, CLI MVP, TUI, or completed implementation.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the Gate 4 validation baseline.

Review notes:

- 2026-05-21: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `549a979 阶段进展：完成 Gate 4 汇总验证`.
- Updated `docs/development-progress-tracker.zh.md` current status, startup baseline, unfinished item summary, Review entry, and next-start prompt to use Gate 4 as complete and Phase 5 CLI MVP as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This is documentation-only; no source code, tests, provider behavior, CLI MVP, TUI, or runtime behavior is changed.

## Current Iteration - 2026-05-21 Gate 4 Summary Validation

Scope: validate and close Gate 4 only. Prove that the completed Phase 4.1-4.7 OpenCodeProvider provider-layer capabilities work together across health/capability, model listing, session sync, session create/resume, message streaming, session operations, and provider passthrough. Do not implement Phase 5 CLI MVP, TUI, new runtime behavior, permission approval, diff/revert/todo, or a new Agent runtime.

Implementation checklist:

- [x] Confirm the working tree and latest commit, treating `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough` as the latest Phase 4 implementation baseline when the newest commit is documentation-only.
- [x] Run a focused Phase 4 provider/session/passthrough validation matrix.
- [x] Run the full project quality gate: typecheck, test, lint, format check, build, and diff whitespace check.
- [x] Update the Chinese progress tracker to mark Gate 4 done, record verification evidence, and set the next unfinished item to Phase 5 without implementing Phase 5.
- [x] Run final documentation-appropriate checks after tracker updates.
- [x] Create a detailed Chinese commit for Gate 4 validation.

Dependencies confirmed before implementation:

- Working tree starts clean on documentation commit `22dd84a 文档：明确 Phase 4.7 后续启动基线`; latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Phase 4.1-4.7 implementation and focused tests already exist; Gate 4 should prefer verification and progress tracking over new behavior.
- `docs/development-progress-tracker.zh.md` is the primary execution checklist, and `docs/agentproxy-development-plan.md` remains the source plan.
- Existing npm scripts are `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`.

Acceptance criteria for this iteration:

- [x] Focused Phase 4 tests pass for provider health/capability, model listing, session sync, lifecycle, message streaming, session operations, provider passthrough, provider registry, and CLI passthrough boundary.
- [x] Full verification passes: `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- [x] Gate 4 is marked done in `docs/development-progress-tracker.zh.md`, with Review notes listing exact verification commands and results.
- [x] Latest status and next-start instructions move to Phase 5 as the first unfinished item, while explicitly saying Phase 5 CLI MVP and TUI were not implemented during Gate 4.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- Gate 4 is provider-layer validation, not a license to start CLI MVP or TUI.
- Existing Phase 4 tests use fake OpenCode server/binary coverage; real OpenCode smoke calibration remains a later compatibility risk unless a real runtime is explicitly available and requested.
- Do not broaden the provider contract or add abstractions unless validation reveals a real blocker.

Review notes:

- 2026-05-21: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `22dd84a 文档：明确 Phase 4.7 后续启动基线`; latest Phase 4 implementation baseline remains `afdd3e0 阶段进展：完成 Phase 4.7 Provider Passthrough`.
- Gate 4 focused validation passed: `pnpm exec vitest run tests/opencode-provider-health.test.ts tests/opencode-provider-models.test.ts tests/opencode-provider-sessions.test.ts tests/session-sync.test.ts tests/session-lifecycle.test.ts tests/opencode-provider-messages.test.ts tests/session-messages.test.ts tests/opencode-provider-session-actions.test.ts tests/session-actions.test.ts tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts tests/provider-registry.test.ts tests/opencode-event-stream.test.ts` (13 files, 80 tests).
- Full verification passed before tracker updates: `pnpm run typecheck`, `pnpm run test` (23 files, 166 tests), `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- Updated `docs/development-progress-tracker.zh.md` to mark Gate 4 done, move the first unfinished item to Phase 5 CLI MVP, and explicitly preserve the boundary that Gate 4 did not implement Phase 5 CLI MVP or TUI.
- Residual risk: tests use fake OpenCode server/binary coverage; real OpenCode smoke calibration remains a later compatibility task.
- 2026-05-21: Created the detailed Chinese commit for Gate 4 validation after verification.

## Current Iteration - 2026-05-20 Phase 4.7 Provider Passthrough

Scope: advance only Phase 4.7 provider passthrough. Implement the narrow `agentproxy provider exec opencode -- <native args>` escape hatch and OpenCode provider passthrough plumbing. Do not implement broader CLI MVP commands, TUI, permission approval, diff/revert/todo operations, runtime lifecycle changes, or a new Agent runtime.

Implementation checklist:

- [x] Add focused provider passthrough tests for native args passthrough, stdout/stderr capture, original exit code preservation, workspace cwd override, binary lookup, and env allowlist.
- [x] Implement OpenCode provider passthrough using the configured OpenCode binary and a passthrough-specific environment builder.
- [x] Ensure passthrough only injects explicitly allowed OpenCode env vars and does not mutate AgentProxy storage/runtime/session state.
- [x] Replace the `provider exec` placeholder with a minimal command that resolves config, routes to the provider, writes provider stdout/stderr, and preserves provider exit codes.
- [x] Keep AgentProxy diagnostics and stable errors redacted without rewriting provider output.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Current working tree started clean on documentation commit `98e2ae4 文档：同步 Phase 4.6 完成状态与下次启动提示`; latest Phase 4 implementation baseline remains `a018f82 阶段进展：完成 Phase 4.6 Session 操作`.
- `PassthroughRequest`, `PassthroughResult`, and `AgentProvider.passthrough()` already exist in `src/providers/types.ts`; `OpenCodeProvider.passthrough()` is currently unsupported.
- OpenCode binary discovery should reuse `probeOpenCodeBinary()` so configured relative paths resolve from the caller workspace instead of falling back to `PATH`.
- OpenCode native env allowlist is already defined as `OPENCODE_PASSTHROUGH_ENV_NAMES`; this phase must add runtime env construction rather than passing all of `process.env`.
- The CLI already has a `provider exec <id> [nativeArgs...]` command shape; this phase implements only that command, not the rest of Phase 5 CLI MVP.

Acceptance criteria for this iteration:

- [x] `agentproxy provider exec opencode -- --version` runs against a fake OpenCode binary in tests and exits with the provider's original exit code.
- [x] Native args after `--` are passed to OpenCode without AgentProxy interpretation.
- [x] Provider stdout and stderr are forwarded to the caller without being stored or wrapped; AgentProxy's own diagnostics remain redacted.
- [x] The passthrough child process receives only the required execution environment plus allowlisted OpenCode env vars, not arbitrary secret-shaped parent env vars.
- [x] `workspacePath` controls the child process cwd and configured relative binaries resolve from that cwd.
- [x] Missing binary maps to `PROVIDER_UNAVAILABLE`; failed native command returns `PassthroughResult.exitCode` instead of throwing when the provider process exits normally with a non-zero code.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- [x] Chinese progress tracker marks Phase 4.7 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- Passthrough is intentionally an escape hatch, so the provider's own output is preserved; only AgentProxy diagnostic text should be redacted.
- Do not reuse the existing session CLI helper's full `process.env` merge for passthrough, because Phase 4.7 requires an allowlist env boundary.
- Commander parsing around `--` must be tested so native flags are not swallowed or converted into AgentProxy options.
- This phase should not implement provider inspect/list, runtime commands, run/resume/session CLI workflows, or TUI.

Review notes:

- 2026-05-20: Added `src/providers/opencode/passthrough.ts`, wired `OpenCodeProvider.passthrough()`, and implemented a narrow `agentproxy provider exec opencode -- <native args>` CLI path without implementing broader CLI MVP or TUI commands.
- Added `tests/opencode-provider-passthrough.test.ts` and `tests/cli-provider-exec.test.ts`, covering native arg preservation, original stdout/stderr and exit code behavior, signal exit code mapping, workspace cwd, configured relative binary resolution, missing binary errors, allowlisted env injection, parent secret exclusion, no preflight `--version` child, no hidden default timeout, and large provider output without hidden AgentProxy buffer caps.
- Code review initially found two blockers: binary probe could leak parent env before passthrough and hidden timeout/buffer caps could rewrite native behavior. Fixed by resolving the OpenCode executable without running `--version`, using the same restricted env for resolution and child execution, and removing default timeout/output caps. A second review found no blockers; signal exit code mapping and slow-command regression coverage were added. The reusable rule was recorded in `tasks/lessons.md`.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts`, `pnpm exec vitest run tests/opencode-provider-passthrough.test.ts tests/cli-provider-exec.test.ts tests/cli-help.test.ts tests/config-resolver.test.ts tests/opencode-binary.test.ts`, `pnpm exec vitest run tests/opencode-provider-session-actions.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`, `pnpm run typecheck`, `pnpm run test` (23 files, 166 tests), `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Documentation Sync After Phase 4.6

Scope: update only project tracking documents after `a018f82 阶段进展：完成 Phase 4.6 Session 操作`. Do not implement Phase 4.7, provider passthrough, CLI MVP, TUI, or runtime/provider behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 4.6 as complete and Phase 4.7 as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification and create a detailed Chinese documentation commit.

Dependencies confirmed before implementation:

- The latest implementation commit is `a018f82 阶段进展：完成 Phase 4.6 Session 操作`.
- Phase 4.6 implementation and verification evidence already exists in the tracker Review; this task only replaces placeholder baseline text with the concrete commit and clarifies the next-start instructions.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 4.6, unfinished work starting at Phase 4.7, and Gate 4 still pending.
- [x] The next-start prompt includes the concrete Phase 4.6 implementation commit and instructs the next Codex session to start at Phase 4.7 only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 4.7 start.
- Do not change source code, tests, provider behavior, CLI MVP, TUI, passthrough, or completed implementation.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the latest implementation baseline.

Review notes:

- 2026-05-20: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `a018f82 阶段进展：完成 Phase 4.6 Session 操作`.
- Updated `docs/development-progress-tracker.zh.md` latest implementation commit, startup baseline, unfinished item summary, Review entry, and next-start prompt to use Phase 4.6 as complete and Phase 4.7 as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This is documentation-only; no source code, tests, provider behavior, CLI MVP, TUI, passthrough, or Phase 4.7 work is changed.

## Current Iteration - 2026-05-20 Phase 4.6 Session Operations

Scope: advance only Phase 4.6 session operation provider/service layer. Do not implement CLI MVP commands, TUI, provider passthrough, permission approval flows, diff/revert/todo operations, or a new Agent runtime.

Implementation checklist:

- [x] Add focused provider tests for OpenCode abort, delete, share, unshare, sanitized export, raw export confirmation, and import.
- [x] Implement OpenCodeProvider session operations using OpenCode server APIs where documented and OpenCode CLI only for native export/import.
- [x] Add a provider-agnostic session operations service for local confirmation gates, tombstone writes, metadata updates, and import mapping persistence.
- [x] Keep export/import/share payloads out of SQLite; store only sanitized operation metadata and stable IDs.
- [x] Update provider capability reporting only for operations implemented in this iteration.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Latest working tree started clean on documentation commit `a45aef8`; latest Phase 4 implementation baseline remains `76a976f 阶段进展：完成 Phase 4.5 Message 发送与事件映射`.
- Reuse existing `AgentProvider` operation contracts in `src/providers/types.ts`; only optional confirmation fields may be added if needed for raw export safety.
- Reuse current OpenCode HTTP helpers in `src/providers/opencode/sessions.ts` for runtime URL resolution, timeout handling, request error mapping, session response parsing, and metadata whitelisting.
- OpenCode server docs expose `POST /session/:id/abort`, `DELETE /session/:id`, `POST /session/:id/share`, and `DELETE /session/:id/share`; official CLI docs expose `opencode export [sessionID] --sanitize` and `opencode import <file-or-share-url>`.
- Reuse existing SQLite `sessions` repository and `markDeleted()` tombstone path; no migration is planned.

Acceptance criteria for this iteration:

- [x] Fake OpenCode runtime can abort, delete, share, and unshare sessions through `OpenCodeProvider` with stable error mapping for auth, missing runtime, not found, and malformed responses.
- [x] Export defaults to sanitized output, returns `sanitized: true`, parses JSON data, and never persists exported transcript/file payloads.
- [x] Raw export is rejected unless an explicit raw confirmation flag is set, then returns `sanitized: false`.
- [x] Import uses OpenCode native import behavior, maps or validates the imported provider session id, and persists only a local AgentProxy index projection.
- [x] Provider-agnostic delete requires explicit confirmation, calls provider delete, and writes a local tombstone without reviving existing tombstones.
- [x] Provider-agnostic share/unshare updates local sharing metadata without storing public share URLs in SQLite.
- [x] Prompt text, raw export data, import source URLs, share URLs, raw provider response bodies, URL credentials, and query secrets do not leak into persisted records or stable errors.
- [x] Focused tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- [x] Chinese progress tracker marks Phase 4.6 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode export/import are CLI-backed because the current server API list does not expose export/import endpoints; keep this as a narrow provider operation, not generic passthrough.
- OpenCode import stdout format may evolve; accept JSON/session-id shapes conservatively and fail closed when the imported session id cannot be identified.
- `share` returns a live URL to the caller, but SQLite should store only `shared: true/false` style metadata because share URLs may grant access.
- Confirmation gates belong in the AgentProxy session service layer; CLI/TUI can wire `--yes` or prompts later without changing provider behavior.
- This phase must not add CLI/TUI workflows or expand completed Phase 4.1-4.5 behavior beyond shared helper reuse.

Review notes:

- 2026-05-20: Added provider and session operation tests, then implemented OpenCode abort/delete/share/unshare through server API and export/import through a narrow native OpenCode CLI operation boundary.
- Added `src/sessions/actions.ts` for provider-agnostic confirmation gates, delete tombstones, import mapping persistence, and share/unshare metadata updates without storing share URLs or export payloads.
- Updated capability probing to expose implemented abort/delete/export/import/share/unshare only when the required OpenCode server endpoint or binary boundary is available.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-session-actions.test.ts tests/session-actions.test.ts tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Documentation Sync After Phase 4.5

Scope: update only project tracking documents after `76a976f 阶段进展：完成 Phase 4.5 Message 发送与事件映射`. Do not implement Phase 4.6, provider passthrough, CLI MVP, TUI, or runtime/provider behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 4.5 as complete and Phase 4.6 as next.
- [x] Record this documentation-only update in tracker Review notes.
- [x] Run documentation-appropriate verification and create a detailed Chinese documentation commit.

Dependencies confirmed before implementation:

- The latest implementation commit is `76a976f 阶段进展：完成 Phase 4.5 Message 发送与事件映射`.
- Phase 4.5 implementation and verification evidence already exists in the tracker Review; this task only replaces placeholder baseline text with the concrete commit and clarifies the next-start instructions.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 4.5, unfinished work starting at Phase 4.6, and Gate 4 still pending.
- [x] The next-start prompt includes the concrete Phase 4.5 implementation commit and instructs the next Codex session to start at Phase 4.6 only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 4.6 start.
- Do not change source code, tests, provider behavior, CLI MVP, TUI, passthrough, or completed implementation.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the latest implementation baseline.

Review notes:

- 2026-05-20: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `76a976f 阶段进展：完成 Phase 4.5 Message 发送与事件映射`.
- Updated `docs/development-progress-tracker.zh.md` latest implementation commit, startup baseline, unfinished item summary, Review entry, and next-start prompt to use Phase 4.5 as complete and Phase 4.6 as the first unfinished task.
- Verification passed: `git diff --check`, `pnpm run format:check`, and placeholder scan for stale Phase 4.5 baseline text.
- This was documentation-only; no source code, tests, provider behavior, CLI MVP, TUI, passthrough, or Phase 4.6 work was changed.

## Current Iteration - 2026-05-20 Phase 4.5 Message Send / Event Mapping

Scope: advance only Phase 4.5 message sending and event mapping from the Chinese progress tracker. Do not implement CLI MVP commands, TUI, abort/delete/export/share/import, provider passthrough, permission approval APIs, or a new Agent runtime.

Implementation checklist:

- [x] Add focused provider tests for `OpenCodeProvider.sendMessage()` against fake `/session/:id/message` and `/event` endpoints.
- [x] Add focused session service tests proving message dispatch updates the local session index and stores only sanitized event metadata.
- [x] Reuse the existing OpenCode runtime SSE parser/mapping path for provider message streams instead of duplicating a second event model.
- [x] Implement `OpenCodeProvider.sendMessage()` with conservative request/response error mapping, model parsing, and prompt text excluded from returned metadata/errors.
- [x] Map message delta, tool start/finish, permission request/resolution, file update, diff update, raw provider events, and terminal completed/failed events.
- [x] Add a small provider-agnostic message service that dispatches prompts through `AgentProvider.sendMessage()`, persists local session status, and appends sanitized event records.
- [x] Update provider capability reporting only for implemented message/headless behavior.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Latest implementation baseline is `aaa3dee 阶段进展：完成 Phase 4.4 Session 创建与恢复`; latest working tree started clean after documentation commit `56a55ed`.
- Reuse `AgentProvider.sendMessage(ctx)` and `SendMessageRequest` from `src/providers/types.ts`; no provider interface redesign is planned for this task group.
- Reuse Phase 4.4 OpenCode session URL/model/request timeout/error mapping patterns and current OpenCode server API boundary `POST /session/{sessionID}/message`.
- Reuse Phase 3.5 OpenCode `/event` SSE mapping and keep unknown provider events as `provider.raw_event`.
- Reuse existing SQLite `sessions` and `session_events` repositories; no migration is planned.

Acceptance criteria for this iteration:

- [x] A healthy fake OpenCode runtime can accept a prompt through `OpenCodeProvider.sendMessage()` and return an async stream that completes after an idle/completed session event.
- [x] Returned events include stable `message.delta`, `tool.started`, `tool.finished`, `permission.requested`, `permission.resolved`, `file.changed`, `diff.updated`, `provider.raw_event`, and terminal `session.completed` mappings where corresponding provider events are present.
- [x] Permission request events are surfaced but no permission response/approval endpoint is called automatically.
- [x] Missing/invalid runtime base URL maps to `PROVIDER_UNAVAILABLE`; `401`/`403` maps to `PERMISSION_DENIED`; `404` maps to `SESSION_NOT_FOUND`; prompt text, raw response bodies, URL query secrets, credentials, transcript deltas, and raw provider payloads do not leak into persisted metadata/errors.
- [x] Message dispatch through the session service requires an existing non-tombstoned local session mapping, marks the session `running` while the message is active, and persists final `completed` or `failed` status.
- [x] Session event records store only sanitized event metadata/projections, not full prompt text, message deltas, tool input/output, diffs, or raw provider payloads.
- [x] Focused provider/message lifecycle tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- [x] Chinese progress tracker marks Phase 4.5 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode event shapes can evolve; mapper must accept stable scalar fields, keep unknown events as raw provider events, and avoid depending on provider-private payload structure.
- Live event streams may carry transcript, diff, tool input/output, or filesystem content. These can be yielded to callers as live events when explicitly mapped, but storage must keep only sanitized projections.
- `sendMessage()` must not auto-approve permissions; permission response remains a later explicit capability.
- Positional prompt and stdin prompt are represented at this layer as an already-composed prompt string for future CLI wiring; this iteration must not implement CLI parsing.
- This phase must not enter CLI MVP, TUI, provider passthrough, or session destructive operations.

Review notes:

- 2026-05-20: Added `tests/opencode-provider-messages.test.ts` and `tests/session-messages.test.ts`, then implemented `OpenCodeProvider.sendMessage()` and provider-agnostic `sendAgentProxyMessage()`.
- Reused the Phase 3 SSE parser/envelope mapper by exporting `streamOpenCodeEventEnvelopesFromResponse()`, extended mapping for OpenCode sync tool events and `session.diff`, and kept unknown events as `provider.raw_event`.
- Message dispatch subscribes to `/event` before posting to `/session/:id/message`, validates SSE media type, waits only for message response headers, and cancels response bodies/readers best-effort.
- Local session message persistence requires a non-tombstoned mapping, marks sessions `running` then `completed`/`failed`, and appends sanitized event projections without prompt text, deltas, tool input/output, diffs, or raw payloads.
- Code review fixes: `session.next.step.ended.1` no longer terminates message streams; strict message streams ignore provider events without explicit target `sessionID`; pre-aborted requests map to `opencode.provider.sendMessage`; early consumer `return()` marks the local session failed; `headlessRun` capability now requires event stream, create, resume, and message send support.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-messages.test.ts tests/session-messages.test.ts`, `pnpm exec vitest run tests/opencode-event-stream.test.ts tests/opencode-provider-health.test.ts tests/opencode-provider-sessions.test.ts tests/session-lifecycle.test.ts tests/session-messages.test.ts tests/opencode-provider-messages.test.ts`, `pnpm exec vitest run tests/opencode-provider-messages.test.ts tests/session-messages.test.ts tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Documentation Sync After Phase 4.4

Scope: update only the project tracking documents after `aaa3dee 阶段进展：完成 Phase 4.4 Session 创建与恢复`. Do not implement Phase 4.5, CLI MVP, TUI, passthrough, or any runtime/provider behavior.

Implementation checklist:

- [x] Confirm current git status and latest commit.
- [x] Update `docs/development-progress-tracker.zh.md` so the latest implementation baseline, completed items, unfinished items, and next startup prompt all point to Phase 4.4 as complete and Phase 4.5 as next.
- [x] Record this documentation-only update in the tracker Review section.
- [x] Run documentation-appropriate verification and create a detailed Chinese documentation commit.

Dependencies confirmed before implementation:

- The latest implementation commit is expected to be `aaa3dee 阶段进展：完成 Phase 4.4 Session 创建与恢复`.
- Phase 4.4 implementation and verification evidence already exists in the tracker Review; this task only corrects stale baseline fields and next-start instructions.
- `docs/agentproxy-development-plan.md` remains the source plan and does not need architecture changes for this documentation sync.

Acceptance criteria for this iteration:

- [x] `git status --short` and `git log -1 --oneline` are checked and reflected in this documentation pass.
- [x] The Chinese progress tracker clearly states completed phases through Phase 4.4, unfinished work starting at Phase 4.5, and Gate 4 still pending.
- [x] The next-start prompt includes the concrete Phase 4.4 implementation commit and instructs the next Codex session to start at Phase 4.5 only.
- [x] The final answer gives the user a ready-to-send prompt.

Risks and constraints:

- Do not treat this documentation sync as a Phase 4.5 start.
- Do not change source code, tests, or completed phase checkboxes except to correct documentation state.
- If this documentation update is committed, the next startup prompt must distinguish the documentation commit from the latest implementation baseline.

Review notes:

- 2026-05-20: Confirmed initial `git status --short` was clean and `git log -1 --oneline` was `aaa3dee 阶段进展：完成 Phase 4.4 Session 创建与恢复`.
- Updated `docs/development-progress-tracker.zh.md` latest implementation commit, startup baseline, unfinished item summary, Review entry, and next-start prompt to use Phase 4.4 as complete and Phase 4.5 as the first unfinished task.
- Verification passed: `git diff --check` and `pnpm run format:check`.
- This was documentation-only; no source code, tests, provider behavior, CLI MVP, or TUI work was changed.

## Current Iteration - 2026-05-20 Phase 4.4 Session Create / Resume

Scope: advance only Phase 4.4 session creation and resume from the Chinese progress tracker. Do not implement CLI MVP commands, TUI, provider passthrough, full `sendMessage` event streaming, abort/delete/export/share, or OpenCode runtime changes.

Implementation checklist:

- [x] Add focused provider tests for OpenCode `POST /session`, `GET /session/:id`, and optional `POST /session/:id/prompt_async`.
- [x] Implement `OpenCodeProvider.startSession()` and `OpenCodeProvider.resumeSession()` using the OpenCode server API.
- [x] Implement `OpenCodeProvider.getSession()` as the read-only restore primitive used by resume.
- [x] Add a small session lifecycle service that generates AgentProxy session IDs and persists provider-to-local mappings into SQLite.
- [x] Preserve workspace path, runtime ID, model selection, parent mapping, source-of-truth metadata, and tombstone safety.
- [x] Keep prompt text, transcript/message arrays, raw provider payloads, auth headers, URL credentials, and query secrets out of persisted metadata and errors.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse the existing `AgentProvider.startSession(ctx)` and `AgentProvider.resumeSession(ctx)` contracts from `src/providers/types.ts`; do not redesign the provider interface unless tests expose a real contract gap.
- Use OpenCode server API boundaries confirmed from current official SDK-generated types: `POST /session` creates a session, `GET /session/:id` restores session metadata, and `POST /session/:id/prompt_async` accepts an asynchronous prompt after creation/resume.
- Reuse Phase 4.1/4.2/4.3 runtime base URL resolution, timeout handling, URL sanitization, status mapping, and metadata white-listing patterns.
- Reuse the existing SQLite `sessions` repository and schema; no migration is planned for this task group.
- Reuse existing source-of-truth semantics: provider owns session content/status/title, AgentProxy owns local session ID, workspace index, tombstones, and provider-to-local mapping.

Acceptance criteria for this iteration:

- [x] Healthy fake OpenCode runtime can create a provider session through `OpenCodeProvider.startSession()` and map the response to a stable `ProviderSession`.
- [x] `OpenCodeProvider.resumeSession()` uses the original `providerSessionId` and does not create a second provider session.
- [x] Optional prompt dispatch after create/resume uses `prompt_async` and records only non-sensitive delivery metadata; full message streaming remains unsupported until Phase 4.5.
- [x] Missing or invalid runtime base URL maps to `PROVIDER_UNAVAILABLE`; `401`/`403` maps to `PERMISSION_DENIED`; `404` resume maps to a stable not-found diagnostic; raw response bodies and secrets do not leak.
- [x] `startAgentProxySession()` generates an AgentProxy session ID, persists the provider session mapping, workspace path, requested model selection metadata, runtime ID, and last sync timestamp.
- [x] `resumeAgentProxySession()` reuses an existing local mapping by `(providerId, providerSessionId)`, preserves the local workspace path, and records provider workspace conflicts in metadata.
- [x] Tombstoned local sessions are not revived by start/resume persistence.
- [x] Focused provider and lifecycle tests pass, followed by `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.
- [x] Chinese progress tracker marks Phase 4.4 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode session response shape may evolve; parser must accept only stable scalar fields and preserve a white-listed `metadata.opencode` shape.
- `prompt_async` is intentionally fire-and-forget in this phase; Phase 4.5 will implement `sendMessage`, event mapping, completion/failure status updates, and permission handling.
- The provider API must not store full prompts, message parts, transcript content, raw response payloads, provider credentials, or URL query secrets.
- Tombstone behavior remains a safety boundary; explicit tombstone restore or undelete is not part of Phase 4.4.
- This phase must not add CLI/TUI workflows or modify completed Phase 4.1-4.3 behavior beyond shared helper reuse.

Review notes:

- 2026-05-20: Added OpenCode provider session creation/get/resume support in `src/providers/opencode/sessions.ts`, wired `OpenCodeProvider.getSession()`, `startSession()`, and `resumeSession()`, and updated provider capability probing for create/resume endpoints.
- Added `src/sessions/lifecycle.ts` with `startAgentProxySession()` and `resumeAgentProxySession()` to generate AgentProxy session IDs, persist provider-to-local mappings, preserve tombstones, validate parent sessions, and record workspace/runtime/requested-model metadata without storing prompts.
- Initial prompt dispatch is split into create -> persist -> resume prompt, so prompt failure leaves a local mapping with sanitized `lastError` instead of an unknown provider orphan session. Direct provider start returns created session metadata when prompt dispatch fails.
- Code/security review fixes: provider get/resume now rejects mismatched response session IDs before prompt dispatch; lifecycle persistence also validates requested vs returned provider session IDs; parent sessions must exist, be non-tombstoned, and match provider; method capability probes require 2xx/405 plus `Allow`.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-sessions.test.ts tests/session-lifecycle.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Phase 4.3 Session Sync

Scope: advance only Phase 4.3 session synchronization from the Chinese progress tracker. Do not implement session creation/resume, message sending, passthrough, CLI MVP commands, or TUI.

Implementation checklist:

- [x] Add focused tests for OpenCodeProvider `listSessions()` against a fake `/session` endpoint.
- [x] Map OpenCode session list data into stable `ProviderSession` records without storing transcripts or raw secrets.
- [x] Add a small session sync service that imports provider sessions into the local SQLite index.
- [x] Preserve tombstones during sync and prevent deleted local indexes from being revived.
- [x] Mark existing local sessions as `missing_in_provider` when the provider list is explicitly known to be complete.
- [x] Preserve AgentProxy-owned workspace paths while recording provider workspace conflicts in metadata.
- [x] Return synced sessions ordered by `updatedAt` descending and support workspace filtering.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse the existing `AgentProvider.listSessions(ctx, query)` contract and `ProviderSession` fields from `src/providers/types.ts` and `src/sessions/types.ts`.
- Reuse Phase 4.1 runtime base URL resolution, URL sanitization, and request timeout helpers for OpenCode HTTP calls.
- Use OpenCode `GET /session` as the read-only provider session list boundary; do not create, mutate, resume, delete, or export sessions in this phase.
- Reuse the SQLite `sessions` repository from Phase 2.5 for local indexing; do not add migrations unless a real Phase 4.3 requirement cannot be met with the current schema.
- Reuse existing source-of-truth semantics: provider owns content/status/title, AgentProxy owns local session ID, workspace index, tombstones, and provider-to-local mapping.

Acceptance criteria for this iteration:

- [x] Healthy fake OpenCode runtime returns `ProviderSession[]` from `OpenCodeProvider.listSessions()`.
- [x] Missing or invalid runtime base URL maps to `PROVIDER_UNAVAILABLE`; `401` or `403` maps to `PERMISSION_DENIED`; raw response bodies, auth headers, URL credentials, query secrets, and transcript content do not leak.
- [x] Provider sessions that are not in local storage are imported as new AgentProxy session index records.
- [x] Existing local sessions are updated from provider title/status/time/model data while keeping the original local `workspacePath`.
- [x] Local sessions absent from the provider list are marked `missing_in_provider` without deleting rows only when `missingDetection: "completeProviderList"` is explicitly enabled.
- [x] Tombstoned sessions are not revived or returned by default sync output.
- [x] Sync output and storage listing are ordered by `updatedAt` descending and can be filtered by workspace.
- [x] `pnpm exec vitest run tests/opencode-provider-sessions.test.ts tests/session-sync.test.ts tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check` pass.
- [x] Chinese progress tracker marks Phase 4.3 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode `/session` response shape may evolve; parser must accept only stable scalar fields and keep provider-specific metadata white-listed and JSON-safe.
- Sync must not copy full transcripts, message arrays, tool call details, prompts, or raw provider payloads into SQLite.
- Tombstone behavior is a safety boundary from Phase 2.5; sync must not clear `deletedAt` or `tombstoneReason`.
- Provider workspace metadata can conflict with AgentProxy's local index; AgentProxy should keep the original local workspace path and record the provider value under metadata.
- This phase does not implement `startSession`, `resumeSession`, `sendMessage`, `deleteSession`, provider passthrough, CLI wrappers, or TUI screens.

Review notes:

- 2026-05-20: Added `src/providers/opencode/sessions.ts`, wired `OpenCodeProvider.listSessions()`, added `src/sessions/sync.ts`, and exported `syncProviderSessions()`.
- The provider layer reads only `GET /session` and best-effort `GET /session/status`, maps stable scalar fields into `ProviderSession`, maps OpenCode model IDs as `provider/model`, and avoids persisting transcript arrays, raw payloads, raw secrets, or free-text summary.
- The sync layer imports new provider sessions into SQLite, updates existing local rows by global `(providerId, providerSessionId)`, preserves tombstones, records workspace conflicts in metadata, and only marks `missing_in_provider` when `missingDetection: "completeProviderList"` is explicitly requested.
- Code review fixes: skipped missing detection for partial lists by default, avoided cross-workspace unique-constraint collisions, stopped treating GET `/session` 405 as a supported list endpoint, mapped session model metadata, and removed summary persistence.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-sessions.test.ts tests/session-sync.test.ts tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Phase 4.2 Model / Provider List

Scope: advance only OpenCodeProvider model listing from the Chinese progress tracker. Do not implement CLI provider commands, doctor checks, session sync, message sending, passthrough, or TUI.

Implementation checklist:

- [x] Add focused tests for OpenCodeProvider `listModels()` against a fake `/provider` endpoint.
- [x] Map OpenCode provider/model response data into stable `ModelRef` records.
- [x] Preserve provider-specific provider/model fields under metadata without leaking auth headers or raw credentials.
- [x] Handle unauthenticated provider state and empty model lists with stable, actionable diagnostics.
- [x] Keep the implementation provider-layer only; do not add CLI wrappers or session behavior.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 4.1 runtime base URL resolution and request timeout semantics where possible.
- Use OpenCode `GET /provider` as the read-only model/provider list boundary.
- Use existing `ModelRef` contract: `id`, `providerId`, `displayName`, optional `family`, optional `contextWindowTokens`, and metadata.
- Use stable `ProviderContext.metadata` for runtime base URL input; do not start or stop runtimes from provider code.
- Use Node.js built-in `fetch` and AbortController; do not add dependencies for this task group.

Acceptance criteria for this iteration:

- [x] Healthy fake OpenCode runtime with `/provider` data returns model refs using `provider/model` ids.
- [x] Model display name, provider family/API, context window, and provider/model metadata are preserved in a stable JSON-safe shape.
- [x] Missing or invalid runtime base URL maps to `PROVIDER_UNAVAILABLE` with an actionable diagnostic instead of crashing.
- [x] `401` or `403` provider-list responses map to `PERMISSION_DENIED` with unauthenticated diagnostics and no raw provider payload leak.
- [x] Empty provider/model responses return an empty array without throwing.
- [x] `pnpm exec vitest run tests/opencode-provider-models.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check` pass.
- [x] Chinese progress tracker marks Phase 4.2 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode `/provider` response shape may evolve; parser must be conservative and keep unknown fields in metadata rather than promoting them to global contract fields.
- Provider/model endpoint may expose auth state; returned errors must be actionable but must not include raw response bodies, credentials, headers, or query secrets.
- This phase only implements `OpenCodeProvider.listModels()`; CLI `provider list`, doctor `provider list`, model selection persistence, and session workflows remain later phases.
- AgentProxy remains a thin control plane and must not implement model provider behavior or infer provider internals beyond response mapping.

Review notes:

- 2026-05-20: Added `src/providers/opencode/models.ts`, wired `OpenCodeProvider.listModels()` through it, and added `tests/opencode-provider-models.test.ts`.
- The implementation reads only `GET /provider`, maps native OpenCode provider/model data into `ModelRef`, preserves a white-listed `metadata.opencode` shape, and keeps `options`/`headers` out of metadata.
- Code review fixes: aligned fake payload and parser with current OpenCode `api` field, narrowed `limit.context`/`limit.output` to positive integers, added invalid credential URL coverage, and kept unauthenticated responses mapped to `PERMISSION_DENIED`.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-models.test.ts tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and `git diff --check`.

## Current Iteration - 2026-05-20 Phase 4.1 OpenCodeProvider Health / Capability

Scope: advance only OpenCodeProvider health and capability probing from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for OpenCodeProvider binary, runtime health, server API, SSE, and SDK availability probing.
- [x] Implement a small provider-layer OpenCode probe that reuses Phase 3 runtime constants and does not start/stop runtimes.
- [x] Update `OpenCodeProvider.getCapabilities()` to return runtime-overridden capabilities, provider version, and provider-specific metadata.
- [x] Update `OpenCodeProvider.healthCheck()` to return healthy/degraded/unhealthy status with stable sanitized metadata.
- [x] Keep the implementation limited to provider health/capability; do not implement model listing, session sync, message sending, CLI MVP, or TUI.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 3.1 `probeOpenCodeBinary()` for binary and OpenCode version detection.
- Reuse Phase 3.3 `/global/health` health path and Phase 3.5 `/event` SSE path constants for runtime probes.
- Use Node.js built-in `fetch`, `AbortController`, and `createRequire`; do not add dependencies for this small task group.
- Treat `@opencode-ai/sdk` as an optional availability probe only in this iteration; do not call SDK APIs yet.
- Accept a configured or context-provided runtime base URL for probing; do not create a new runtime manager path in provider code.
- Preserve provider-specific probe details under metadata and avoid promoting unstable OpenCode fields into global contracts.

Acceptance criteria for this iteration:

- [x] With a supported fake OpenCode binary and fake healthy server, `healthCheck()` returns `healthy` and includes OpenCode version metadata.
- [x] With no runtime base URL but a supported binary, `healthCheck()` returns `degraded` instead of throwing.
- [x] With a missing or invalid binary and no healthy runtime, `healthCheck()` returns `unhealthy` with a stable provider-unavailable diagnostic.
- [x] `getCapabilities()` reports static binary-backed lifecycle capabilities and enables runtime `openApi`/`sse` flags only when the runtime probe proves the server endpoints; session/message/TUI endpoint probes stay in metadata until those AgentProvider operations are implemented.
- [x] SDK availability is explicitly reported in capabilities and metadata without requiring `@opencode-ai/sdk` to be installed.
- [x] Probe errors and URLs are sanitized: no query secrets, URL credentials, raw provider payloads, or provider-controlled raw headers leak into returned metadata.
- [x] `pnpm exec vitest run tests/opencode-provider-health.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 4.1 health/capability group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- This does not implement `providers inspect`; the current CLI still has a planned placeholder until Phase 5.
- Real OpenCode API shape may need later smoke calibration; this iteration uses conservative endpoint reachability and fake server tests.
- Runtime probing must be read-only and must not create sessions, mutate config, approve permissions, or start/stop processes.
- OpenCodeProvider must remain a thin API adapter and not infer or duplicate OpenCode runtime internals.

Review notes:

- 2026-05-20: Added `src/providers/opencode/probe.ts`, wired `OpenCodeProvider.getCapabilities()` and `healthCheck()` to provider-layer probes, and added `tests/opencode-provider-health.test.ts`.
- The probe reuses Phase 3 OpenCode binary, `/global/health`, and `/event` boundaries; it does not start/stop runtimes, create sessions, send messages, approve permissions, or enter CLI/TUI.
- Code review fixes: covered health body timeout in the same abort lifecycle as fetch, required `OPTIONS Allow` proof for mutating endpoint methods, stopped inferring OpenAPI from health alone, kept unimplemented session/message/TUI AgentProvider operations out of top-level capabilities, and normalized provider-controlled headers to `mediaType`/allow method lists.
- Verification passed: `pnpm exec vitest run tests/opencode-provider-health.test.ts tests/provider-registry.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`, `git diff --check`.
- Remaining risk: `providers inspect` CLI acceptance remains unimplemented by design until the CLI phase; real OpenCode API shape still needs later smoke calibration.

## Current Iteration - 2026-05-20 Phase 3 Runtime Diagnostics / Gate 3

Scope: advance only OpenCode runtime diagnostics and Gate 3 aggregation from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for runtime diagnostic checks covering OpenCode binary probing, runtime registry summary, health endpoint, event stream endpoint, and managed start/stop smoke behavior.
- [x] Implement a small runtime-layer OpenCode diagnostic service that future `doctor` can reuse without implementing the CLI command in this phase.
- [x] Prove diagnostic details are sanitized and do not leak URL credentials, query secrets, or raw provider internals.
- [x] Prove Gate 3 can be summarized from Phase 3.1-3.5 capabilities: start, attach/connect, event stream, diagnose, and stop.
- [x] Keep the implementation limited to runtime lifecycle diagnostics; do not implement OpenCodeProvider session behavior, CLI MVP, `agentproxy doctor`, or TUI.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 3.1 `probeOpenCodeBinary()` for binary/version diagnostics.
- Reuse Phase 3.2 `RuntimeRegistry` and SQLite-backed runtime records for registry summaries.
- Reuse Phase 3.3 `OpenCodeManagedRuntimeManager` for explicit managed smoke start/stop verification.
- Reuse Phase 3.4 attached runtime health semantics and `/global/health` as the runtime health boundary.
- Reuse Phase 3.5 `/event` as the event stream endpoint check; do not parse OpenCode internal runtime state.
- Reuse existing redaction helpers for diagnostic details.

Acceptance criteria for this iteration:

- [x] Diagnostics return a structured report with per-check status and summary counts.
- [x] Missing or invalid OpenCode binary diagnostics report a failed check without throwing to callers.
- [x] A healthy runtime registry record plus fake OpenCode HTTP server produces passing health and event stream checks.
- [x] Managed smoke diagnostics can start a fake `opencode serve`, verify health/event stream, then stop the owned process.
- [x] Failed checks include stable error codes and sanitized details.
- [x] Gate 3 summary reports pass only when binary, registry, health/connect, event stream, and managed stop checks are healthy.
- [x] `pnpm exec vitest run tests/opencode-runtime-diagnostics.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 3 runtime diagnostics / Gate 3 group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- This is not the full `agentproxy doctor` CLI; it is a runtime-layer diagnostic primitive for future CLI/TUI use.
- Managed smoke diagnostics are intentionally explicit because they start and stop a child process.
- Event stream diagnostics should only prove the endpoint is reachable and SSE-like; production payload calibration remains a later real OpenCode smoke task.
- Diagnostic output must avoid raw URL query strings, credentials, auth headers, and full event payloads.
- Do not implement OpenCodeProvider core session/model/message APIs, CLI MVP, TUI, or passthrough in this iteration.

Review notes:

- 2026-05-20: Added `src/runtimes/diagnostics.ts`, exported it from `src/runtimes/index.ts`, and added `tests/opencode-runtime-diagnostics.test.ts`.
- Implemented runtime-layer `OpenCodeRuntimeDiagnostics` for future doctor/CLI/TUI reuse without implementing the `agentproxy doctor` command. The report contains per-check status, summary counts, sanitized details, and a Gate 3 capability summary.
- Covered binary probe failure as a failed check without throwing, registry summaries, registered runtime `/global/health`, `/event` reachability, URL credential/query sanitization, and explicit managed smoke start/health/event/stop proving Gate 3 can pass.
- Code review fixes: extended request timeout/abort coverage through health response body parsing, added `finally` cleanup for managed smoke children, made explicit runtime IDs without `baseUrl` fail instead of skip, tightened SSE media type matching, made response body cancel best-effort, and sanitized diagnostic messages.
- Verification passed: `pnpm exec vitest run tests/opencode-runtime-diagnostics.test.ts`, `pnpm exec vitest run tests/opencode-binary.test.ts tests/runtime-registry.test.ts tests/opencode-managed-runtime.test.ts tests/opencode-attached-runtime.test.ts tests/opencode-event-stream.test.ts tests/opencode-runtime-diagnostics.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`.
- Remaining risk: this is a runtime-layer diagnostic primitive, not the full `agentproxy doctor` CLI. A later real OpenCode smoke test should still calibrate production `/global/health` and `/event` behavior before release.

## Current Iteration - 2026-05-20 Phase 3.5

Scope: advance only OpenCode runtime event stream handling from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for connecting to a fake OpenCode SSE event stream.
- [x] Add tests proving provider events are wrapped in AgentProxy event envelopes.
- [x] Add tests proving unknown provider events map to `provider.raw_event` and retain `raw`.
- [x] Add tests proving stream interruption marks the runtime `degraded` without failing any session.
- [x] Add tests proving finite reconnect/backoff transitions through `reconnecting` and recovers to `healthy`.
- [x] Add tests proving exhausted reconnect attempts map to `EVENT_STREAM_INTERRUPTED`.
- [x] Implement a small OpenCode event stream client around `/event` SSE parsing, conservative event mapping, runtime status updates, and finite reconnect.
- [x] Keep the implementation limited to event stream lifecycle; do not implement OpenCodeProvider session behavior, CLI MVP, or TUI.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 3.2 `RuntimeRegistry` for runtime status transitions: `healthy` -> `degraded` -> `reconnecting` -> `healthy` or interruption failure.
- Reuse Phase 2.1 `AgentEventEnvelope`, `AgentEvent`, provider metadata escape hatch, and stable `EVENT_STREAM_INTERRUPTED` error code.
- Use OpenCode's documented SSE routes: `/event` for instance events, with `/global/event` reserved as the global route.
- Use Node.js built-in `fetch`, `ReadableStream`, `TextDecoder`, `AbortController`, and timers; do not add new runtime dependencies.
- Treat provider event schema as unstable: map a small conservative set and preserve unknown events as `provider.raw_event`.
- Do not persist full raw events to SQLite in this phase to avoid transcript or secret duplication.

Acceptance criteria for this iteration:

- [x] A healthy OpenCode runtime record can subscribe to `/event` and yield AgentProxy event envelopes.
- [x] Known provider event shapes can be converted into stable AgentProxy payloads without depending on OpenCode internals.
- [x] Unknown provider event shapes are not dropped and become `provider.raw_event`.
- [x] Stream interruption marks the runtime `degraded`, but does not mark sessions failed.
- [x] Finite reconnect/backoff marks the runtime `reconnecting`, reconnects, and returns to `healthy` when the stream resumes.
- [x] Exhausted reconnect attempts throw an `EVENT_STREAM_INTERRUPTED` `AgentProxyError` with sanitized details.
- [x] `pnpm exec vitest run tests/opencode-event-stream.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 3.5 event-stream group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode event payload shape may change; mapping must stay conservative and route unfamiliar data to `provider.raw_event`.
- SSE interruption is a transport/runtime degradation, not a session failure.
- Runtime metadata must be merged under a dedicated key and must not overwrite managed or attached metadata.
- Error details and metadata must avoid raw auth headers, URL credentials, query secrets, and unbounded raw event payloads.
- Do not implement OpenCodeProvider core session/model/message APIs, CLI MVP, TUI, runtime diagnostics, or Gate 3 aggregation in this iteration.

Review notes:

- 2026-05-20: Added `src/runtimes/events.ts`, exported it from `src/runtimes/index.ts`, and added `tests/opencode-event-stream.test.ts`.
- Implemented a runtime-layer `OpenCodeEventStreamClient` for documented `/event` SSE subscription, conservative AgentProxy envelope mapping, unknown event preservation as `provider.raw_event`, runtime `degraded`/`reconnecting`/`healthy` updates, finite reconnect/backoff, optional session-status compensation callback after reconnect, and exhausted reconnect mapping to `EVENT_STREAM_INTERRUPTED` with sanitized details.
- Code review fixes: added runtime generation guard before status writes so an active stream cannot resurrect stopped/detached/replaced records, cancel SSE readers on early consumer return, support current and legacy OpenCode permission event field names with safe decision mapping, and validate retry/timeout numeric options.
- Verification passed: `pnpm exec vitest run tests/opencode-event-stream.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`.
- Remaining risk: Gate 3 still needs runtime diagnostics and a later real OpenCode smoke test to confirm production event payload and session-status compensation semantics; no OpenCodeProvider core behavior, CLI MVP, or TUI work was implemented.

## Current Iteration - 2026-05-20 Phase 3.4

Scope: advance only OpenCode attached runtime lifecycle from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for explicit attached `serverUrl` registration and `/global/health` success.
- [x] Add tests for registry-discovered healthy OpenCode server attachment.
- [x] Add tests for unhealthy or non-OpenCode-looking targets mapping to `RUNTIME_HEALTH_FAILED`.
- [x] Add tests proving non-localhost attached URLs produce a clear warning without leaking credentials.
- [x] Add tests proving attached runtime stop/detach only updates local registry metadata and never kills a process.
- [x] Implement a small OpenCode attached runtime manager around URL parsing, health probing, OpenCode-looking response validation, warning metadata, and registry updates.
- [x] Keep the implementation limited to attached runtime lifecycle; do not implement OpenCodeProvider session behavior, event stream, CLI MVP, or TUI.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 3.2 `RuntimeRegistry` for attached runtime records and detach state updates.
- Reuse Phase 3.3 health path `/global/health` and stable runtime status model.
- Reuse stable error codes: `CONFIG_INVALID` for invalid server URLs and `RUNTIME_HEALTH_FAILED` for unreachable or unhealthy targets.
- Use Node.js built-in `fetch`, `URL`, and HTTP test servers; do not add new runtime dependencies.
- Store warning/source/health validation details in runtime metadata; do not add SQLite columns or migrations.
- Treat explicit `--server-url` semantics as API input named `serverUrl` for this phase; do not implement CLI commands yet.

Acceptance criteria for this iteration:

- [x] An explicit attached server URL can be validated, health-checked through `/global/health`, and persisted as an attached healthy runtime.
- [x] A healthy attached runtime already present in registry can be rediscovered and revalidated without starting `opencode serve`.
- [x] Attachment only succeeds when the target health response is successful and looks like OpenCode health data as far as this phase can verify.
- [x] Non-localhost attached server URLs record and expose a clear warning while still allowing explicit attachment.
- [x] Attached runtime stop/detach transitions the local record to `detached` and does not kill or mutate any external process.
- [x] `pnpm exec vitest run tests/opencode-attached-runtime.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 3.4 attached-runtime group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode health response shape may vary; validation should be conservative but not overly specific, and must not parse TUI/stdout.
- Remote server URLs may contain credentials; warnings and errors must avoid leaking usernames, passwords, or query secrets.
- Remote attached URLs are a local explicit trust boundary in this phase; future non-CLI callers need opt-in or allowlist before accepting untrusted input.
- Do not start or stop external processes in attached mode; all stop behavior is registry-only detach.
- Do not change Phase 3.3 managed runtime behavior except for extracting tiny reusable health helpers if needed.

Review notes:

- 2026-05-20: Added `src/runtimes/attached.ts`, exported it from `src/runtimes/index.ts`, and added `tests/opencode-attached-runtime.test.ts`.
- Code/security review fixes: added active runtimeId reservation, managed-id collision protection, pre-aborted signal handling, OpenCode provider-only detach, and invalid URL parsing without raw `cause` leakage.
- Verification passed: `pnpm exec vitest run tests/opencode-attached-runtime.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`.
- Remaining risk: Gate 3 still needs event stream, runtime diagnostics, and a later real OpenCode smoke test to confirm the exact production health body shape; same-id reservation is currently process-local and would need DB-level coordination for multi-process attach.

## Current Iteration - 2026-05-20 Phase 3.3

Scope: advance only OpenCode managed runtime lifecycle from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for managed `opencode serve` startup with default `127.0.0.1` binding.
- [x] Add a port conflict test proving an occupied configured port is skipped without killing the owner.
- [x] Add tests for `/global/health` wait success, startup exit failure, and health timeout failure.
- [x] Add tests for stopping only AgentProxy-owned managed child processes and refusing attached runtime stop.
- [x] Add a child exit test proving runtime status and exit metadata are updated.
- [x] Implement a small OpenCode managed runtime manager around child process spawn, health polling, stop, and registry updates.
- [x] Keep the implementation limited to managed runtime lifecycle; do not implement attached runtime, OpenCodeProvider session behavior, CLI MVP, or TUI.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse Phase 3.1 `probeOpenCodeBinary()` to resolve and validate the OpenCode binary before starting `serve`.
- Reuse Phase 3.2 `RuntimeRegistry` for all runtime status and metadata updates.
- Reuse existing stable error codes: `RUNTIME_START_FAILED`, `RUNTIME_HEALTH_FAILED`, `PROVIDER_UNAVAILABLE`, and `CAPABILITY_UNSUPPORTED`.
- Use Node.js built-in `child_process`, `net`, and global `fetch`; do not add new runtime dependencies.
- Keep default managed host as `127.0.0.1` and default port as `4096`.
- Treat managed ownership as in-memory child process ownership for this iteration; do not kill attached or historical registry-only PIDs.

Acceptance criteria for this iteration:

- [x] Managed OpenCode runtime starts through `opencode serve --hostname 127.0.0.1 --port <port>` and reaches `healthy` after `/global/health` succeeds.
- [x] If the requested port is already occupied, AgentProxy chooses a free port and does not kill the occupying process.
- [x] If `opencode serve` exits before health succeeds, the runtime is marked `failed` with exit metadata.
- [x] If `/global/health` does not become healthy before timeout, the runtime is marked `failed` and the owned child process is terminated.
- [x] Stopping an owned managed runtime transitions through `stopping` and ends in `stopped`.
- [x] Attached runtimes are not killed or marked stopped by managed stop logic.
- [x] Unexpected child process exit after healthy updates the registry to `failed` with exit code/signal metadata.
- [x] `pnpm exec vitest run tests/opencode-managed-runtime.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 3.3 managed-runtime group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- This iteration must not implement attached runtime selection, explicit `--server-url`, provider core session APIs, passthrough, CLI MVP, or TUI.
- Port selection has an unavoidable small bind race between probing a free port and the child process binding it; failures must still map to startup/health errors cleanly.
- Child process stderr/stdout must not be treated as trusted structured state; do not parse OpenCode logs to infer runtime health.
- Runtime ownership should stay conservative: only the child processes started by the current manager instance can be stopped.

## Current Iteration - 2026-05-20 Phase 3.2

Scope: advance only Runtime Registry metadata from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused tests for managed and attached runtime metadata persistence.
- [x] Add tests for runtime state-machine status storage and runtime list filtering.
- [x] Add tests proving stale cleanup marks stale metadata without killing or stopping attached runtimes.
- [x] Implement a minimal Runtime Registry service over the existing SQLite runtime repository.
- [x] Keep the service limited to metadata create/update/list/cleanup; do not start, health-check, or stop OpenCode.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse existing `RuntimeHandle`, `RuntimeMode`, and `RuntimeStatus` core contracts.
- Reuse the existing SQLite `runtimes` table and repository fields: provider id, mode, status, base URL, hostname, port, PID, workspace path, started/stopped timestamps, and metadata JSON.
- Reuse current TypeScript, Vitest, Biome, tsup, and Node.js `>=22.0.0` tooling.
- Treat stale cleanup as registry metadata cleanup only; do not inspect live processes or kill any PID in this iteration.
- Preserve AgentProxy's thin control-plane role and v1 OpenCode-only scope.

Acceptance criteria for this iteration:

- [x] Managed and attached runtime records can both be persisted and listed with distinct modes.
- [x] Runtime status values from the documented state machine are stored and queryable.
- [x] Runtime records include base URL, hostname, port, PID, workspace, mode, and timestamps when supplied.
- [x] Runtime list supports provider, workspace, status, and mode-oriented filtering needed by the registry.
- [x] Stale cleanup marks stale active metadata as `failed` or `detached` without deleting records and without attempting to kill attached runtimes.
- [x] `pnpm exec vitest run tests/runtime-registry.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks Phase 3.2 done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- Do not implement `opencode serve` startup, attached health check, process ownership verification, runtime stop, OpenCodeProvider core session behavior, CLI MVP, or TUI.
- Cleanup cannot safely decide whether a live PID is still OpenCode yet; this iteration must only mark metadata stale based on timestamps and mode.
- Existing storage already has basic runtime CRUD; avoid rewriting Phase 2.5 storage or expanding migration behavior unless a real gap appears.

## Current Iteration - 2026-05-20 Phase 3.1

Scope: advance only OpenCode binary discovery from the Chinese progress tracker.

Implementation checklist:

- [x] Add focused fake-binary tests for OpenCode version output parsing.
- [x] Locate the configured OpenCode binary, falling back to `PATH` command resolution.
- [x] Execute `opencode --version` without starting any runtime.
- [x] Normalize OpenCode version strings to a stable semver-like value.
- [x] Map missing or non-executable OpenCode binary failures to `PROVIDER_UNAVAILABLE`.
- [x] Detect OpenCode versions below the declared minimum supported version.
- [x] Return executable install or upgrade suggestions for binary probe failures.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Reuse the existing accepted TypeScript, Vitest, Biome, tsup, and Node.js `>=22.0.0` tooling.
- Reuse the existing AgentProxy config field `providers.opencode.binary`; do not expand the config system unless the probe exposes a real gap.
- Reuse stable error code `PROVIDER_UNAVAILABLE` for missing/unusable OpenCode binary and unsupported OpenCode version.
- Use Node.js child process execution for `--version`; do not add a runtime manager, OpenCode SDK, HTTP client, CLI MVP, TUI, or provider session behavior in this iteration.
- Keep AgentProxy as a thin control plane: probe the OpenCode binary boundary only and do not inspect or duplicate OpenCode runtime internals.

Acceptance criteria for this iteration:

- [x] A configured binary path or command can be probed with `--version`.
- [x] The default `opencode` command is resolved through `PATH`.
- [x] Fake binary tests cover plain, prefixed, and `v`-prefixed version output.
- [x] Missing binary maps to `PROVIDER_UNAVAILABLE` with an install suggestion.
- [x] Versions below the declared minimum supported version map to `PROVIDER_UNAVAILABLE` with an upgrade suggestion.
- [x] Version normalization and comparison are covered without relying on a real OpenCode installation.
- [x] `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 3.1 binary-probe group done and records Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- OpenCode `--version` output may vary by release or platform; parsing should accept common semver forms while rejecting ambiguous output.
- The project plan does not pin a minimum supported OpenCode version; this iteration must declare one explicitly without binding AgentProxy to a single patch version.
- Command probing must not leak environment secrets in error details.
- This iteration intentionally does not implement managed/attached runtime lifecycle, provider capabilities from runtime probe, `doctor`, passthrough, CLI MVP, or TUI.

## Current Iteration - 2026-05-20

Scope: advance only the remaining Phase 2.5 SQLite storage backup item from the Chinese progress tracker.

Implementation checklist:

- [x] Refactor SQLite migrations into an explicit migration list with destructive migration metadata.
- [x] Add a file backup before any pending destructive migration is applied.
- [x] Restore the pre-migration SQLite file and fail with `STORAGE_ERROR` when a destructive migration fails.
- [x] Cover destructive migration rollback behavior with a focused storage test.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Use the existing accepted SQLite library: `better-sqlite3`.
- Reuse the current TypeScript, Vitest, Biome, tsup, and Node.js `>=22.0.0` tooling.
- Keep the existing Phase 2.5 schema and repository CRUD behavior intact.
- Keep AgentProxy as a thin control plane: do not implement OpenCode runtime lifecycle, OpenCodeProvider core behavior, CLI MVP, TUI, provider sync workers, or transcript storage.

Acceptance criteria for this iteration:

- [x] Existing fresh database migration and repeated migration tests still pass.
- [x] A pending destructive migration creates a temporary backup before applying destructive SQL.
- [x] If a destructive migration fails, the SQLite database is restored to the pre-migration state.
- [x] Failed destructive migration is reported as `STORAGE_ERROR`.
- [x] `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker marks the Phase 2.5 backup item done and records Review evidence.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- Copying a live SQLite file must account for WAL/SHM/journal sidecar files; the implementation should checkpoint before backup and remove sidecars during restore when they were not part of the backup.
- A destructive migration failure may leave the opened database handle unusable after restore; this is acceptable because the documented behavior is to restore and exit.
- Backup support should stay small and tied to migrations; do not introduce an ORM or a general backup management feature in this iteration.

## Current Iteration - 2026-05-19

Scope: advance only Phase 2.5 SQLite storage first group from the Chinese progress tracker.

Implementation checklist:

- [x] Add `better-sqlite3` and its TypeScript types.
- [x] Implement database opening/initialization in `src/storage`.
- [x] Implement an explicit migration version table.
- [x] Add migration SQL for `providers`, `runtimes`, `sessions`, and `session_events`.
- [x] Add basic repository CRUD for provider, runtime, session, and session event records.
- [x] Cover fresh database migration and repeated migration safety with focused tests.
- [x] Cover `(provider_id, provider_session_id)` uniqueness and tombstone preservation with tests.
- [x] Update the Chinese progress tracker and record verification evidence.
- [x] Run verification and create a detailed Chinese commit.

Dependencies confirmed before implementation:

- Use the already accepted SQLite decision: `better-sqlite3`.
- Use existing TypeScript, Vitest, Biome, tsup, and Node.js `>=22.0.0`.
- Reuse stable domain types from `src/core`, `src/providers`, and `src/sessions`.
- Store JSON metadata as text in `metadata_json` / `payload_json`; do not persist full prompts, full responses, secrets, provider credential files, or large tool output.
- Migration version table fields are not prescribed by the plan; use a minimal explicit table keyed by migration id/version with applied timestamp.
- Do not implement OpenCode runtime lifecycle, OpenCodeProvider core behavior, CLI MVP, TUI, sync workers, or provider transcript storage in this iteration.

Acceptance criteria for this iteration:

- [x] Fresh database migration creates migration metadata plus `providers`, `runtimes`, `sessions`, and `session_events`.
- [x] Re-running migration is safe and does not duplicate migration records.
- [x] Repository CRUD can create, read, update, list, and delete/mark records needed by the local metadata index.
- [x] `(provider_id, provider_session_id)` uniqueness is enforced.
- [x] Tombstone records are preserved by default list/read behavior and can be explicitly filtered when needed.
- [x] Storage errors are mapped to `STORAGE_ERROR`.
- [x] `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build` pass.
- [x] Chinese progress tracker is updated with Phase 2.5 first-group checkmarks and Review notes.
- [x] A detailed Chinese commit is created after verification.

Risks and constraints:

- Native SQLite dependency installation may fail on unsupported local Node/native build environments; verify immediately after adding it.
- Migration backup behavior is required for destructive migrations, but this first migration is non-destructive; implement the hook/contract only if it stays small and does not imply future migrations.
- Keep AgentProxy as a thin control plane: storage indexes provider/runtime/session metadata only and must not duplicate OpenCode runtime state or transcripts.

## Phase Gates

- [x] Gate 0: Product direction is locked: AgentProxy is a thin control plane, not a new Agent runtime.
- [x] Gate 0: v1 scope is locked: CLI/TUI plus OpenCode provider.
- [x] Gate 0: architecture plan exists in `docs/agentproxy-development-plan.md`.
- [x] Gate 1: TypeScript project skeleton is initialized and basic checks pass.
- [x] Gate 2: provider contracts and storage foundations are implemented.
- [ ] Gate 3: OpenCode runtime can be started, attached, diagnosed, and stopped safely.
- [ ] Gate 4: CLI MVP supports real run/resume/session workflows.
- [ ] Gate 5: TUI MVP supports control-plane workflows without duplicating OpenCode TUI.
- [ ] Gate 6: test matrix and release pipeline are stable enough for v1.

## Phase 0: Planning And Requirements

### 0.1 Completed Design Work

- [x] Define AgentProxy as control plane and provider proxy.
- [x] Define v1 provider as OpenCode only.
- [x] Define future provider direction for Claude Code, Codex, and ACP.
- [x] Define non-goals: no custom agent planner, no MCP reimplementation, no model provider layer.
- [x] Define provider capability model.
- [x] Define OpenCode access priority: SDK, OpenAPI/server, CLI fallback, stdout parsing only as last resort.
- [x] Define CLI command matrix.
- [x] Define TUI as control plane and native TUI launcher.
- [x] Define session dual-ID model.
- [x] Define event model.
- [x] Define SQLite schema draft.
- [x] Define runtime state machine.
- [x] Define source-of-truth and tombstone rules.
- [x] Define security model: redaction, workspace trust, env allowlist, export sanitize.
- [x] Define observability model and debug bundle.
- [x] Define compatibility test matrix.
- [x] Define release and rollback strategy.

### 0.2 Pre-Implementation Checkpoint

- [x] Confirm package manager (`pnpm` recommended unless repo chooses otherwise).
- [x] Confirm Node.js minimum version.
- [x] Confirm CLI package name and binary name: `agentproxy`.
- [x] Confirm initial TUI library choice.
- [x] Confirm SQLite library choice.
- [x] Confirm test runner choice.
- [x] Confirm lint/format policy.
- [x] Confirm whether v1 ships as npm package only.

Acceptance criteria:

- [x] Decisions are recorded in `docs/agentproxy-development-plan.md` or a dedicated ADR file.
- [x] `tasks/todo.md` is updated before starting implementation.

## Phase 1: Project Foundation

### 1.1 Repository Skeleton

- [x] Create `package.json`.
- [x] Add TypeScript config.
- [x] Add source directory structure from the architecture plan.
- [x] Add build script.
- [x] Add test script.
- [x] Add lint script.
- [x] Add format script if formatter is selected.
- [x] Add `.gitignore`.
- [x] Add initial README development commands.

Acceptance criteria:

- [x] `agentproxy --help` can be wired through a local dev command or placeholder.
- [x] `pnpm typecheck` or equivalent passes.
- [x] `pnpm test` or equivalent passes.
- [x] `pnpm lint` or equivalent passes.

### 1.2 Core Domain Types

- [x] Implement `AgentProvider` interface.
- [x] Implement `ProviderCapabilities` with `schemaVersion`.
- [x] Implement `ProviderHealth`.
- [x] Implement `RuntimeHandle`.
- [x] Implement session model types.
- [x] Implement event envelope and core event union.
- [x] Implement stable error codes.
- [x] Implement provider-specific metadata escape hatch.

Acceptance criteria:

- [x] Type-level tests or compile checks prove provider contracts are usable.
- [x] Capability defaults treat missing fields as unsupported.
- [x] Unknown provider fields are preserved as metadata.

### 1.3 Config Resolver

- [ ] Implement built-in default config.
- [ ] Load global config from `~/.config/agentproxy/config.json`.
- [ ] Load project config from `.agentproxy/config.json`.
- [ ] Apply env var overrides.
- [ ] Apply CLI flag overrides.
- [ ] Validate config with schema.
- [ ] Expand `~` and normalize workspace paths.
- [ ] Keep OpenCode config separate from AgentProxy config.

Acceptance criteria:

- [ ] Config precedence tests pass.
- [ ] Invalid config produces `CONFIG_INVALID`.
- [ ] Secret values are not printed in config errors.

### 1.4 Logging And Redaction

- [x] Implement structured logger.
- [x] Add `correlationId`.
- [x] Add `runtimeId`, `sessionId`, `providerId`, and operation fields.
- [x] Implement redaction for token, secret, password, API key, authorization, and common variants.
- [x] Ensure `--json` output is not polluted by logs.
- [x] Ensure debug logs are opt-in.

Acceptance criteria:

- [x] Redaction tests cover env vars, config, errors, and command args.
- [x] Human output and JSON output are separated correctly.

### 1.5 SQLite Storage

- [x] Select SQLite package.
- [x] Implement storage initialization.
- [x] Implement migration table.
- [x] Implement providers table.
- [x] Implement runtimes table.
- [x] Implement sessions table with tombstone fields.
- [x] Implement session_events table.
- [x] Add migration backup behavior for destructive changes.
- [x] Add repository functions for CRUD operations.

Acceptance criteria:

- [x] Fresh database migration passes.
- [x] Re-running migration is safe.
- [x] Session uniqueness on provider/session id is enforced.
- [x] Tombstone records are preserved.

## Phase 2: Provider And Runtime Foundations

### 2.1 Provider Registry

- [ ] Implement provider registration.
- [ ] Register OpenCodeProvider.
- [ ] Implement provider lookup by id.
- [ ] Implement provider list.
- [ ] Implement capability probing.
- [ ] Implement limited mode for incompatible capability schema.

Acceptance criteria:

- [ ] Unknown provider returns `PROVIDER_NOT_FOUND`.
- [ ] Capability schema mismatch degrades safely.
- [ ] Provider list can return JSON.

### 2.2 OpenCode Binary Discovery

- [ ] Locate `opencode` binary from config or `PATH`.
- [ ] Run version check.
- [ ] Parse version into normalized form.
- [ ] Detect missing binary.
- [ ] Detect minimum supported version violation.
- [ ] Surface actionable install/upgrade guidance.

Acceptance criteria:

- [ ] Missing OpenCode produces `PROVIDER_UNAVAILABLE`.
- [ ] Version check is covered with fake binary tests.

### 2.3 Runtime Registry

- [ ] Persist managed runtime metadata.
- [ ] Persist attached runtime metadata.
- [ ] Track runtime status from the defined state machine.
- [ ] Store base URL, host, port, PID, workspace, timestamps, and mode.
- [ ] Implement stale runtime cleanup.
- [ ] Implement runtime list query.

Acceptance criteria:

- [ ] Managed and attached runtimes are distinguishable.
- [ ] Attached runtimes are never killed by AgentProxy.
- [ ] Stale metadata does not block new runs.

### 2.4 Managed OpenCode Runtime

- [ ] Start `opencode serve` as child process.
- [ ] Bind to `127.0.0.1` by default.
- [ ] Select fallback port when default port is occupied by non-OpenCode process.
- [ ] Wait for `/global/health`.
- [ ] Capture startup failure.
- [ ] Stop only managed process.
- [ ] Handle process exit and update runtime status.

Acceptance criteria:

- [ ] Managed runtime reaches `healthy`.
- [ ] Startup timeout enters `failed`.
- [ ] Managed shutdown reaches `stopped`.
- [ ] Port collision behavior is tested.

### 2.5 Attached OpenCode Runtime

- [ ] Attach to explicit `--server-url`.
- [ ] Attach to healthy registry runtime.
- [ ] Verify server is OpenCode when possible.
- [ ] Refuse to kill attached runtime.
- [ ] Warn when attaching to non-localhost URL.

Acceptance criteria:

- [ ] Attached runtime can pass health check.
- [ ] Stopping attached runtime only detaches locally.
- [ ] Non-localhost attachment warning is shown.

### 2.6 Event Stream Handling

- [ ] Connect to OpenCode event stream.
- [ ] Map provider events to AgentProxy event envelope.
- [ ] Preserve unknown raw events.
- [ ] Detect stream interruption.
- [ ] Enter `degraded` state on interruption.
- [ ] Reconnect with bounded retry.
- [ ] Use session status API to compensate after reconnect.

Acceptance criteria:

- [ ] Stream disconnect does not immediately mark session failed.
- [ ] Unknown events are not dropped.
- [ ] Reconnect behavior is covered with fake server tests.

## Phase 3: OpenCode Provider Features

### 3.1 Health And Capability

- [ ] Implement `healthCheck`.
- [ ] Implement `getCapabilities`.
- [ ] Probe server API availability.
- [ ] Probe SDK availability.
- [ ] Probe native TUI control support.
- [ ] Probe session/export/share support.
- [ ] Report provider version.

Acceptance criteria:

- [ ] `agentproxy providers inspect opencode --json` returns health and capabilities.
- [ ] Runtime probe overrides static assumptions.

### 3.2 Model And Provider Listing

- [ ] Implement `listModels`.
- [ ] Map OpenCode provider/model data to `ModelRef`.
- [ ] Preserve provider-specific metadata.
- [ ] Handle no-auth or no-model states.

Acceptance criteria:

- [ ] Model listing works when provider is healthy.
- [ ] Missing auth produces actionable diagnostic instead of crash.

### 3.3 Session Listing And Index Sync

- [ ] Implement `listSessions`.
- [ ] Import provider sessions missing from local index.
- [ ] Mark local sessions missing from provider as `missing_in_provider`.
- [ ] Preserve tombstones.
- [ ] Sort by updated time descending.
- [ ] Support workspace filtering.

Acceptance criteria:

- [ ] Local/provider sync follows source-of-truth rules.
- [ ] Tombstoned sessions are not accidentally re-imported.

### 3.4 Session Start And Resume

- [ ] Implement `startSession`.
- [ ] Implement `resumeSession`.
- [ ] Generate `agentproxySessionId`.
- [ ] Persist provider session mapping.
- [ ] Preserve workspace path.
- [ ] Preserve model selection.
- [ ] Support prompt send after session creation.

Acceptance criteria:

- [ ] `run` creates a persisted session mapping.
- [ ] `resume` uses the original provider id.
- [ ] Workspace path is normalized and stable.

### 3.5 Message Sending

- [ ] Implement `sendMessage`.
- [ ] Support prompt from positional argument.
- [ ] Support prompt from stdin.
- [ ] Return async event stream.
- [ ] Map message deltas.
- [ ] Map tool start/finish.
- [ ] Map permission requests.
- [ ] Map file/diff updates when available.
- [ ] Mark session completed or failed.

Acceptance criteria:

- [ ] Headless run can complete with fake server.
- [ ] Permission request surfaces without auto-approval.
- [ ] Session status updates are persisted.

### 3.6 Session Actions

- [ ] Implement abort.
- [ ] Implement delete.
- [ ] Implement export.
- [ ] Implement import.
- [ ] Implement share.
- [ ] Implement unshare.
- [ ] Implement sanitize metadata for export.
- [ ] Add `--raw` confirmation for raw export.

Acceptance criteria:

- [ ] Destructive actions require confirmation unless `--yes`.
- [ ] Export result marks `sanitized`.
- [ ] Delete writes local tombstone.

### 3.7 Provider Passthrough

- [ ] Implement `provider exec`.
- [ ] Pass native args after `--`.
- [ ] Preserve provider exit code.
- [ ] Inject only allowed environment variables.
- [ ] Redact command diagnostics.
- [ ] Support workspace override.

Acceptance criteria:

- [ ] `agentproxy provider exec opencode -- --version` works.
- [ ] Exit code matches provider exit code.
- [ ] Passthrough does not mutate AgentProxy state except logs.

## Phase 4: CLI MVP

### 4.1 CLI Framework

- [ ] Select CLI parser.
- [ ] Implement global flags.
- [ ] Implement help output.
- [ ] Implement command routing.
- [ ] Implement stable exit codes.
- [ ] Implement `--json` output mode.
- [ ] Implement stdout/stderr separation.

Acceptance criteria:

- [ ] Every command has help text.
- [ ] JSON mode emits valid JSON only on stdout.
- [ ] Exit codes match the design table.

### 4.2 Doctor Command

- [ ] Check Node.js version.
- [ ] Check config parse.
- [ ] Check SQLite read/write.
- [ ] Check OpenCode binary.
- [ ] Check OpenCode version.
- [ ] Check server health.
- [ ] Check provider list.
- [ ] Check MCP status if available.
- [ ] Check workspace Git state.
- [ ] Support `--json`.

Acceptance criteria:

- [ ] Missing dependency reports next action.
- [ ] JSON output includes all check statuses.
- [ ] No secret appears in doctor output.

### 4.3 Run And Chat Commands

- [ ] Implement `run [prompt]`.
- [ ] Support stdin prompt.
- [ ] Support `--model`.
- [ ] Support `--workspace`.
- [ ] Support `--provider`.
- [ ] Print session id.
- [ ] Render event stream for humans.
- [ ] Implement `chat` entry point for TUI.

Acceptance criteria:

- [ ] `run` works in managed runtime mode.
- [ ] `run` works in attached runtime mode.
- [ ] `run --json` returns machine-readable result.

### 4.4 Sessions Commands

- [ ] Implement `sessions list`.
- [ ] Implement `sessions show`.
- [ ] Implement `sessions resume`.
- [ ] Implement `sessions abort`.
- [ ] Implement `sessions delete`.
- [ ] Implement `sessions export`.
- [ ] Implement `sessions import`.
- [ ] Implement `sessions share`.
- [ ] Implement `sessions unshare`.
- [ ] Add `--json` where applicable.
- [ ] Add `--yes` for destructive actions.

Acceptance criteria:

- [ ] All session commands handle missing session id.
- [ ] JSON output is stable.
- [ ] Delete/export/share behavior follows provider capability.

### 4.5 Providers And Runtime Commands

- [ ] Implement `providers list`.
- [ ] Implement `providers inspect`.
- [ ] Implement `provider exec`.
- [ ] Implement `runtime list`.
- [ ] Implement `runtime stop`.
- [ ] Implement `config get`.
- [ ] Implement `config set`.

Acceptance criteria:

- [ ] Unsupported capability returns `CAPABILITY_UNSUPPORTED`.
- [ ] Runtime stop respects managed vs attached mode.

## Phase 5: TUI MVP

### 5.1 TUI Foundation

- [ ] Select TUI library.
- [ ] Implement app shell.
- [ ] Implement keyboard handling.
- [ ] Implement routing between pages.
- [ ] Implement loading/error states.
- [ ] Implement limited mode display.
- [ ] Implement color/theme defaults.

Acceptance criteria:

- [ ] `agentproxy chat` opens TUI.
- [ ] `q`, `Esc`, `?`, `/`, `r`, `d`, `n`, and `Enter` behave as specified.
- [ ] UI works in narrow terminal without broken layout.

### 5.2 Dashboard

- [ ] Show current workspace.
- [ ] Show current provider.
- [ ] Show provider health.
- [ ] Show runtime status.
- [ ] Show recent sessions.
- [ ] Add quick actions for run, resume, native TUI, and doctor.

Acceptance criteria:

- [ ] Dashboard can operate when provider is unavailable.
- [ ] Health errors include next steps.

### 5.3 Sessions UI

- [ ] List sessions.
- [ ] Search sessions.
- [ ] Filter by workspace/status/provider.
- [ ] Show session detail.
- [ ] Resume session.
- [ ] Export/share/delete with confirmation.
- [ ] Open native TUI for session.

Acceptance criteria:

- [ ] Dangerous actions require confirmation.
- [ ] Tombstoned/missing sessions are visually distinguishable.

### 5.4 Providers And Runtime UI

- [ ] Show provider capabilities.
- [ ] Show provider version.
- [ ] Show auth/model status.
- [ ] Show runtime mode, URL, PID, status, and workspace.
- [ ] Start/stop managed runtime.
- [ ] Detach attached runtime.

Acceptance criteria:

- [ ] Attached runtime cannot be killed from TUI.
- [ ] Capability unsupported actions are disabled with explanation.

### 5.5 Logs And Settings UI

- [ ] Show redacted recent logs.
- [ ] Show last error detail.
- [ ] Open debug bundle command.
- [ ] Show AgentProxy config summary.
- [ ] Do not edit provider secrets.

Acceptance criteria:

- [ ] Logs are redacted.
- [ ] Settings distinguish AgentProxy config from provider config.

## Phase 6: Security And Trust

### 6.1 Workspace Trust

- [ ] Implement workspace trust store.
- [ ] Record real path and Git root.
- [ ] Gate write/run actions for untrusted workspace.
- [ ] Allow read-only diagnostics in untrusted workspace.
- [ ] Add trust prompts in CLI.
- [ ] Add trust prompts in TUI.

Acceptance criteria:

- [ ] Untrusted workspace cannot run provider commands without confirmation.
- [ ] Symlink path is normalized.

### 6.2 Permission Flow

- [ ] Surface provider permission requests.
- [ ] Never auto-approve by default.
- [ ] Route user response back to provider.
- [ ] Log permission decisions without sensitive payloads.
- [ ] Preserve provider-native permission behavior.

Acceptance criteria:

- [ ] Permission request is visible in CLI.
- [ ] Permission request is visible in TUI.
- [ ] Denial maps to `PERMISSION_DENIED`.

### 6.3 Secret And Env Handling

- [ ] Implement env allowlist.
- [ ] Support explicit extra env configuration.
- [ ] Redact logs for env/config/args/errors.
- [ ] Avoid full env dumps.
- [ ] Avoid provider credential copying.

Acceptance criteria:

- [ ] Tests prove common secret patterns are redacted.
- [ ] Provider credentials are not written to AgentProxy store.

### 6.4 Export And Debug Safety

- [ ] Default export flow recommends sanitize.
- [ ] Require confirmation for raw export.
- [ ] Mark export result as sanitized or raw.
- [ ] Implement debug bundle.
- [ ] Exclude transcript, raw export, credentials, and full env from debug bundle.

Acceptance criteria:

- [ ] Debug bundle can be generated.
- [ ] Debug bundle contains no raw prompt or secret.

## Phase 7: Testing And CI

### 7.1 Unit Tests

- [ ] Config precedence.
- [ ] Config validation.
- [ ] Redaction.
- [ ] Error mapping.
- [ ] Capability defaults.
- [ ] Path normalization.
- [ ] Source-of-truth conflict handling.
- [ ] Tombstone behavior.

Acceptance criteria:

- [ ] Unit tests run in CI.
- [ ] New core logic requires unit tests.

### 7.2 Provider Contract Tests

- [ ] Mock provider satisfies `AgentProvider`.
- [ ] OpenCodeProvider satisfies contract.
- [ ] Unsupported capability behavior is tested.
- [ ] Unknown provider metadata preservation is tested.
- [ ] Capability schema mismatch is tested.

Acceptance criteria:

- [ ] Contract tests pass without real model calls.

### 7.3 Fake OpenCode Integration

- [ ] Implement fake OpenCode server.
- [ ] Implement fake event stream.
- [ ] Implement fake health endpoint.
- [ ] Implement fake sessions endpoints.
- [ ] Implement fake provider/model endpoint.
- [ ] Implement stream interruption scenarios.

Acceptance criteria:

- [ ] Runtime manager integration tests do not require real OpenCode.
- [ ] Event reconnect behavior is covered.

### 7.4 Real OpenCode Smoke Tests

- [ ] Add optional real OpenCode test group.
- [ ] Test `doctor`.
- [ ] Test managed runtime startup.
- [ ] Test attached runtime.
- [ ] Test provider inspect.
- [ ] Test passthrough version command.

Acceptance criteria:

- [ ] Real tests can be skipped locally.
- [ ] Nightly CI can run real provider smoke tests.

### 7.5 E2E Tests

- [ ] Test `agentproxy run`.
- [ ] Test `sessions list --json`.
- [ ] Test `sessions resume`.
- [ ] Test `runtime list`.
- [ ] Test `runtime stop`.
- [ ] Test `provider exec`.
- [ ] Test TUI smoke if tooling allows.

Acceptance criteria:

- [ ] E2E tests cover primary user journeys.
- [ ] CI artifacts include logs on failure.

### 7.6 Compatibility Matrix

- [ ] Test minimum supported Node.js LTS.
- [ ] Test current Node.js LTS.
- [ ] Test macOS.
- [ ] Test Linux.
- [ ] Test minimum supported OpenCode version.
- [ ] Test latest stable OpenCode version.
- [ ] Add nightly capability probe report.

Acceptance criteria:

- [ ] Release cannot proceed without matrix smoke passing or documented exception.

## Phase 8: Documentation And Release

### 8.1 User Documentation

- [ ] Add installation guide.
- [ ] Add quickstart.
- [ ] Add CLI reference.
- [ ] Add TUI reference.
- [ ] Add config reference.
- [ ] Add OpenCode provider guide.
- [ ] Add troubleshooting guide.
- [ ] Add security model guide.

Acceptance criteria:

- [ ] New user can run `doctor` and first `run` from docs.
- [ ] Docs explain AgentProxy is not a replacement for OpenCode.

### 8.2 Developer Documentation

- [ ] Add architecture overview.
- [ ] Add provider contract guide.
- [ ] Add storage/migration guide.
- [ ] Add testing guide.
- [ ] Add release guide.
- [ ] Add ADR index if ADRs are split into files.

Acceptance criteria:

- [ ] A contributor can implement a new provider from docs.

### 8.3 Packaging

- [ ] Configure npm package metadata.
- [ ] Configure binary entry.
- [ ] Configure build output.
- [ ] Include only required files in package.
- [ ] Verify package install locally.
- [ ] Verify `pnpm dlx` or equivalent path if supported.

Acceptance criteria:

- [ ] Installed package exposes `agentproxy`.
- [ ] Package does not include unnecessary local artifacts.

### 8.4 Release Process

- [ ] Define semver policy.
- [ ] Define supported Node.js version.
- [ ] Define supported OpenCode version range.
- [ ] Define SQLite schema version.
- [ ] Define capability schema version.
- [ ] Add changelog.
- [ ] Add release checklist.
- [ ] Add rollback procedure.

Acceptance criteria:

- [ ] A release can be reproduced from documented steps.
- [ ] Failed migration can roll back from backup.

## Phase 9: Deferred Post-v1 Work

- [ ] Evaluate ACP as provider abstraction layer.
- [ ] Design Claude Code provider.
- [ ] Design Codex provider.
- [ ] Design multi-provider session search.
- [ ] Design provider benchmark command.
- [ ] Design policy layer for cross-provider safety controls.
- [ ] Evaluate standalone binary distribution.
- [ ] Evaluate Homebrew distribution.

## Iteration Protocol

- [ ] Before each implementation iteration, select one small group of unchecked tasks.
- [ ] Confirm dependencies and acceptance criteria before editing code.
- [ ] Update this file as each task is completed.
- [ ] Add verification commands and results to Review.
- [ ] If a task exposes a design gap, update the development plan before continuing.
- [ ] If user correction reveals a repeatable rule, update `tasks/lessons.md`.

## Definition Of Done

A task can be checked only when all applicable items are true:

- [ ] Code is implemented.
- [ ] Unit or integration tests cover the behavior.
- [ ] Public CLI/TUI behavior is documented.
- [ ] Errors are mapped to stable AgentProxy error codes.
- [ ] Logs are redacted where relevant.
- [ ] `doctor` or another verification path can prove the behavior works.
- [ ] `pnpm lint`, `pnpm typecheck`, and relevant tests pass.
- [ ] `tasks/todo.md` Review has been updated.

## Review

- 2026-05-19: Completed development plan Draft v2 with provider interface, OpenCode access path, CLI/TUI design, session/schema, errors, security, and release strategy.
- 2026-05-19: Completed development plan Draft v3 with runtime state machine, CLI/TUI contracts, capability schema versioning, source of truth, workspace trust, debug bundle, compatibility matrix, and assumptions list.
- 2026-05-19: Replaced the short TODO list with this phase-gated development tracker for future iterative implementation.
- 2026-05-19: Added `docs/development-progress-tracker.zh.md` as the standalone Chinese phase tracker requested for future iterations.
- 2026-05-19: Updated the Chinese phase tracker with latest completed/pending status, next-step guidance, and a restart prompt for continuing development.
- 2026-05-19: Completed Phase 0.2 decisions and Phase 1 foundation with `pnpm`, Node.js `>=22.0.0`, Commander, Vitest, Biome, tsup, tsx, and `better-sqlite3` selected for later phases. Added ADR `docs/adr/0001-implementation-tooling.md`, initialized the TypeScript project skeleton, and wired a placeholder `agentproxy` CLI. Verification passed with `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, `pnpm exec biome check .`, `pnpm run build`, `pnpm run agentproxy -- --help`, and `pnpm run agentproxy -- --version`. Remaining risk: Phase 2 provider contracts, config, logging, and SQLite are still unimplemented; TUI and SQLite are only selected, not implemented, and the version constant is still mirrored in source and package metadata.
- 2026-05-19: Updated the latest-status summary in the Chinese tracker so the next Codex session can resume from Phase 2 without manual reorientation.
- 2026-05-19: Completed the Phase 2.1 core domain type group. Added stable error code runtime values and `AgentProxyError`, provider metadata preservation helpers, normalized provider capabilities with unsupported defaults, runtime handle types, session index/provider session types, event union/envelope types, and the public `AgentProvider` contract. Added `tests/core-domain-types.test.ts` to prove mock provider contract usage, capability defaults, stable error codes, and metadata preservation. Verification passed with `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Remaining risk: Provider Registry, config, logging, and SQLite storage are still pending, so Gate 2 remains open.
- 2026-05-19: Completed Phase 2.3 configuration resolver first group. Added built-in AgentProxy defaults, global/project/explicit config loading, env and CLI overrides, manual schema validation mapped to `CONFIG_INVALID`, `~` expansion, workspace path normalization, OpenCode passthrough-env boundaries, and focused config resolver tests. Code review found no blocking issues; follow-up fixes added port range validation, explicit config precedence tests, nested OpenCode config rejection tests, and aligned the default database filename with the storage constant. Verification passed with `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Remaining risk: logging/redaction and SQLite storage are still pending, so Gate 2 remains open.
- 2026-05-19: Completed Phase 2.4 logging and redaction first group. Added structured NDJSON logging, per-operation `correlationId`, provider/runtime/session/operation fields, stdout/stderr output helpers, default redaction for logger data/message, errors, command args, diagnostics, Commander parse errors, JSON-style inline secrets, env-var style inline secrets, and space-separated CLI secret flags. Code review found blocking leakage paths in logger messages, diagnostic stderr, inline env strings, and Commander parse errors; all were fixed with regression tests. Verification passed with `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Remaining risk: SQLite storage is still pending, so Gate 2 remains open; no OpenCode runtime lifecycle was implemented.
- 2026-05-19: Completed Phase 2.5 SQLite storage first group. Added `better-sqlite3`, `@types/better-sqlite3`, `pnpm-workspace.yaml` native build approval, SQLite opening/initialization, explicit migration tracking, providers/runtimes/sessions/session_events schema, repository CRUD, JSON metadata/payload persistence, `STORAGE_ERROR` mapping, and focused storage tests. Code review found that normal session upsert could clear an existing tombstone; this was fixed with SQL preservation logic and a regression test. Verification passed with `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Remaining risk: destructive migration backup behavior is still pending; no OpenCode runtime lifecycle, OpenCodeProvider core behavior, CLI MVP, or TUI work was implemented.
- 2026-05-20: Completed the Phase 2.5 destructive migration backup item. Added explicit SQLite migration descriptors in `src/storage/migrations.ts`, destructive migration temporary file backups for the main database plus WAL/SHM/journal sidecars, backup restore on migration failure, temporary backup cleanup after successful migration or restore, and `STORAGE_ERROR` failure mapping. Added focused storage tests that prove successful destructive migration cleanup, two-step failed destructive migration rollback, missing migration records, and preservation of pre-migration provider data. Verification passed with `pnpm exec vitest run tests/storage-sqlite.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Gate 2 is complete; no OpenCode runtime lifecycle, OpenCodeProvider core behavior, CLI MVP, or TUI work was implemented.
- 2026-05-20: Completed Phase 3.1 OpenCode Binary 探测. Added `src/providers/opencode/binary.ts` and `src/providers/opencode/constants.ts` to probe a configured binary or PATH-resolved `opencode`, execute `--version`, normalize version strings, compare against minimum supported version `1.0.0`, and map missing/non-executable/failing/unparseable/too-old results to `PROVIDER_UNAVAILABLE` with install or upgrade suggestions. Added `tests/opencode-binary.test.ts` covering default PATH lookup, explicit absolute path, explicit command name, explicit relative path from `cwd`, normal/v-prefixed/pre-release version output, missing binary, non-executable binary, non-zero exit, unparsable output, and low-version rejection. Code review caught a real bug where `./opencode` could be normalized into a bare command and hijacked by PATH; fixed by resolving relative binaries against `cwd` and by sharing an effective env between PATH lookup and execution, including `PATH`/`Path` compatibility. Verification passed with `pnpm exec vitest run tests/opencode-binary.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Next step is Phase 3.2 Runtime Registry; no runtime manager, OpenCodeProvider core behavior, CLI MVP, or TUI work was added.
- 2026-05-20: Completed Phase 3.2 Runtime Registry. Added `src/runtimes/registry.ts` and `src/runtimes/index.ts` with a storage-backed `RuntimeRegistry` for managed/attached runtime metadata, state-machine status records, runtime list filtering, and timestamp-based metadata-only stale cleanup. Added `tests/runtime-registry.test.ts` covering managed vs attached distinction, base URL/host/port/PID/workspace/mode/timestamps, status updates that preserve registration metadata, provider/workspace/status/mode list queries, stale cleanup that marks managed active metadata `failed` and attached active metadata `detached` without deleting records or killing processes, clearing old `stoppedAt` when a runtime becomes active again, and rejecting invalid stale TTL values as `CONFIG_INVALID`. Verification passed with `pnpm exec vitest run tests/runtime-registry.test.ts`, `pnpm run typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run format:check`, and `pnpm run build`. Gate 3 remains open; no `opencode serve` startup, attached health check, runtime stop, OpenCodeProvider core behavior, CLI MVP, or TUI work was implemented.
