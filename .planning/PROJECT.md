# Copilot MCP Server

## What This Is

An MCP server that wraps the GitHub Copilot CLI (`gh copilot`), allowing coding agents like Claude Code to query GitHub Copilot and get a second perspective. Agents send requests via MCP, the server spawns `gh copilot` subcommands as child processes, and returns the output. It replaces the existing Codex CLI integration entirely.

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

### Active

- [ ] Replace Codex CLI invocations with `gh copilot` subcommands
- [ ] Expose `gh copilot suggest` as MCP tool
- [ ] Expose `gh copilot explain` as MCP tool
- [ ] Expose `gh copilot ask` as MCP tool
- [ ] Remove session management layer entirely (Copilot CLI is stateless)
- [ ] Update auth prerequisites documentation (gh CLI + `gh auth login` instead of `codex login`)
- [ ] Update tool definitions, schemas, and names to match Copilot tools
- [ ] Rename project artifacts (package name, server class, README) from Codex to Copilot
- [ ] Verify all existing tests pass against new implementation

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
| Replace Codex entirely (not alongside) | Cleaner codebase, avoids dual-maintenance | — Pending |
| Drop session management | Copilot CLI is stateless; complexity not justified | — Pending |
| Reuse command execution utility | `executeCommand` / `executeCommandStreaming` are CLI-agnostic | — Pending |

---
*Last updated: 2026-02-20 after initialization*
