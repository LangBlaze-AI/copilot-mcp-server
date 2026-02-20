# Copilot MCP Server

## What This Is

An MCP server that wraps the standalone GitHub Copilot CLI (`copilot` binary, not `gh copilot`), allowing coding agents like Claude Code to query GitHub Copilot and get a second perspective. Agents send requests via MCP, the server spawns the `copilot -p` command as a child process with hardcoded safety flags, and returns the stdout response. It replaces the Codex CLI integration entirely with four stateless tools: `ask`, `suggest`, `explain`, `ping`.

## Core Value

Coding agents can invoke GitHub Copilot's `suggest`, `explain`, and `ask` capabilities over MCP with zero friction — Copilot as a tool, not a UI.

## Requirements

### Validated

- ✓ MCP server with stdio transport — existing
- ✓ TypeScript + Node.js runtime — existing
- ✓ Tool handler pattern (each capability = separate handler) — existing
- ✓ Child process execution via `child_process.spawn()` — existing
- ✓ Zod schema validation for tool arguments — existing
- ✓ Custom error types (validation, execution, command) — existing
- ✓ Tool definitions exposed via ListToolsRequest — existing
- ✓ Build pipeline (tsc → dist/), dev mode (tsx), test suite (Jest) — existing

### Validated (Phase 1)

- ✓ Replace Codex CLI invocations with `copilot -p` — Phase 1
- ✓ Expose `ask`, `suggest`, `explain`, `ping` as MCP tools — Phase 1
- ✓ Remove session management layer entirely — Phase 1
- ✓ Update tool definitions, schemas, and names to match Copilot tools — Phase 1
- ✓ 42 tests pass with copilot stub integration tests — Phase 1

### Active

- [ ] Update auth prerequisites documentation (copilot binary install + GitHub token auth)
- [ ] Rename project artifacts (package name, README) from Codex to Copilot branding (Phase 3)
- [ ] Harden failure modes: ENOENT, quota, auth, timeout (Phase 2)
- [ ] Strip ANSI escape codes from stdout (Phase 2)
- [ ] Protect auth tokens from leaking in logs/errors (Phase 2)

### Out of Scope

- Session/conversation continuity — Copilot CLI is stateless; dropped intentionally
- Keeping Codex tools alongside Copilot — full replacement only
- PR review via GitHub web API — using CLI only, not GitHub REST/GraphQL
- OAuth flow in-server — users handle auth via `gh auth login` themselves

## Context

The existing codebase is a well-structured MCP server for Codex with clear layer separation:
- Transport → Request Handler → Tool Handlers → Command Execution
- The swap is primarily in `src/tools/handlers.ts` (tool logic), `src/tools/definitions.ts` (schemas), `src/types.ts` (tool names/schemas), and `src/utils/command.ts` (CLI invocation)
- Session storage (`src/session/`) gets deleted entirely
- The command execution utility (`executeCommand`, `executeCommandStreaming`) is reusable as-is

**Auth model:** Users must have `gh` CLI installed with the Copilot extension and be authenticated via `gh auth login`. Same pattern as Codex requiring `codex login`.

**Output format:** `gh copilot suggest` outputs to stderr (interactive mode) but can be run non-interactively with flags. Need to verify exact flags for non-interactive mode during implementation.

## Constraints

- **Tech Stack**: TypeScript + Node.js — preserve existing build/test toolchain
- **Transport**: stdio MCP only — no HTTP transport needed
- **Dependencies**: Minimize new npm packages; `gh` CLI is a runtime prerequisite, not a package dep
- **Compatibility**: Must work as a drop-in replacement in existing `.mcp.json` configs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Replace Codex entirely (not alongside) | Cleaner codebase, avoids dual-maintenance | ✓ Done — Phase 1 |
| Drop session management | Copilot CLI is stateless; complexity not justified | ✓ Done — Phase 1 |
| Reuse command execution utility | `executeCommand` / `executeCommandStreaming` are CLI-agnostic | ✓ Done — Phase 1 |
| Use `copilot` binary (not `gh copilot`) | `gh copilot` deprecated Oct 2025; standalone binary is the supported path | ✓ Done — Phase 1 |
| No model enum validation | CLI validates its own models with clear errors; handler validation is maintenance burden | ✓ Done — Phase 1 |
| strictExitCode: true for copilot calls | Non-zero exit from copilot = real error; Codex lenient behavior was a workaround for codex stderr output | ✓ Done — Phase 1 |
| stdout primary response (not stderr) | copilot writes responses to stdout (opposite of codex which used stderr) | ✓ Done — Phase 1 |

---
*Last updated: 2026-02-20 after Phase 1*
