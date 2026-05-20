# AgentProxy Development Tracker

- Source plan: `docs/agentproxy-development-plan.md`
- Current plan version: Draft v3
- Primary goal: v1 uses OpenCode as the first full runtime provider
- Working rule: do not mark an item done until implementation, tests, docs, and verification evidence are complete

## Status Legend

- `[ ]` Not started
- `[x]` Done and verified
- Use the Review section to record date, scope, verification command, and unresolved risks after each iteration.

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
