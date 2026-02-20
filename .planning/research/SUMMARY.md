# Project Research Summary

**Project:** copilot-mcp-server
**Domain:** MCP Server — GitHub Copilot CLI (`copilot` binary) integration (migration from Codex)
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

This project is a migration of an existing Codex-backed MCP server to the new standalone GitHub Copilot CLI (`copilot` binary, v0.0.412). The migration is forced: the `gh copilot` extension it previously referenced was deprecated on 2025-09-25 and as of v1.2.0 every invocation outputs a deprecation notice and exits with code 0 — returning useless output to any caller. The replacement binary (`@github/copilot` npm package, installed globally as `copilot`) uses a completely different interface: a single `-p / --prompt` flag for non-interactive execution instead of subcommands. This fundamentally changes how the MCP server invokes Copilot, how it reads output, and how it handles errors.

The recommended approach is a targeted rewrite of the tool handler and schema layers while keeping the existing four-layer architecture (MCP transport, tool handlers, command execution utility, external CLI) intact. The command execution utility (`src/utils/command.ts`) and error class hierarchy (`src/errors.ts`) are reusable as-is. The session management layer (`src/session/`) is deleted entirely — the new CLI is stateless per invocation, so session storage has no role. The three new semantic tools (`suggest`, `explain`, `ask`) are implemented as thin prompt-construction wrappers over a single `copilot -p <prompt>` invocation pattern. The `ping` tool requires no changes.

The primary risks are concentrated in the CLI integration layer and must all be resolved in Phase 1: output channel inversion (Codex wrote to stderr; Copilot writes to stdout), lenient exit code logic that silently swallows quota and auth failures, model name incompatibility between Codex and Copilot model enums, and the requirement to always pass four flags (`--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`) to prevent subprocess hangs, output contamination, and permission-refusal responses. None of these risks require architectural changes — they are all addressed by updating argument lists, output-reading logic, and type constants.

## Key Findings

### Recommended Stack

The entire existing Node.js/TypeScript stack is retained. No new npm packages are required for the MCP server itself. The only change is the external binary being wrapped: from `codex` (retired) to `copilot` (the GitHub Copilot CLI, installed globally by users as a prerequisite). The binary is invoked via the existing `executeCommand('copilot', args)` pattern — changing only the first argument and the argument list.

**Core technologies:**
- `copilot` binary (`@github/copilot` npm, v0.0.412) — the CLI backend being wrapped; installed globally by users, not a package dependency
- `child_process.spawn()` via `src/utils/command.ts` — unchanged subprocess execution layer
- `zod` (v4.0.17, existing) — MCP tool argument validation; schemas need updating for new tool names and model enum
- Node.js 22+ — required by `@github/copilot`; already the project runtime

**Critical version note:** Default model must be set to `gpt-4.1` (confirmed working non-interactively). Claude and Gemini models may require prior interactive activation by the user. The old default `gpt-5.3-codex` does not exist in the Copilot CLI model enum and causes immediate exit 1.

### Expected Features

The new Copilot CLI collapses the old `suggest` / `explain` subcommands into a single `-p` interface. All three MCP tools share one CLI invocation pattern; the only difference is how the prompt string is constructed before being passed to `-p`.

**Must have (table stakes):**
- `ask` tool — general prompt passthrough; the primary new capability; requires `copilot -p <prompt> --allow-all-tools --no-ask-user --silent --no-color`
- `suggest` tool — command suggestion semantics via prompt framing; optional `target` enum (`shell`, `git`, `gh`)
- `explain` tool — command explanation semantics via prompt framing; wraps `command` arg in "Explain what this command does: ..."
- `ping` tool — unchanged health check; no CLI dependency
- Model selection parameter on all three CLI tools — users expect model choice; default `gpt-4.1`
- Hardcoded flags (`--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`) — not optional; required for subprocess to work at all

**Should have (competitive):**
- `workingDirectory` parameter on `ask` — scopes file access for agents working across directories
- `--no-auto-update` in base args — prevents ~1-2s latency per call from update checks
- Clear error messages for quota exhaustion and binary-not-found (ENOENT)

**Defer (v2+):**
- Session resume via `--resume` — technically possible but adds file I/O state complexity; PROJECT.md explicitly excludes from v1
- ACP (Agent Client Protocol) integration — entirely different transport architecture; only warranted if spawn-and-capture proves insufficient
- GitHub MCP toolset exposure via `--add-github-mcp-toolset` — significant security model change

### Architecture Approach

The four-layer pipeline (MCP transport → tool handlers → command utility → external CLI) is preserved. The migration is a targeted replacement of the middle two layers: tool handlers and type schemas. The session directory is deleted. The command utility and error classes are kept as-is. All three new semantic tools (suggest, explain, ask) follow the same pattern: Zod schema parse → prompt string construction → `executeCommand('copilot', baseArgs)` → read `result.stdout` as response.

**Major components:**
1. `src/server.ts` — MCP transport and request routing; rename class only, no logic change
2. `src/types.ts` — TOOLS enum, Zod schemas, model constants; full replacement of Codex-specific entries
3. `src/tools/handlers.ts` — business logic; delete 4 old handlers, add 3 new (SuggestToolHandler, ExplainToolHandler, AskToolHandler), keep PingToolHandler
4. `src/tools/definitions.ts` — tool metadata sent to MCP clients; full rewrite with 4 tools
5. `src/utils/command.ts` — unchanged subprocess execution
6. `src/session/` — deleted entirely

**The critical architectural change is output channel inversion.** Every handler that reads `result.stderr` as the primary response (the Codex pattern) must be updated to read `result.stdout`. Non-empty `result.stderr` with empty `result.stdout` is an error condition, not a partial success.

### Critical Pitfalls

1. **Targeting `gh copilot` instead of standalone `copilot`** — the extension exits 0 with a deprecation notice regardless of input; the MCP server silently returns the notice as if it were an AI response. Always invoke the standalone `copilot` binary with `-p`.

2. **Output channel inversion** — Copilot writes AI response to stdout; Codex wrote to stderr. Any handler using `result.stderr` as primary response returns empty strings or stats. Global grep for `result.stderr` in handlers and swap to `result.stdout`.

3. **Lenient exit code logic swallowing errors** — the existing `code === 0 || stdout || stderr` success heuristic in `command.ts` resolves quota failures (exit 1 + "402" in stderr) and auth failures as successes. Tighten to exit code 0 only for Copilot invocations.

4. **Missing mandatory flags causing subprocess hangs or empty responses** — omitting `--allow-all-tools` causes the agent to produce permission-refusal text on any agentic task; omitting `--no-ask-user` causes blocking on clarifying questions; omitting `--silent` contaminates stdout with stats; omitting `--no-color` injects ANSI codes into MCP text. All four must be hardcoded in every handler.

5. **Model name mismatch** — passing `gpt-5.3-codex` (old default) to the Copilot CLI causes immediate exit 1 with a validation error. Update default to `gpt-4.1` and update the model constant/Zod enum to the Copilot CLI allowlist.

## Implications for Roadmap

Based on combined research, the migration is naturally structured into three phases ordered by risk surface:

### Phase 1: Core CLI Integration

**Rationale:** All critical pitfalls and binary/output/exit-code differences must be resolved before any tool-level work can be validated. This phase establishes the foundation every subsequent handler depends on. Every pitfall in the research (1–9 of 10) is addressable here.

**Delivers:** A working `copilot -p` invocation that correctly returns stdout, correctly surfaces errors, and passes all required flags. Functional `suggest`, `explain`, `ask`, and `ping` tools with updated schemas and prompt construction.

**Addresses:**
- Delete session layer (`src/session/`, 3 test files)
- Replace `TOOLS` enum and Zod schemas in `types.ts`
- Rewrite handlers with stdout-primary output reading and correct base args
- Rewrite tool definitions with 4 new tools
- Update `executeCommand` exit code handling for Copilot semantics
- Update default model to `gpt-4.1` and model constant to Copilot allowlist
- Add `--no-auto-update` to base args
- Rename class `CodexMcpServer` → `CopilotMcpServer` in server.ts and index.ts

**Avoids:** All critical pitfalls (deprecated extension, stdout/stderr inversion, lenient exit code, missing flags, model mismatch)

**Research flag:** None needed — all patterns are well-documented and verified via live testing.

### Phase 2: Error Handling and Edge Cases

**Rationale:** Once the happy path works, failure modes need hardening. The Copilot CLI has specific error signatures (quota exhaustion, auth fallthrough, binary not found, TTY config contamination) that require targeted handling to produce actionable user feedback.

**Delivers:** User-friendly error messages for all failure modes; test coverage for error scenarios; ANSI stripping safeguard.

**Addresses:**
- ENOENT handling with install instructions
- Quota (402) and auth (401/403) pattern detection in stderr
- ANSI escape sequence stripping from stdout as a safety net
- Rewrite error-scenario tests for Copilot-specific error patterns
- Document auth precedence in README

**Avoids:** UX pitfalls (raw ENOENT, silent quota failures, deprecation notice as response)

**Research flag:** None needed — error patterns are verified from live testing.

### Phase 3: Test Suite Refresh and Documentation

**Rationale:** After implementation is complete, the test suite (6 files to rewrite, 3 to delete) and README need to reflect the new binary, tool names, and behavioral differences. Doing this last avoids repeated rewrites as handlers evolve.

**Delivers:** Green test suite for all new tools; updated README with Copilot CLI prerequisites, auth setup, model selection docs, and security notes for `--allow-all-tools`.

**Addresses:**
- Rewrite `index.test.ts`, `mcp-stdio.test.ts`, `model-selection.test.ts`, `default-model.test.ts`, `edge-cases.test.ts`
- Delete `session.test.ts`, `resume-functionality.test.ts`, `context-building.test.ts`
- Update `package.json`, `.mcp.json`, `README.md`

**Avoids:** Regression from stale tests; user confusion from outdated docs

**Research flag:** None needed — standard test/docs work with no domain-specific unknowns.

### Phase Ordering Rationale

- Phase 1 must come first because all handler logic depends on correct CLI invocation, output parsing, and type definitions. No tool can be meaningfully tested until the base invocation pattern is correct.
- Phase 2 follows because error handling can only be written against known-working happy path code. The Copilot error patterns (402, ENOENT, auth fallthrough) are specific enough that they benefit from having the implementation stable first.
- Phase 3 is last by convention: tests and docs reflect what exists, so writing them against finished implementation reduces churn.
- The session layer deletion is the first step of Phase 1 because it has no dependents and removing it immediately clarifies the scope of subsequent changes.

### Research Flags

Phases with well-documented patterns (no additional research needed):
- **Phase 1:** All CLI flags, output channels, and invocation patterns verified via live testing with copilot v0.0.412. Build order is explicit and dependency-ordered.
- **Phase 2:** Error signatures verified via live testing (quota error text, auth fallthrough behavior, ENOENT behavior).
- **Phase 3:** Standard test/docs work; no domain-specific unknowns.

No phases require `/gsd:research-phase` — all implementation details are resolved to a sufficient level of confidence.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core flags (`-p`, `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`) verified via live CLI testing; deprecation of `gh copilot` confirmed via live test; output channel routing confirmed via shell redirect testing |
| Features | HIGH | Tool mapping (suggest/explain/ask) verified live; model list verified against copilot v0.0.412 allowlist; session resume confirmed working but explicitly out of scope for v1 |
| Architecture | HIGH | Four-layer pipeline preservation confirmed against existing codebase; build order is dependency-analyzed; pattern choices (stateless handlers, prompt construction) are direct responses to CLI interface constraints |
| Pitfalls | HIGH | All 10 pitfalls verified via live testing or direct codebase analysis; recovery strategies are low-cost (most are single-line or single-file fixes) |

**Overall confidence:** HIGH

### Gaps to Address

- **Auth token validation is unreliable:** When `COPILOT_GITHUB_TOKEN` is set to an invalid value, the CLI silently falls through to stored keyring credentials and returns exit 0 with a valid response from the wrong account. There is no auth-validation-only mode. Mitigation: document auth precedence clearly; rely on first API call to surface real auth errors. This is a CLI limitation, not a gap in research.

- **Claude/Gemini model interactive activation requirement:** Some Copilot accounts require running the CLI interactively once per model before that model works in non-interactive (`-p`) mode. The exact scope of which accounts/models require this is not fully documented. Mitigation: default to `gpt-4.1` (confirmed working in all tested conditions); document activation requirement for Anthropic and Gemini models.

- **Batch mode output truncation:** When the Copilot agent executes tools internally (e.g., runs `ls`), those tool outputs may appear truncated in the final response (`↪ 10 lines...`). This is a known CLI limitation in `-p` mode. No server-side mitigation exists; document as a known limitation.

## Sources

### Primary (HIGH confidence — live tested)

- `copilot` v0.0.412 live CLI testing — flags reference, output channel routing, session resume, model validation, quota error behavior (2026-02-20)
- `gh copilot` v1.2.0 live CLI testing — deprecation notice confirmed, exit code 0, no functional output (2026-02-20)
- https://docs.github.com/en/copilot/reference/cli-command-reference — complete flags reference (`-p`, `--silent`, `--allow-all-tools`, `--no-ask-user`, `--no-color`, `--acp`)
- https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli — installation, Node.js 22+ requirement
- https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started — auth flow, `/login`
- https://github.com/github/copilot-cli/blob/main/changelog.md — version history; `--allow-all`/`--yolo` added v0.0.381

### Secondary (HIGH confidence — official docs + community verification)

- https://deepwiki.com/github/copilot-cli/4.1-authentication-methods — auth precedence: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > `gh` CLI > OAuth
- https://deepwiki.com/github/copilot-cli/5.5-command-line-flags-reference — complete flags table
- https://github.com/github/copilot-cli/issues/96 — `-p` flag purpose confirmed by maintainers
- https://github.com/orgs/community/discussions/177480 — batch mode output truncation confirmed as known limitation
- https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension — deprecation announcement

### Tertiary (MEDIUM confidence — single source)

- https://www.r-bloggers.com/2025/10/automating-the-github-copilot-agent-from-the-command-line-with-copilot-cli/ — real-world `copilot -p "..." --allow-all-tools` automation pattern

---
*Research completed: 2026-02-20*
*Ready for roadmap: yes*
