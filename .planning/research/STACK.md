# Stack Research

**Domain:** GitHub Copilot CLI programmatic integration for an MCP server (TypeScript/Node.js)
**Researched:** 2026-02-20
**Confidence:** HIGH for binary/flags (verified from official docs + live testing); MEDIUM for output format details (limited reproducible stdout/stderr spec in docs); HIGH for deprecation status (confirmed via live test)

---

## Critical Finding: gh copilot Extension is Dead

The `gh copilot` extension (installed via `gh extension install github/gh-copilot`) was **deprecated on October 25, 2025** and the final version (v1.2.0) prints a deprecation notice and exits with code 0 without executing anything. Live test on this machine confirmed this:

```
$ gh copilot suggest "List files in current directory" -t shell
The gh-copilot extension has been deprecated in favor of the newer GitHub Copilot CLI.
For more information, visit:
- Copilot CLI: https://github.com/github/copilot-cli
- Deprecation announcement: https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension
No commands will be executed.
EXIT_CODE: 0
```

The project must target the **standalone `copilot` binary** (`@github/copilot` npm package), not `gh copilot`.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@github/copilot` (npm) | 0.0.412 (Feb 19 2026, latest) | The CLI backend being wrapped | Official GitHub replacement for deprecated `gh copilot`; only maintained path forward |
| `copilot` binary | same as above | Invocable via `child_process.spawn()` | Installed globally, available on PATH; existing command execution layer in `src/utils/command.ts` works as-is |
| Node.js | 22+ | Runtime requirement for `@github/copilot` | Documented minimum; already used by this project |
| GitHub Copilot subscription | Pro/Pro+/Business/Enterprise | Auth prerequisite | Free plan does NOT support Copilot CLI |

### Supporting Libraries

No new npm packages are needed. The existing stack handles everything:

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `child_process` (Node built-in) | — | Spawn `copilot` process | Already used via `executeCommand()` in `src/utils/command.ts` |
| `zod` | 4.0.17 (existing) | Validate MCP tool arguments | Already used; schemas need updating for new tool names/args |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `copilot` CLI | Testing invocations locally | Install via `npm install -g @github/copilot`; authenticate first with `/login` |
| `gh` CLI | Auth fallback path | If `GH_TOKEN` / `COPILOT_GITHUB_TOKEN` not set, Copilot CLI falls back to `gh` auth session |

---

## Installation

```bash
# Install GitHub Copilot CLI globally (user prerequisite, not a package dep)
npm install -g @github/copilot

# Alternative: Homebrew (macOS/Linux)
brew install copilot-cli

# Alternative: WinGet (Windows)
winget install GitHub.Copilot

# Authenticate (one-time, interactive)
copilot
# then type: /login
```

No new npm dependencies for the MCP server package itself.

---

## CLI Invocation Patterns for Non-Interactive / Scripted Usage

### The Core Flag: `-p` / `--prompt`

This is the only supported path for headless, non-interactive, programmatic invocation.

```bash
# Basic non-interactive invocation
copilot -p "explain what git rebase -i does"

# With silent mode (suppresses usage statistics at end of output)
copilot -p "your prompt" --silent

# Equivalent long forms
copilot --prompt "your prompt" --silent
```

**Why `-p` is the right approach:**
- `copilot` without `-p` opens a TUI (terminal UI) that reads from stdin — not compatible with `child_process.spawn()` with `stdio: pipe`
- `-p` causes the process to exit after completing the task (single-shot)
- Documented as "Execute a prompt programmatically (exits after completion)"

### Permission Flags (Required for Tool Execution Without Hanging)

The `copilot` binary, when it needs to run tools (shell commands, file reads), will pause and ask for interactive approval unless you pre-authorize. In a spawned subprocess with no TTY, this causes the process to hang indefinitely.

```bash
# Allow all tools automatically (equivalent to COPILOT_ALLOW_ALL env var)
copilot -p "your prompt" --allow-all-tools

# Full permissive mode: tools + paths + URLs
copilot -p "your prompt" --yolo
# or equivalently:
copilot -p "your prompt" --allow-all
```

**Recommended for MCP server use:** `--allow-all-tools` is the minimum. Without it, any task that requires the agent to read a file or run a command will block waiting for TTY input that never arrives.

**IMPORTANT:** The new `copilot` CLI is an agentic tool — it can execute shell commands, modify files, make network requests. For an MCP server that wraps it, always document to users that `--allow-all-tools` grants the agent broad local system access. The MCP server is passing user prompts through — this is intentional but must be surfaced in documentation.

### Disabling Interactive Questions from the Agent

```bash
# Prevent the agent from asking clarifying questions mid-task
copilot -p "your prompt" --allow-all-tools --no-ask-user
```

`--no-ask-user` disables the `ask_user` tool, meaning the agent works autonomously without pausing for clarification. Recommended for the MCP context where there's no human to answer mid-session questions.

### Combining Flags for MCP Server Use

The recommended invocation pattern for the MCP server:

```bash
copilot -p "the user's prompt" --allow-all-tools --no-ask-user --silent --no-color
```

Explanation:
- `--allow-all-tools`: no TTY approval prompts for tool execution
- `--no-ask-user`: agent does not pause to ask clarifying questions
- `--silent`: suppresses usage statistics in output (cleaner for MCP parsing)
- `--no-color`: suppresses ANSI escape codes (important: MCP response text should not contain terminal color codes)

### Spawn Command

Using the existing `executeCommand()` utility:

```typescript
const result = await executeCommand('copilot', [
  '-p', userPrompt,
  '--allow-all-tools',
  '--no-ask-user',
  '--silent',
  '--no-color',
]);
```

---

## Subcommand Mapping: Old vs New

The old `gh copilot` had three specific subcommands. The new `copilot` binary collapses them into a single prompt interface:

| Old (Deprecated) | New Equivalent | Notes |
|------------------|---------------|-------|
| `gh copilot suggest "install git" -t shell` | `copilot -p "suggest a shell command to install git"` | Target type (shell/git/gh) becomes part of the prompt |
| `gh copilot explain "tar -czvf"` | `copilot -p "explain: tar -czvf"` | Same pattern; no separate subcommand |
| `gh copilot ask` | `copilot -p "your question"` | Unified interface |

**Why the new approach is better for the MCP server:**
- Single tool handler pattern instead of three separate handlers
- More flexible — users can ask anything, not just shell command suggestions
- The agentic backend can actually read files, run commands, and iterate

---

## Output Format

### What Goes to Stdout

The agent's text response — the actual answer/explanation/suggestion. With `--silent`, usage statistics are suppressed. With `--no-color`, no ANSI codes.

Example stdout (with `--silent --no-color`):
```
To install git on Ubuntu/Debian:

sudo apt-get update && sudo apt-get install git -y

On macOS with Homebrew:

brew install git
```

### What Goes to Stderr

- Error messages (auth failures, network errors, invalid prompts)
- Diagnostic output
- Debug logging (if `--log-level` is set above `none`)

**Unlike the old `codex` CLI**, the `copilot` binary writes its primary response to **stdout**, not stderr. The existing `command.ts` logic that returns `stdout || stderr` will work, but the response will typically be in `stdout`.

### Exit Codes

- `0`: Success (agent completed, even if it said "I don't know")
- Non-zero: Fatal error (auth failure, binary not found, invalid flag)

The existing logic in `executeCommand()` that accepts output even on non-zero exit codes is correct defensive behavior.

### Known Limitation: Batch Mode Output Truncation

When the agent executes commands internally (e.g., runs `ls` as part of answering), those command results may appear truncated in the output (e.g., `↪ 10 lines...` instead of full output). This is a known limitation of the CLI's batch mode — it's not a bug in the MCP server. Users should be aware their responses may reference truncated tool outputs.

---

## Authentication Requirements

### Prerequisite Order of Operations (User Setup)

1. Must have an active **GitHub Copilot subscription** (Pro, Pro+, Business, or Enterprise). Free plan does NOT work.
2. For organizations: admin must enable "Copilot CLI" policy in org settings.
3. Install the `copilot` binary globally.
4. Authenticate once interactively via `copilot` → `/login`.

### Environment Variables (for CI/Headless Auth)

The CLI checks these in precedence order:

| Variable | Priority | Notes |
|----------|----------|-------|
| `COPILOT_GITHUB_TOKEN` | 1 (highest) | Dedicated variable; won't interfere with other GitHub tooling |
| `GH_TOKEN` | 2 | Standard GitHub token; works if Copilot scope is present |
| `GITHUB_TOKEN` | 3 | Legacy compat; works if Copilot scope is present |

Token requirement: A fine-grained PAT with **"Copilot Requests"** permission enabled. Without this scope, auth fails.

**For the MCP server:** No auth handling is needed in the server code. The user sets up auth in their environment before launching the MCP server, identical to how the existing Codex integration required `codex login`. Document this clearly in the README.

### GitHub Enterprise

Set `GH_HOST` to the GHES hostname for non-interactive authentication against GitHub Enterprise Server (supported since copilot-cli v0.0.342).

### Automatic `gh` CLI Fallback

If `gh` is installed and already authenticated, `copilot` CLI automatically reuses those credentials. This means users who already use `gh auth login` may not need any additional setup.

---

## What NOT to Do

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `gh copilot suggest` / `gh copilot explain` | Deprecated October 25, 2025; prints deprecation message and exits with code 0, returning no useful output | `copilot -p "..."` |
| `gh extension install github/gh-copilot` | Installs the deprecated extension | `npm install -g @github/copilot` |
| Spawning `copilot` without `-p` flag | Opens a TUI; with `stdio: pipe` it will block/hang waiting for terminal input | Always pass `-p` for non-interactive use |
| Spawning `copilot` without `--allow-all-tools` | Any task that needs to run a tool will block waiting for TTY approval prompt | Pass `--allow-all-tools` |
| Spawning `copilot` without `--no-color` | Response text will contain ANSI color escape codes that pollute MCP text content | Pass `--no-color` |
| Using `--acp` (ACP server mode) | ACP is a different integration pattern (NDJSON protocol over stdio) — not compatible with the simple spawn-and-capture approach | Stick to `copilot -p` for this use case |
| Adding `@github/copilot` as a package.json dependency | It's a global CLI tool, not a library | List it as a peer/runtime prerequisite in documentation |
| Assuming session management is needed | `copilot -p` is stateless single-shot; each call is independent | Remove session layer entirely (already planned) |
| Assuming free GitHub accounts work | Copilot CLI requires a paid Copilot subscription | Document clearly in README prerequisites |

---

## Stack Patterns by Variant

**For "suggest a command" use case:**
- Use `copilot -p "suggest a shell/git/gh command to [task]" --allow-all-tools --no-ask-user --silent --no-color`
- The response will be a natural language explanation with a code block containing the command

**For "explain a command" use case:**
- Use `copilot -p "explain: [command string]" --allow-all-tools --no-ask-user --silent --no-color`
- The response will be a natural language explanation

**For "general ask" use case:**
- Use `copilot -p "[user question]" --allow-all-tools --no-ask-user --silent --no-color`
- Most flexible; same pattern as above

**If running in a CI/CD or containerized environment:**
- Set `COPILOT_GITHUB_TOKEN` env var with a fine-grained PAT ("Copilot Requests" permission)
- Pass `--no-auto-update` to prevent the binary from trying to update itself during execution

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@github/copilot` 0.0.412 | Node.js 22+ | Official requirement; earlier Node.js versions not supported |
| `@github/copilot` 0.0.412 | `@modelcontextprotocol/sdk` 1.24.0 | No compatibility concern; they don't interact |
| `copilot` CLI | macOS, Linux, Windows (WSL) | Native Windows supported via WinGet; npm install works on all platforms |
| `--allow-all` / `--yolo` flags | `copilot` 0.0.381+ | Added in v0.0.381; safe to use with 0.0.412 |
| `--acp` flag | `copilot` 0.0.397+ | ACP server mode; not needed for this integration pattern |

---

## Sources

- `gh copilot suggest "..." -t shell` — live test on this machine; confirmed deprecation notice, exit 0, no output (2026-02-20)
- `gh copilot --help` — live test; confirmed extension is v1.2.0 and prints flags but they no longer work
- https://docs.github.com/en/copilot/reference/cli-command-reference — complete flags reference; source for `-p`, `-s`, `--silent`, `--allow-all-tools`, `--no-ask-user`, `--acp`, `--no-color`
- https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli — installation commands, Node.js 22+ requirement, binary name `copilot`
- https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started — auth flow, `/login`, `-p` with `-s`
- https://deepwiki.com/github/copilot-cli/4.1-authentication-methods — auth precedence: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > `gh` CLI > OAuth; PAT "Copilot Requests" permission required
- https://deepwiki.com/github/copilot-cli/5.5-command-line-flags-reference — complete flags table including `--available-tools`, `--excluded-tools`, `COPILOT_ALLOW_ALL` env var
- https://github.com/github/copilot-cli — repository; v0.0.412 released 2026-02-19; auth env vars documented
- https://github.com/github/copilot-cli/blob/main/changelog.md — `--allow-all`/`--yolo` added v0.0.381; ACP server added v0.0.397; `--acp` permission flags v0.0.400
- https://github.com/github/copilot-cli/issues/96 — confirmed: `-p` flag added for headless mode; team response: "run `copilot -p <prompt>` to run headlessly"
- https://github.com/orgs/community/discussions/177480 — confirmed: batch mode (`-p`) truncates tool output to `↪ N lines...`; known limitation
- https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension — deprecation announcement
- https://www.r-bloggers.com/2025/10/automating-the-github-copilot-agent-from-the-command-line-with-copilot-cli/ — real-world automation example using `copilot -p "..." --allow-all-tools`

---
*Stack research for: GitHub Copilot CLI programmatic integration (replacing gh copilot extension)*
*Researched: 2026-02-20*
