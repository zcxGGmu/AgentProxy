# AgentProxy Development Tracker

- Source plan: `docs/agentproxy-development-plan.md`
- Current plan version: Draft v3
- Primary goal: v1 uses OpenCode as the first full runtime provider
- Working rule: do not mark an item done until implementation, tests, docs, and verification evidence are complete

## Status Legend

- `[ ]` Not started
- `[x]` Done and verified
- Use the Review section to record date, scope, verification command, and unresolved risks after each iteration.

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
- [ ] Gate 2: provider contracts and storage foundations are implemented.
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

- [ ] Select SQLite package.
- [ ] Implement storage initialization.
- [ ] Implement migration table.
- [ ] Implement providers table.
- [ ] Implement runtimes table.
- [ ] Implement sessions table with tombstone fields.
- [ ] Implement session_events table.
- [ ] Add migration backup behavior for destructive changes.
- [ ] Add repository functions for CRUD operations.

Acceptance criteria:

- [ ] Fresh database migration passes.
- [ ] Re-running migration is safe.
- [ ] Session uniqueness on provider/session id is enforced.
- [ ] Tombstone records are preserved.

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
