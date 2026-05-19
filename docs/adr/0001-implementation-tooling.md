# ADR-0001: Implementation Tooling Baseline

- Status: Accepted
- Date: 2026-05-19
- Scope: Phase 0.2 pre-implementation decisions and Phase 1 project foundation

## Context

AgentProxy v1 is a thin control plane for Coding Agent runtimes. It must use OpenCode as the only v1 provider and must not reimplement planner, MCP, tool execution, file editing, permission handling, or the OpenCode chat runtime.

Phase 1 only needs a sustainable TypeScript project skeleton and placeholder CLI behavior. Provider contracts, OpenCode lifecycle management, SQLite persistence, and TUI screens remain later-phase work.

## Decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Package manager | `pnpm` | Fast, deterministic installs and already available locally. |
| Node.js minimum | Node.js `>=22.0.0` | Node 22 is an active LTS line and satisfies the selected future TUI and SQLite dependency baselines. |
| npm package name | `agentproxy` | Matches the product and currently resolves as available in npm registry checks. |
| CLI binary | `agentproxy` | Required by the product plan and progress tracker. |
| CLI framework | Commander | Small, stable, ESM-friendly parser with nested command support. |
| TUI stack | Ink + React | Keeps the TUI in TypeScript and supports a control-plane terminal UI without replacing OpenCode TUI. Implementation is deferred until Phase 6. |
| SQLite library | `better-sqlite3` | Mature local SQLite binding with synchronous transactions suitable for local metadata. Implementation is deferred until storage work starts. |
| Test framework | Vitest | Fast TypeScript-friendly tests for CLI and later provider contract tests. |
| Build tooling | `tsup` + `tsx` | `tsx` supports local CLI development; `tsup` packages the CLI entry for npm. |
| Lint and format | Biome | Single fast tool for formatting and linting TypeScript/JSON with minimal config. |
| v1 distribution | npm package only | Keeps v1 release scope narrow; standalone binary, Homebrew, and other channels remain post-v1 candidates. |

## Consequences

- `package.json` must declare `engines.node` as `>=22.0.0`.
- The first binary target is `agentproxy`, but Phase 1 command handlers are placeholders only.
- TUI and SQLite decisions are recorded now, but those dependencies do not need runtime code before their phases.
- Compatibility testing must include the minimum Node.js LTS line before v1 release.

## Explicit Non-Goals For Phase 1

- Do not start or connect to OpenCode runtime.
- Do not implement provider contracts or capability probing.
- Do not create SQLite schema or migrations.
- Do not build TUI pages.
- Do not persist transcripts or secrets.
