# Pitfalls Research

**Domain:** GitHub Copilot CLI (`copilot`) — MCP server child process integration
**Researched:** 2026-02-20
**Confidence:** HIGH — verified via live CLI testing on macOS with copilot 0.0.412 and gh-copilot extension v1.2.0

---

## Critical Pitfalls

### Pitfall 1: Targeting the Deprecated `gh copilot` Extension Instead of the Standalone `copilot` CLI

**What goes wrong:**
The project references `gh copilot suggest`, `gh copilot explain`, and `gh copilot ask`. The `gh copilot` extension (github/gh-copilot) was deprecated on 2025-09-25. As of v1.2.0, every invocation — including `gh copilot suggest "..."` — outputs a deprecation notice to stdout and exits with code 0 without executing the command. The MCP server receives exit code 0 + output and the existing lenient success check (`if (code === 0 || stdout || stderr)`) incorrectly treats this as a successful AI response, silently returning the deprecation string as if it were the Copilot answer.

**Why it happens:**
The project README and early planning documents refer to `gh copilot` subcommands. Developers assume the extension still works because the exit code is 0 and there is output. The extension never had an `ask` subcommand either — only `suggest` and `explain` — making `ask` dead on arrival regardless of deprecation.

**How to avoid:**
Target the standalone `copilot` binary (installed via `brew install gh`, `npm install -g @github/copilot-cli`, or `copilot update`), not the `gh copilot` extension. The standalone binary is at a path like `/opt/homebrew/bin/copilot` and has a completely different CLI interface: it uses `-p / --prompt` for non-interactive execution rather than subcommands. Verify correct binary at startup with a version check (`copilot --version`) and reject output that contains the deprecation string "gh-copilot extension has been deprecated".

**Warning signs:**
- Output contains "The gh-copilot extension has been deprecated"
- "No commands will be executed." appears in tool response
- The `ask` subcommand returns `Error: unknown command "ask"` with exit 1 when using the extension

**Phase to address:** Phase 1 (CLI invocation replacement). This is the foundational decision that affects every subsequent implementation step.

---

### Pitfall 2: Using the Wrong Non-Interactive Flag (`-i` vs `-p`)

**What goes wrong:**
The new standalone `copilot` CLI has two distinct prompt flags: `-i / --interactive <prompt>` starts an interactive TUI session pre-seeded with a prompt (requires a TTY, will hang waiting for user input when piped), and `-p / --prompt <text>` executes the prompt in non-interactive mode and exits. Using `-i` in a child process with `stdio: ['pipe', 'pipe', 'pipe']` causes the process to either hang indefinitely or exit with an error because no TTY is allocated.

**Why it happens:**
The flags look similar and both accept a prompt string. The MCP server spawns processes without a TTY (`stdio: ['pipe', 'pipe', 'pipe']`), which is correct for non-interactive use, but `-i` is designed for interactive sessions.

**How to avoid:**
Always use `-p / --prompt <text>` for non-interactive MCP invocations. Never use `-i`. Pair it with `--silent` to suppress stats output from stderr. Example: `copilot -p "your prompt" --silent --model gpt-4.1`.

**Warning signs:**
- Child process never emits a `close` event
- Timeout elapsed before any stdout data received
- Process requires `SIGKILL` to terminate

**Phase to address:** Phase 1 (CLI invocation replacement).

---

### Pitfall 3: Inheriting the Lenient Exit Code Logic (`code === 0 || stdout || stderr`)

**What goes wrong:**
The current `executeCommand` in `src/utils/command.ts` (lines 87-89) resolves the promise as success if exit code is 0 OR if any output (stdout or stderr) is present. This was designed for the Codex CLI which sometimes exits non-zero but produces valid output. The `copilot` CLI uses exit codes strictly: exit 1 means failure. Two concrete failure modes that produce output but should be errors: (1) quota exhaustion returns exit 1 + `"402 You have no quota"` in stderr — with the current logic this is silently resolved as success; (2) authentication failure with an invalid token can return exit 1 with an error message in stderr, again resolved as success.

**Why it happens:**
The lenient logic was intentionally designed for the Codex CLI. The comment in `command.ts` line 123 explicitly says "Note: Unlike executeCommand, this function treats stderr output as success because tools like codex write their primary output to stderr." This assumption does not hold for the `copilot` CLI.

**How to avoid:**
Tighten exit code handling for the `copilot` CLI path: only treat exit code 0 as success. When exit code is non-zero, reject with a `CommandExecutionError` using the stderr content as the error message. Parse stderr for known error patterns (`"402 You have no quota"`, `"401"`, `"403"`, `"Error:"`) to provide user-friendly error messages.

**Warning signs:**
- Tool returns quota error text as if it were a valid AI response
- Auth failure message appears in tool output instead of error
- Users cannot distinguish between a Copilot answer and an error message

**Phase to address:** Phase 1 (CLI invocation replacement) — must fix before any integration tests.

---

### Pitfall 4: Output Channel Confusion (stdout vs stderr)

**What goes wrong:**
The Codex CLI writes its primary AI output to stderr. The `copilot` CLI does the opposite: the AI response goes to stdout, while stats/metadata goes to stderr. The existing handler chain (`executeCommandStreaming` treats stderr as primary output, sends stderr chunks as progress) and the output extraction logic (`result.stderr || result.stdout`) will return empty strings or raw stats instead of the actual AI response.

**Why it happens:**
The inversion is non-obvious. The codebase has multiple comments that explicitly say "codex writes output to stderr" — these will be preserved during refactoring and create wrong behavior. The streaming handler sends `stderr` data as progress notifications, which with the new CLI means streaming usage stats and cost summaries instead of actual responses.

**How to avoid:**
After migration, always extract the AI response from `stdout`. Treat `stderr` as metadata/diagnostics. When `--silent` is used, stderr is empty on success; when `--silent` is omitted, stderr contains usage stats (e.g., `"Total usage est: 1 Premium request"`). Update progress callbacks to forward `stdout` chunks, not `stderr` chunks. Update result extraction to use `result.stdout` as the primary response field.

**Warning signs:**
- Tool returns empty string when copilot executed successfully
- Progress notifications stream usage statistics instead of the AI answer
- Tool returns `"Total usage est: ..."` as the response

**Phase to address:** Phase 1 (CLI invocation replacement). Grep for all `result.stderr` usages in handlers and swap to `result.stdout`.

---

### Pitfall 5: Stats Contamination When `--silent` Is Omitted

**What goes wrong:**
Without `--silent`, the `copilot` CLI appends usage stats to stderr after every run, even in non-interactive mode. Example: `"\nTotal usage est: 1 Premium request\nAPI time spent: 2s\nTotal session time: 7s\n..."`. If the server forwards the entire stderr as part of the response or for debugging, these stats will pollute logs and may be mistaken for errors by monitoring systems.

**Why it happens:**
The stats are emitted unconditionally unless `--silent` is explicitly passed. The existing Codex codebase does not need this flag because Codex doesn't emit such stats.

**How to avoid:**
Always pass `--silent` when invoking `copilot -p`. This suppresses stats from stderr, leaving stderr empty on success. The response will be clean stdout only. Document `--silent` as a required flag for programmatic use.

**Warning signs:**
- stderr contains "Total usage est:" on every successful run
- Log volume unexpectedly high
- Monitoring alerts on non-empty stderr being treated as errors

**Phase to address:** Phase 1 (CLI invocation replacement).

---

### Pitfall 6: Model Name Mismatch — Codex Models Are Not Valid Copilot Models

**What goes wrong:**
The existing codebase defaults to `gpt-5.3-codex` and exposes model selection to MCP clients. The standalone `copilot` CLI validates the `--model` argument against a strict allowlist. Passing `gpt-5.3-codex` returns: `error: option '--model <model>' argument 'gpt-5.3-codex' is invalid` and exits with code 1. Users who have configured `CODEX_DEFAULT_MODEL=gpt-5.3-codex` or pass model names via tool args will get immediate failures. The default model `claude-sonnet-4.6` also fails programmatically on some accounts with `"Error: Run copilot --model claude-sonnet-4.6 in interactive mode to enable this model"`.

**Why it happens:**
Model names are entirely different between Codex and the `copilot` CLI. The `copilot` CLI allowlist as of v0.0.412: `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-haiku-4.5`, `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5`, `claude-sonnet-4`, `gemini-3-pro-preview`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1`, `gpt-5.1-codex-mini`, `gpt-5-mini`, `gpt-4.1`. Note: `gpt-5.3-codex` IS in the allowlist but Anthropic models may require interactive activation.

**How to avoid:**
Update `DEFAULT_COPILOT_MODEL` to a safe default like `gpt-4.1` which works reliably in non-interactive mode. Update `AVAILABLE_COPILOT_MODELS` to the verified copilot allowlist. Validate the `--model` argument before spawning the child process and return a `ValidationError` with the allowlist when an invalid model is supplied. Document that Anthropic/Gemini models may require prior interactive activation.

**Warning signs:**
- `error: option '--model' argument is invalid` in stderr
- `"Error: Run copilot --model ... in interactive mode"` in stderr
- Exit code 1 immediately on first invocation with no network call latency

**Phase to address:** Phase 1 (CLI invocation replacement) — update types.ts, definitions.ts, and the env var name.

---

### Pitfall 7: Auth Failure Returns Exit 0 with a "Helpful" Response (Silent Auth Pass-Through)

**What goes wrong:**
When an invalid `COPILOT_GITHUB_TOKEN` is set, the `copilot` CLI does not always fail loudly. In testing, an invalid token still returned exit 0 with a generic response ("Hello! How can I help you today?") because the CLI fell back to stored keyring credentials. This means auth validation via token override is unreliable for detecting misconfiguration. The server has no way to know if a response came from the correct account or a fallback.

**Why it happens:**
The `copilot` CLI resolves credentials in priority order: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > stored OAuth credentials. If an override token is invalid but stored credentials exist, the CLI silently falls through to valid stored creds. There is no auth-validation-only mode.

**How to avoid:**
Document this auth precedence clearly in the server's README. Do not attempt in-server auth validation; it is unreliable. Instead, perform a lightweight preflight check (`copilot --version`) only to confirm the binary exists and is executable. Rely on the first actual API call to surface auth errors. Provide clear error messages when exit code is 1 with auth-related stderr content (`"401"`, `"403"`, `"authentication"`, `"unauthorized"`).

**Warning signs:**
- Server reports success but responses come from the wrong account
- Auth override via env var appears to be ignored
- No error even when explicitly setting an invalid token

**Phase to address:** Phase 1 (CLI invocation replacement) + Phase 3 (documentation/error messages).

---

### Pitfall 8: Auto-Update Behavior Causing Startup Latency and CI Failures

**What goes wrong:**
The `copilot` CLI checks for and downloads updates automatically on startup by default (`COPILOT_AUTO_UPDATE=true`). In CI environments, this adds latency and can fail if update servers are unreachable. The CLI detects CI via `CI`, `BUILD_NUMBER`, `RUN_ID`, or `SYSTEM_COLLECTIONURI` environment variables and disables auto-update automatically in those cases, but developer machines and production MCP servers (not in CI) will check for updates on every invocation.

**Why it happens:**
Auto-update is a UX feature for interactive use. When the MCP server spawns the CLI as a child process, every tool call triggers an update check. Update checks add ~500ms–2s of latency before the actual API call.

**How to avoid:**
Always pass `--no-auto-update` when spawning `copilot` as a child process, or set `COPILOT_AUTO_UPDATE=false` in the environment passed to the child. This prevents update checks from blocking tool execution. Alternatively, rely on the CI detection if the MCP server is deployed in a CI-like environment with the `CI` env var set.

**Warning signs:**
- First tool call is consistently 1–2 seconds slower than subsequent calls
- Network requests to GitHub releases API visible in network monitoring
- Intermittent failures in environments with restricted outbound internet access

**Phase to address:** Phase 1 (CLI invocation replacement) — add `--no-auto-update` to the base arg list.

---

### Pitfall 9: TTY-Detecting Features Activated in Child Process Context

**What goes wrong:**
The `copilot` CLI's `--alt-screen` feature (which uses the terminal alternate screen buffer) and banner animations are designed for interactive TTY sessions. Even though these are off by default in non-interactive mode (`-p`), some config settings (e.g., `alt_screen: true` in `~/.copilot/config.json`) can activate them. When activated in a piped child process, they emit raw terminal escape sequences that corrupt the stdout content that the MCP server tries to return as an AI response.

**Why it happens:**
The CLI reads `~/.copilot/config.json` on startup. User-level config is honored even in non-interactive mode. A user who has customized their interactive copilot experience may have `alt_screen` or `banner` settings that were set by the CLI itself (e.g., `"banner": "always"`).

**How to avoid:**
Always pass `--no-color` and, if concerned about alt-screen, `--alt-screen off` when invoking as a child process. Alternatively, pass `--config-dir /dev/null` (or a temp dir) to isolate the child process from user configuration entirely. Strip any remaining ANSI escape sequences from stdout before returning to the MCP client.

**Warning signs:**
- stdout contains ANSI escape sequences (`\x1b[`, `\x1b]`, `\x1b[6n` terminal position queries)
- Response output is garbled with control characters
- Output varies between users/machines depending on their copilot config

**Phase to address:** Phase 1 (CLI invocation replacement).

---

### Pitfall 10: Missing `--allow-all-tools` Causes Silent Tool Permission Blocking

**What goes wrong:**
The `copilot` CLI in non-interactive mode (`-p`) requires explicit tool permissions. When the model decides to use a tool (e.g., shell, file read/write) and `--allow-all-tools` is not set, the CLI does not prompt for confirmation (there is no TTY). Instead, it reports the result as if it executed the task but with a permission-refusal message like "Permission to list the /tmp directory is denied." This is returned as exit code 0, making it look like a successful response when it is actually a capability failure.

**Why it happens:**
Tool confirmation in interactive mode waits for a keypress. In non-interactive piped mode, the CLI does not block — it proceeds to generate a response that reflects the permission refusal. The response is coherent English and looks correct to the MCP server.

**How to avoid:**
For agentic use cases where the copilot should execute tools (file access, shell commands), pass `--allow-all-tools` (or `--yolo` as an alias). For pure Q&A use cases, tool permissions are irrelevant. Document which use cases require which permission flags in the tool descriptions. Consider adding `--allow-all-tools` as a configurable option on the MCP tool schema.

**Warning signs:**
- Responses contain "Permission to ... is denied" or "I do not have permission to"
- Exit code 0 but the task was clearly not executed
- Tool calls that should produce file or shell output return empty or refusal text

**Phase to address:** Phase 2 (tool schema design) — decide per-tool whether to include `--allow-all-tools`.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse current lenient exit code logic unchanged | Faster migration, no test changes needed | Quota errors and auth failures silently returned as valid AI responses; impossible to detect errors | Never — must fix in Phase 1 |
| Use `gh copilot` extension invocation instead of standalone `copilot` | Familiar CLI pattern from planning docs | Every call returns deprecation notice as if it were an AI response; extension will eventually be removed entirely | Never |
| Skip `--silent` flag on copilot invocations | One less arg to manage | stderr stats in every response; log pollution; monitoring false positives | Never in production |
| Pass `--model gpt-5.3-codex` as default unchanged | No type change needed | Immediate CLI validation failure on the first call | Never |
| Skip `--no-auto-update` in child process args | One less flag | ~1–2s extra latency per tool call for update checks | Only acceptable in CI environments where auto-detection kicks in |
| Use `result.stderr` for response extraction (Codex pattern) | No change to output parsing | Returns empty string or stats instead of AI response | Never |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `copilot` CLI binary location | Hardcoding `gh copilot` or assuming it's in PATH as `gh copilot` | Require users to install the standalone `copilot` binary; check for it with `which copilot` or use full path; document install: `brew install gh` then `gh extension install github/gh-copilot` is NOT the right path — direct download from github.com/github/copilot-cli or via npm |
| Auth token precedence | Setting `COPILOT_GITHUB_TOKEN` and assuming it overrides all auth | CLI falls through to stored keyring credentials silently; test auth by checking if the expected account is active, not just checking for non-zero exit |
| Model selection env var | Keeping `CODEX_DEFAULT_MODEL` env var name and pointing to Codex models | Rename to `COPILOT_MODEL` (the CLI's own env var) or a server-specific name; update allowlist to copilot model names |
| `--silent` flag necessity | Treating it as optional | Always required for clean stdout-only responses; without it, stderr contains usage stats that vary per call and complicate response handling |
| Config directory isolation | Using user's `~/.copilot` config in child process | Add `--config-dir` to point to a known-clean config dir to prevent user settings from affecting programmatic behavior |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Auto-update check on every spawn | 1–2s added to first call per restart; potentially every call | Pass `--no-auto-update` in base args | Immediately noticeable in testing; worsens with usage frequency |
| No timeout on `copilot -p` calls | MCP server hangs indefinitely on network issues or slow model responses | Add `AbortController` or `setTimeout` + `child.kill()` with configurable timeout; the copilot CLI has no built-in timeout for `-p` mode | Triggered by network hiccups, rate limiting, or slow model responses |
| Spawning a new `copilot` process per MCP tool call | Each spawn takes ~3–8s total (startup + API round trip) | Acceptable for this use case; no persistent process mode available in `-p` mode | Not a scaling issue at low call frequency; problematic if used for streaming or high-frequency tool calls |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full `copilot -p "..."` command including prompt content | Prompts may contain sensitive code snippets or business logic visible in CI/CD logs | Redact or omit prompt content in log output; the current `console.error(chalk.blue('Executing:'), file, args.join(' '))` pattern in command.ts logs the full prompt |
| Passing `--allow-all-tools` / `--yolo` unconditionally | Copilot agent can execute arbitrary shell commands, read/write files, make network requests on behalf of the user | Make `--allow-all-tools` opt-in per tool invocation; never pass it by default; document the risk clearly |
| Passing `--add-dir` with the MCP server's working directory | Grants copilot file access to the server process's own config/credential files | Use `--add-dir` only for explicitly user-specified directories; never add the server's own directory |
| Not validating `--model` arg before passing to CLI | Invalid model string causes CLI validation error; accepted models change with CLI versions | Maintain and validate against a known model allowlist server-side; return a `ValidationError` before spawning |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Exposing raw copilot binary not found error (ENOENT) | Confusing "spawn ENOENT" error gives no actionable guidance | Catch `ENOENT` error on spawn, return: "GitHub Copilot CLI not found. Install via: [instructions]. Ensure `copilot` is in your PATH." |
| No quota error handling | Users see raw "402 You have no quota" or empty response | Detect exit code 1 + "402" pattern in stderr; return clear error: "GitHub Copilot quota exhausted. Wait for quota reset or upgrade your plan." |
| Exposing stats metadata to MCP clients when `--silent` omitted | Client sees usage cost data mixed with or instead of AI response | Always pass `--silent`; or strip stats from stderr before returning |
| Silently returning deprecation notice as AI response | User receives "The gh-copilot extension has been deprecated" as if it were a Copilot answer | Add startup validation that checks if `gh copilot` is being called and fails fast with a clear migration instruction |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Binary swap:** Changed `'codex'` to `'gh'` with `['copilot', ...]` args — does NOT work; the extension is deprecated. Must use standalone `copilot` binary with `-p` flag.
- [ ] **Output extraction:** Changed tool to call copilot but still uses `result.stderr` for the AI response — returns empty string. Must use `result.stdout`.
- [ ] **Exit code handling:** Copilot tool calls "work" in happy path but quota/auth errors are silently swallowed. Verify by deliberately exhausting quota or using an invalid token.
- [ ] **Model validation:** Updated default model string but didn't update `AVAILABLE_COPILOT_MODELS` type or Zod enum — old model names accepted at schema level, fail at CLI level.
- [ ] **`--silent` flag:** Copilot runs fine in testing but logs show stderr stats on every call — `--silent` was not added to base args.
- [ ] **`--no-auto-update` flag:** First call always slower than subsequent ones — auto-update check running on every spawn.
- [ ] **`--allow-all-tools` decision:** Tool appears to work but returns refusal messages for any prompt that would require a tool — permissions not configured.
- [ ] **`ask` tool:** Implemented a `copilotAsk` tool that calls `gh copilot ask` — this subcommand does not exist in the extension and the extension is deprecated anyway. The `ask` concept maps to `copilot -p` (same as `suggest`/`explain`).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Using deprecated `gh copilot` extension | LOW | Update binary reference from `gh` + copilot subcommand args to `copilot -p`; update all tests |
| Wrong output channel (`stderr` vs `stdout`) | LOW | Global search-replace of `result.stderr` with `result.stdout` in handler output extraction |
| Lenient exit code masking errors | MEDIUM | Update `executeCommand` success condition; add specific error pattern detection for quota/auth |
| Wrong model names passed to CLI | LOW | Update `types.ts` constants and Zod schema enum; bump all references |
| Stats pollution in responses | LOW | Add `--silent` to base args; no other changes needed |
| Auto-update latency | LOW | Add `--no-auto-update` to base spawn args |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Deprecated `gh copilot` extension | Phase 1 — binary selection | Confirm no `gh copilot` invocations remain; add test that rejects deprecation notice output |
| Wrong `-i` vs `-p` flag | Phase 1 — CLI args construction | Integration test: spawn `copilot -p "..."` with piped stdio; must receive output and close cleanly |
| Lenient exit code logic | Phase 1 — command utility update | Test: spawn copilot with invalid token; assert `CommandExecutionError` is thrown, not resolved |
| stdout/stderr inversion | Phase 1 — output extraction | Test: verify `result.stdout` contains AI response; verify `result.stderr` is empty with `--silent` |
| Stats contamination | Phase 1 — base args | Test: run without `--silent`; confirm stderr contains stats; confirm `--silent` eliminates them |
| Model name mismatch | Phase 1 — types and schema | Test: pass `gpt-5.3-codex` to copilot; confirm validation error; confirm `gpt-4.1` succeeds |
| Auth false-pass | Phase 1 + Phase 3 docs | Document auth precedence; add error pattern detection for 401/403 in stderr |
| Auto-update latency | Phase 1 — base args | Benchmark: compare spawn time with and without `--no-auto-update`; add flag to base args |
| TTY features in piped output | Phase 1 — base args | Test: confirm no ANSI escape sequences in stdout when spawned with piped stdio |
| Missing `--allow-all-tools` | Phase 2 — tool schema design | Test: run a prompt requiring file access; confirm expected behavior with and without flag |

---

## Sources

- Live CLI testing: `gh copilot` v1.2.0, standalone `copilot` v0.0.412, macOS, 2026-02-20
- Deprecation announcement: https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension
- `copilot --help` output: full flag reference tested interactively
- `copilot help environment` output: env var documentation
- Node.js child_process.spawn tests with `stdio: ['pipe', 'pipe', 'pipe']` to replicate MCP server conditions
- Existing codebase: `src/utils/command.ts` (exit code logic), `src/tools/handlers.ts` (output extraction)
- Existing codebase: `.planning/codebase/CONCERNS.md` (lenient exit code and output channel debt)

---
*Pitfalls research for: GitHub Copilot CLI MCP server integration*
*Researched: 2026-02-20*
