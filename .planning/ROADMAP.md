# Roadmap: Copilot MCP Server

## Overview

This roadmap covers the migration of an existing Codex-backed MCP server to the standalone GitHub Copilot CLI (`copilot` binary). The work is a targeted rewrite of the tool handler and schema layers — the four-layer architecture stays intact, the session layer is deleted, and the three new semantic tools (`ask`, `suggest`, `explain`) are implemented against the `copilot -p` invocation pattern. Three phases ordered by risk surface: core CLI integration first (all critical pitfalls), then error hardening, then branding and documentation cleanup.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core CLI Integration** - Delete session layer, rewrite handlers and schemas for `copilot -p` invocation, establish working `ask`/`suggest`/`explain`/`ping` tools with tests
- [ ] **Phase 2: Error Handling and Resilience** - Harden all failure modes (ENOENT, quota, auth, timeout), strip ANSI, protect auth tokens, write error-scenario tests
- [ ] **Phase 3: Branding and Documentation** - Update package name, server class, README prerequisites and branding from Codex to Copilot

## Phase Details

### Phase 1: Core CLI Integration
**Goal**: The four new MCP tools (`ask`, `suggest`, `explain`, `ping`) work correctly against the standalone `copilot` binary with all required flags, reading from stdout, with passing handler and integration tests
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, CLI-01, CLI-02, CLI-03, CLI-04, CLEAN-01, CLEAN-02, SEC-02, TEST-01, TEST-02, TEST-04
**Success Criteria** (what must be TRUE):
  1. Calling the `ask` tool with a prompt returns a Copilot response read from stdout (not stderr)
  2. Calling the `suggest` tool with an optional `target` param (`shell`, `git`, `gh`) returns a command suggestion scoped to that target
  3. Calling the `explain` tool with a shell command string returns a plain-language explanation of that command
  4. Calling the `ping` tool returns a live confirmation the MCP server is running
  5. All three AI tools accept `model` and `addDir` parameters; the `copilot` binary is invoked with `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`, `--no-auto-update` hardcoded in every call; session layer and legacy tools (`review`, `listSessions`, `help`) are gone; handler and integration tests pass
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Delete session layer, rewrite types.ts (TOOLS enum, Zod schemas, model constants), add strictExitCode to command.ts
- [ ] 01-02-PLAN.md — Rewrite handlers.ts (4 stateless handlers), rewrite definitions.ts (4 tool defs), rename server.ts + index.ts to CopilotMcpServer
- [ ] 01-03-PLAN.md — Rewrite index.test.ts, mcp-stdio.test.ts (copilot stub + flag verification), error-scenarios, edge-cases, model-selection, default-model tests

### Phase 2: Error Handling and Resilience
**Goal**: All failure modes surface actionable error messages to the MCP caller; auth tokens are never leaked in logs or error output; ANSI codes are stripped from responses; executions cannot hang indefinitely; `COPILOT_BINARY_PATH` is respected
**Depends on**: Phase 1
**Requirements**: CLI-05, CLI-06, SEC-01, SEC-03, ERR-01, ERR-02, ERR-03, ERR-04, TEST-03
**Success Criteria** (what must be TRUE):
  1. When the `copilot` binary is not installed, the caller receives a clear "copilot CLI not installed" message with install instructions (not a raw ENOENT stack trace)
  2. When Copilot exits with a quota or auth error, the caller receives the specific error message (not silent success or an empty response)
  3. Auth tokens (`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`) never appear in error messages or server logs
  4. Tool calls time out after 60 seconds and return a timeout error rather than hanging indefinitely
  5. Stdout is stripped of ANSI escape codes before being returned to the caller, and `COPILOT_BINARY_PATH` env var overrides the default binary path
**Plans**: TBD

Plans:
- [ ] 02-01: Tighten exit code logic to exit-code-0-only success; implement ENOENT, quota, and auth error detection with user-facing messages; add `COPILOT_BINARY_PATH` support
- [ ] 02-02: Add ANSI stripping, 60-second timeout, and auth token redaction; write error-scenario tests for ENOENT, quota, and auth failure

### Phase 3: Branding and Documentation
**Goal**: All project artifacts (package name, server class, README) reflect Copilot branding and accurate prerequisites; users can follow the README to install and authenticate without referencing Codex docs
**Depends on**: Phase 2
**Requirements**: CLEAN-03, CLEAN-04
**Success Criteria** (what must be TRUE):
  1. `package.json` name, server class name (`CopilotMcpServer`), and `README.md` header carry Copilot branding — no remaining Codex references in user-facing artifacts
  2. The README describes `copilot` binary installation, GitHub token auth setup, model selection, and the `--allow-all-tools` security note — replacing all Codex-specific instructions
**Plans**: TBD

Plans:
- [ ] 03-01: Update `package.json` package name and server class name in `src/server.ts` and `src/index.ts`; update `README.md` with Copilot prerequisites, auth setup, model parameter docs, and known limitations

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core CLI Integration | 0/3 | Not started | - |
| 2. Error Handling and Resilience | 0/2 | Not started | - |
| 3. Branding and Documentation | 0/1 | Not started | - |
