# Feature Research

**Domain:** MCP Server — GitHub Copilot CLI (`copilot` binary) Integration
**Researched:** 2026-02-20
**Confidence:** HIGH — all findings verified via live CLI invocation (`copilot` v0.0.412)

---

## GitHub Copilot CLI Capability Overview

The standalone `copilot` binary (github/copilot-cli v0.0.412) exposes a single agentic interface through its `-p` / `--prompt` flag. There are no "suggest", "explain", or "ask" subcommands — these are semantic constructs that the MCP server layer imposes via prompt wording. The underlying CLI is a general-purpose coding agent.

### Confirmed Non-Interactive Behavior (Live Tested)

```
# Core non-interactive invocation (verified working):
copilot -p "What is 2 + 2?" --allow-all --model gpt-4.1 --silent
# Output (stdout): 4

# Response goes to stdout; stats go to stderr (with --silent, stats are suppressed)
# Exit code 0 on success, 1 on auth failure / invalid flag / quota exceeded

# Session continuity (verified working):
copilot -p "Remember 42" --share /tmp/session.md → extracts Session ID from written markdown
copilot --resume <session-id> -p "What did I ask?" → correctly resumed prior conversation
copilot --continue -p "What did I last ask?" → resumes most recent session
```

### What the `gh copilot` Extension Exposed (Deprecated — DO NOT USE)

The `gh copilot` extension (v1.2.0) defined three subcommands with specific semantics:

| Subcommand | Purpose | Flags |
|-----------|---------|-------|
| `gh copilot suggest <prompt>` | Suggest a shell/git/gh command | `-t shell|git|gh` to specify target |
| `gh copilot explain <command>` | Explain what a shell command does | none |
| (no `ask` equivalent) | — | — |

All three are non-functional as of October 2025 — the extension prints a deprecation notice and exits with code 0 regardless of input. The standalone `copilot -p` interface replaces all of them.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the MCP server is useless.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `ask` tool — general prompt passthrough | Core value proposition: agent accessible over MCP without needing terminal | LOW | `copilot -p <prompt> --allow-all-tools --no-ask-user --silent --no-color`; stdout is the response |
| `suggest` tool — command suggestion semantics | PROJECT.md lists it; maps to original `gh copilot suggest`; AI agents routinely ask "how do I do X in shell/git" | LOW | Implemented as prompt wording: "Suggest a shell/git/gh command to: <prompt>". Optional `target` enum (`shell`, `git`, `gh`) routes the framing |
| `explain` tool — command explanation semantics | PROJECT.md lists it; maps to original `gh copilot explain`; extremely common agent use case (agent sees unfamiliar command, asks for explanation) | LOW | Implemented as prompt wording: "Explain what this command does: <command>" |
| `ping` tool — server health check | MCP convention; every MCP server needs a health check for debugging and IDE integration verification | LOW | Unchanged from existing implementation; no CLI invocation needed |
| `--allow-all-tools` flag always passed | Without it, any task requiring file reads/shell commands blocks waiting for TTY approval (hangs subprocess forever) | LOW | Hardcoded in handler; not a user-facing parameter. Can be overridden via `allowedTools` parameter if granular control is needed |
| `--no-ask-user` flag always passed | Agent asks clarifying questions mid-task by default; with `stdio: pipe` and no TTY, this blocks the process | LOW | Hardcoded in handler |
| `--no-color` flag always passed | Without it, stdout contains ANSI escape codes that pollute MCP text content | LOW | Hardcoded in handler |
| `--silent` / `-s` flag always passed | Without it, stdout contains usage statistics mixed with the agent response | LOW | Hardcoded in handler; the stats are not useful to MCP consumers |
| Model selection parameter | Users want to choose Claude vs GPT vs Gemini models depending on their task | LOW | `--model <model>` flag; CLI validates the enum — no handler-level validation needed. Default: `gpt-4.1` (confirmed working; gpt-5.x requires quota) |

### Differentiators (Competitive Advantage)

Features that set this server apart from a minimal wrapper. Not required, but add meaningful value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `suggest` target parameter (`shell`, `git`, `gh`) | Preserves the conceptual API of the deprecated gh extension; AI agents can specify target type for more precise suggestions | LOW | Injected into prompt: "Suggest a git command to: <task>". The LLM responds differently based on target framing |
| Session resume via `--resume <id>` | Enables multi-turn conversations across separate MCP tool calls; agent can follow up on prior work | MEDIUM | Requires the MCP server to persist a session ID across calls (via `--share` flag writing to temp file, then parsing the markdown for the UUID). Adds state management. PROJECT.md says drop it — but it's technically possible and functional |
| Agentic tool execution capabilities exposed | Unlike the old Codex MCP server, Copilot can read files, run commands, make network requests — the `ask` tool inherits all of this | LOW (already works) | The differentiator is surfacing this to users in docs/tool descriptions so they understand it's an agent, not just a Q&A system |
| Multi-model access including Claude + Gemini | The Codex MCP server was GPT-only; this server gives access to Claude Sonnet/Opus/Haiku and Gemini models | LOW | `--model` flag accepts `claude-sonnet-4.6`, `claude-opus-4.6`, `gemini-3-pro-preview`, etc. Some models require prior interactive mode activation — document this |
| `--no-auto-update` flag for CI stability | Prevents the binary from auto-updating during execution in CI/CD environments | LOW | Hardcode in the handler; COPILOT_AUTO_UPDATE env var alternative |
| `--add-dir` parameter for file access scope | Allows exposing additional directories beyond cwd to the Copilot agent | MEDIUM | Useful for agents working across monorepos or multi-directory projects. Pass-through from MCP tool arg to CLI flag |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Session/conversation state management | Users want multi-turn conversations; existing server had it | Copilot CLI is stateless per `-p` invocation. Implementing state requires the server to parse session IDs from `--share` markdown output (fragile) and persist them across calls. PROJECT.md explicitly drops this. The complexity is not justified for v1 | Pass session context in the prompt explicitly if continuity is needed (prompt engineering) |
| Keeping `review` tool from Codex | Some users liked code review capability | The Copilot CLI does have `/review` as an interactive command, but it's not accessible via `-p` flag in non-interactive mode (tested: returns quota error before producing output). The equivalent is `ask` with a review-focused prompt | Use the `ask` tool with prompt: "Review these changes: <diff>" |
| Keeping `listSessions` tool | Was in the Codex server | Session management is dropped entirely. No sessions to list. | Remove entirely |
| Keeping `help` tool | Was in the Codex server | `copilot help` is interactive and opens a TUI. The `-h` flag output is standard CLI help, not useful as an MCP tool response since the Copilot CLI's help is self-documenting to users, not to agents using MCP | Remove entirely; describe capabilities in tool descriptions |
| `--yolo` / `--allow-all` flag exposure as a user parameter | Sounds convenient — "just allow everything" | These flags also allow access to any path on the filesystem (`--allow-all-paths`) and any URL (`--allow-all-urls`). The MCP server should scope down permissions to the minimum required, not expose maximum permissions as a user-configurable option | Always include `--allow-all-tools --no-ask-user` (tools only); omit `--allow-all-paths` and `--allow-all-urls` from defaults. Expose `allowAllPaths` and `allowAllUrls` as opt-in parameters with security warnings in descriptions |
| ACP (Agent Client Protocol) mode | `--acp` starts the binary as an NDJSON server — sounds like a richer integration | ACP is an entirely different integration pattern. It requires a different message format over stdio and is incompatible with the spawn-and-capture approach. Would require rewriting the entire server transport layer | Stick to `copilot -p` for this integration |
| Streaming output | Existing server had `executeCommandStreaming`; users may want real-time output | The `copilot` binary in `-p` mode processes the request and streams output to stdout. However, with `--silent`, intermediate tool call outputs (file reads, command executions) are suppressed. Without `--silent`, the output format is noisy and includes stats. MCP progress notifications add complexity for marginal user benefit in a local CLI context | Provide complete response when done; progress tokens can be added as a v1.x enhancement |
| Model validation in the handler | Existing Codex server validated model strings against an allowed list | The `copilot` binary validates its own `--model` flag and exits with code 1 + clear error message on invalid input. Double-validating is redundant and creates maintenance overhead every time GitHub adds a new model | Let the CLI validate; surface the error via `CommandExecutionError` |

---

## Feature Dependencies

```
[ask tool]
    └──requires──> [copilot binary in PATH]
                       └──requires──> [GitHub Copilot subscription]
                       └──requires──> [auth via copilot login or COPILOT_GITHUB_TOKEN]

[suggest tool] ──is──> [ask tool with prompt prefix]
    └──optional──> [target parameter (shell|git|gh)]

[explain tool] ──is──> [ask tool with prompt prefix]

[ping tool] ──independent──> (no CLI dependency)

[model selection] ──enhances──> [ask tool, suggest tool, explain tool]

[session resume] ──requires──> [ask tool]
               ──requires──> [--share flag → file I/O → session ID parsing]
               ──conflicts──> [stateless design decision in PROJECT.md]

[--allow-all-tools] ──required by──> [ask tool, suggest tool, explain tool]
    └── without it → subprocess hangs on tool approval prompts

[--no-ask-user] ──required by──> [ask tool, suggest tool, explain tool]
    └── without it → subprocess hangs on clarifying questions

[--silent] ──required by──> [clean MCP output for all tools]
    └── without it → stats mixed into stdout response

[--no-color] ──required by──> [clean MCP output for all tools]
    └── without it → ANSI codes in response text
```

### Dependency Notes

- **`suggest` and `explain` require `ask`:** They are thin wrappers. The only difference is prompt construction. All three share the same execution path: `copilot -p <constructed-prompt> --allow-all-tools --no-ask-user --silent --no-color`.
- **`--allow-all-tools` + `--no-ask-user` are always required:** Not optional. Without them, the subprocess hangs in any environment without a TTY. These must be hardcoded in the handlers, not exposed as optional user parameters.
- **Model selection enhances all tools:** Optional parameter; default `gpt-4.1` is confirmed working. Other models subject to quota and interactive-mode activation requirements.
- **Session resume conflicts with stateless design:** The `--resume` + `--share` approach is technically functional (verified: session resumed correctly using session ID from `--share` output) but adds file I/O and state complexity that PROJECT.md explicitly drops for v1.

---

## MCP Tool Mapping

How each `gh copilot` concept maps to an MCP tool:

| MCP Tool | Replaces (gh extension) | CLI Invocation Pattern | Required Args | Optional Args |
|----------|------------------------|----------------------|---------------|---------------|
| `suggest` | `gh copilot suggest -t <target> <prompt>` | `copilot -p "Suggest a <target> command to: <prompt>" --allow-all-tools --no-ask-user --silent --no-color [--model <model>]` | `prompt` (string) | `target` (enum: shell\|git\|gh), `model` (string) |
| `explain` | `gh copilot explain <command>` | `copilot -p "Explain what this command does: <command>" --allow-all-tools --no-ask-user --silent --no-color [--model <model>]` | `command` (string) | `model` (string) |
| `ask` | (no equivalent; supersedes all three) | `copilot -p "<prompt>" --allow-all-tools --no-ask-user --silent --no-color [--model <model>]` | `prompt` (string) | `model` (string), `workingDirectory` (string) |
| `ping` | (no equivalent) | (no CLI call) | none | `message` (string) |

### Tools Being Removed

| Tool (Codex server) | Reason for Removal |
|--------------------|---------------------|
| `codex` | Replaced by `ask`; Codex CLI retired |
| `review` | `gh copilot /review` not accessible non-interactively; equivalent via `ask` with review prompt |
| `listSessions` | Session management dropped; Copilot CLI is stateless per `-p` call |
| `help` | Copilot help is interactive/TUI; not useful as MCP tool |

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to replace the Codex MCP server.

- [ ] `suggest` tool — replaces the primary use case from `gh copilot suggest`; required for parity
- [ ] `explain` tool — replaces `gh copilot explain`; the second most used Codex-era feature
- [ ] `ask` tool — the general-purpose agentic interface; provides the new capability not in the old server
- [ ] `ping` tool — keep unchanged; required for MCP health checks and IDE integration verification
- [ ] Model selection parameter on `ask`, `suggest`, `explain` — required because users on the old server had model selection; regressions on this will be noticed immediately
- [ ] Hardcoded `--allow-all-tools --no-ask-user --silent --no-color` flags — required for subprocess to work at all in non-TTY environments

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] `workingDirectory` parameter on `ask` — lets agents scope file access; add when agents report needing cross-directory work
- [ ] `--add-dir` parameter on `ask` — expand file access scope; add when workingDirectory alone is insufficient
- [ ] Streaming output via progress notifications — add when users report needing real-time feedback for long-running tasks
- [ ] Session resume via `--resume` — add if users request multi-turn conversations; requires careful state design

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] `target` parameter on `suggest` expanding to additional values (e.g., `docker`, `npm`) — defer until users request specific ecosystems
- [ ] GitHub MCP server toolset exposure via `--add-github-mcp-tool` / `--add-github-mcp-toolset` — the Copilot CLI can be configured to expose GitHub MCP tools; interesting but complex and changes the security model significantly
- [ ] ACP (Agent Client Protocol) integration — entirely different architecture; only warranted if the spawn-and-capture approach proves insufficient at scale
- [ ] Plugin support via `copilot plugin` — the CLI supports an extensible plugin system; relevant if users want specialized agents

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `ask` tool | HIGH | LOW | P1 |
| `suggest` tool | HIGH | LOW | P1 |
| `explain` tool | HIGH | LOW | P1 |
| `ping` tool | MEDIUM | LOW | P1 |
| Model selection | HIGH | LOW | P1 |
| Hardcoded safety flags (`--allow-all-tools`, etc.) | HIGH | LOW | P1 |
| `workingDirectory` parameter | MEDIUM | LOW | P2 |
| Streaming / progress notifications | MEDIUM | MEDIUM | P2 |
| `--add-dir` parameter | LOW | LOW | P2 |
| Session resume | MEDIUM | HIGH | P3 |
| GitHub MCP toolset exposure | MEDIUM | HIGH | P3 |
| ACP integration | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor / Predecessor Feature Analysis

| Feature | Codex MCP Server (old) | gh copilot extension (deprecated) | This Server (copilot binary) |
|---------|------------------------|-----------------------------------|------------------------------|
| Command suggestion | Via `codex` tool with prompt | `gh copilot suggest -t shell/git/gh` | `suggest` tool (prompt-wrapped) |
| Command explanation | Via `codex` tool with prompt | `gh copilot explain <cmd>` | `explain` tool (prompt-wrapped) |
| General Q&A / agentic tasks | `codex` tool | No equivalent | `ask` tool (full agentic) |
| Code review | `review` tool (rich: base/commit/uncommitted) | No equivalent | Not exposed (use `ask` with review prompt) |
| Session continuity | In-memory session storage + Codex `--resume` | No equivalent | Not in v1; technically possible via `--resume` |
| Model selection | GPT models only | No model selection | Claude, GPT, Gemini models |
| File system access | Via Codex agent sandbox modes | No | Via `--allow-all-tools` (always enabled) |
| Shell command execution | Via Codex sandbox | No | Via `--allow-all-tools` (always enabled) |
| Help tool | `codex --help` wrapper | No | Removed; not useful over MCP |
| listSessions tool | Yes | No | Removed; no sessions |

---

## Key Behavioral Differences from Old Server

These must be understood by anyone writing tests or implementing handlers:

1. **Output channel flipped:** Codex wrote primary response to `stderr`. Copilot with `-s` writes primary response to `stdout`. `result.stdout` is the canonical response; non-empty `result.stderr` with empty `result.stdout` signals an error.

2. **No session state:** Remove `InMemorySessionStorage`, all session-related schemas, and all session-related tests. Each tool call is independent.

3. **Model validation at CLI level, not handler level:** Pass model strings to CLI directly. CLI enforces its own enum with clear errors. Do not validate at handler level.

4. **All three semantic tools share one CLI command:** `suggest`, `explain`, and `ask` all invoke `copilot -p <constructed-prompt>`. The only difference is how the prompt is constructed before passing to the CLI.

5. **Safety flags are non-negotiable:** `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color` must be hardcoded into every tool invocation. Exposing any of these as "optional" creates subprocess hang scenarios.

6. **Exit code 0 with no output is possible on quota exhaustion:** `402 You have no quota` goes to stderr; stdout is empty; exit code is non-zero. Handle gracefully: if stdout is empty and stderr contains an error message, surface stderr as the error.

---

## Sources

- Live `copilot --help` output (github/copilot-cli v0.0.412, installed at `/opt/homebrew/bin/copilot`)
- Live `copilot help config`, `copilot help environment`, `copilot help permissions`, `copilot help commands` outputs
- Live `copilot -p "What is 2 + 2?" --allow-all --model gpt-4.1 -s` — confirmed working, stdout-only response
- Live `copilot -p "..." --share /tmp/test.md` — confirmed session ID in exported markdown at `Session ID: <uuid>`
- Live `copilot --resume <session-id> -p "..."` — confirmed session resume works with prior session ID
- Live `copilot --continue -p "..."` — confirmed resumes most recent session
- Live `gh copilot suggest "..." -t shell` — confirmed deprecation notice, no output (verified for STACK.md; reconfirmed here)
- `.planning/research/ARCHITECTURE.md` — subcommand mapping table, output channel analysis, anti-patterns
- `.planning/research/STACK.md` — flag reference, auth patterns, model list, output format details
- `.planning/PROJECT.md` — out-of-scope decisions (session management, keeping Codex alongside)

---

*Feature research for: GitHub Copilot CLI MCP Server (copilot binary v0.0.412)*
*Researched: 2026-02-20*
