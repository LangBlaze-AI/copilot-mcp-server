# Phase 1: Core CLI Integration - Research

**Researched:** 2026-02-20
**Domain:** GitHub Copilot CLI (`copilot` binary) integration — TypeScript/Node.js MCP server rewrite
**Confidence:** HIGH — all stack and pitfall findings verified via live CLI testing (2026-02-20); architecture findings verified from codebase inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | User can invoke `ask` tool with a natural language prompt and receive a Copilot agent response | `copilot -p <prompt>` pattern; AskToolHandler with pass-through prompt; stdout extraction |
| TOOL-02 | User can invoke `suggest` tool with a task description and receive a command suggestion | `copilot -p "Suggest a <target> command to: <prompt>"` pattern; SuggestToolHandler |
| TOOL-03 | User can invoke `suggest` tool with optional `target` param (`shell`/`git`/`gh`) | `target` enum in SuggestToolSchema; prompt construction injects target label |
| TOOL-04 | User can invoke `explain` tool with a shell command string | `copilot -p "Explain what this command does: <command>"` pattern; ExplainToolHandler |
| TOOL-05 | User can invoke `ping` tool to verify server is alive | PingToolHandler kept unchanged; no CLI invocation needed |
| TOOL-06 | User can pass `model` parameter to `ask`, `suggest`, `explain` | `--model <model>` flag appended to args when provided; defaults to `gpt-4.1` |
| TOOL-07 | User can pass `addDir` parameter to expose additional directories | `--add-dir <path>` flag; path validation required before use (SEC-02) |
| CLI-01 | Server invokes standalone `copilot` binary (not `gh copilot`) | `executeCommand('copilot', [...])` — verified deprecated `gh copilot` returns deprecation notice exit 0 |
| CLI-02 | All AI invocations use `-p <prompt>` flag (not `-i`) | `-i` opens TUI, hangs without TTY; `-p` exits after completion |
| CLI-03 | All AI invocations hardcode `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`, `--no-auto-update` | Base args array; verified each flag's necessity against live CLI testing |
| CLI-04 | AI response is read from stdout | Copilot `-p` mode writes response to stdout; errors go to stderr |
| CLEAN-01 | Session management layer (`src/session/`) is deleted entirely | No Copilot CLI session state needed; stateless per-invocation |
| CLEAN-02 | `review`, `listSessions`, and `help` tools are removed | Not accessible via `-p` in non-interactive mode |
| SEC-02 | Prompt and `addDir` inputs validated to prevent shell injection | `spawn()` without `shell:true` prevents injection; addDir needs explicit path validation |
| TEST-01 | Handler tests rewritten for `ask`, `suggest`, `explain`, `ping` | New handler classes; mock pattern from existing tests reusable |
| TEST-02 | Session-related test files deleted | `session.test.ts`, `resume-functionality.test.ts`, `context-building.test.ts` |
| TEST-04 | Integration tests verify correct CLI flags in non-interactive mode | `mcp-stdio.test.ts` pattern reused with `copilot` stub; flags verified in stub args |
</phase_requirements>

---

## Summary

This phase rewrites the MCP server from wrapping the Codex CLI to wrapping the standalone `copilot` binary (`@github/copilot` npm package). The scope is bounded and well-understood: delete the session layer, replace four tool handlers with three new ones, rewrite Zod schemas and tool definitions, update two entry files, and rewrite the test suite. No new npm dependencies are needed — the existing `child_process.spawn()` + Zod + `@modelcontextprotocol/sdk` stack handles everything.

The dominant technical challenge is the **stdout/stderr inversion**: Codex wrote AI output to stderr; Copilot writes it to stdout. Every handler, the exit code logic in `command.ts`, and the progress streaming pattern all embed the Codex assumption. These must be surgically replaced. The second challenge is that `command.ts`'s lenient exit code resolution (`code===0 || stdout || stderr`) treats quota errors and auth failures as successes for Copilot — this must be fixed with a strict-exit-code path.

Shell injection (SEC-02) is largely handled by the existing `spawn()` invocation pattern (no `shell:true` on Unix), but `addDir` path inputs require explicit validation: no null bytes, no `../` traversal segments, absolute paths only.

**Primary recommendation:** Follow the 9-step build order (delete session → types → handlers → definitions → server → index → tests) and fix the stdout/stderr inversion and exit code logic before writing any new handler code.

---

## Standard Stack

### Core (no changes required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.24.0` (existing) | MCP transport + schema types | Official SDK; server.ts uses it unchanged |
| `zod` | `^4.0.17` (existing) | Runtime validation of tool args | Already used; schemas need rewriting |
| `chalk` | `^5.6.0` (existing) | Console logging color | Already used in command.ts |
| `child_process` (built-in) | Node.js 22+ | Spawn `copilot` subprocess | Already used via `executeCommand()` |

### Supporting (no changes required)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ts-jest` | `^29.4.1` (existing) | Run TypeScript tests with Jest | All tests |
| `typescript` | `^5.9.2` (existing) | Type checking | Build step |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `spawn()` (existing) | ACP server mode (`--acp` flag) | ACP uses NDJSON over stdio — incompatible with simple spawn-and-capture; stick with `-p` |
| `executeCommand()` (existing) | execa npm package | execa offers promise-native API but adds a dep; existing utility is sufficient |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── __tests__/
│   ├── index.test.ts          # Rewrite: 4 tools (not 5), new handler classes
│   ├── mcp-stdio.test.ts      # Rewrite: copilot stub (not codex), new tool names
│   ├── error-scenarios.test.ts # Rewrite: Copilot auth/quota errors
│   ├── model-selection.test.ts # Rewrite: Copilot model list
│   ├── default-model.test.ts  # Rewrite: DEFAULT_COPILOT_MODEL = 'gpt-4.1'
│   ├── edge-cases.test.ts     # Rewrite: remove session edges
│   ├── session.test.ts        # DELETE
│   ├── resume-functionality.test.ts  # DELETE
│   └── context-building.test.ts     # DELETE
├── tools/
│   ├── definitions.ts         # Full rewrite: suggest, explain, ask, ping
│   └── handlers.ts            # Full rewrite: 3 new + ping kept
├── session/                   # DELETE entire directory
│   └── storage.ts             # DELETE
├── utils/
│   └── command.ts             # Targeted fix: strictExitCode flag
├── index.ts                   # Update: rename constant + class reference
├── server.ts                  # Update: rename class CodexMcpServer → CopilotMcpServer
├── types.ts                   # Full rewrite: new TOOLS enum, schemas, constants
└── errors.ts                  # Keep as-is
```

### Pattern 1: Stateless Handler — No Constructor Injection

**What:** New handlers have no constructor parameters. Instantiated directly with no shared state.
**When to use:** Always for Phase 1 handlers (session storage is deleted).
**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md
export class SuggestToolHandler {
  async execute(args: unknown, context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    const { prompt, target, model, addDir } = SuggestToolSchema.parse(args);
    const cmdArgs = buildCopilotArgs('-p', buildSuggestPrompt(prompt, target), model, addDir);
    const result = await executeCommand('copilot', cmdArgs, undefined, { strictExitCode: true });
    const response = result.stdout.trim();
    if (!response && result.stderr) {
      throw new ToolExecutionError(TOOLS.SUGGEST, `Copilot error: ${result.stderr}`);
    }
    return { content: [{ type: 'text', text: response || 'No response from Copilot' }] };
  }
}

export const toolHandlers = {
  [TOOLS.SUGGEST]: new SuggestToolHandler(),
  [TOOLS.EXPLAIN]: new ExplainToolHandler(),
  [TOOLS.ASK]: new AskToolHandler(),
  [TOOLS.PING]: new PingToolHandler(),
} as const;
```

### Pattern 2: Prompt Construction as Core Logic

**What:** Each handler builds a natural-language prompt string that drives Copilot; the CLI does not have separate subcommands for suggest/explain/ask.
**When to use:** All three AI tools.
**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md
function buildSuggestPrompt(prompt: string, target?: 'shell' | 'git' | 'gh'): string {
  if (!target) return `Suggest a command to accomplish: ${prompt}`;
  const labels: Record<string, string> = { shell: 'shell', git: 'git', gh: 'GitHub CLI (gh)' };
  return `Suggest a ${labels[target]} command to accomplish: ${prompt}`;
}

function buildExplainPrompt(command: string): string {
  return `Explain what this command does: ${command}`;
}

// ask: pass prompt through directly — no transformation
```

### Pattern 3: Stdout as Primary Response (Inverted from Codex)

**What:** Read `result.stdout` as the canonical response; treat non-empty `result.stderr` with empty `result.stdout` as an error.
**When to use:** All Copilot handlers.
**Example:**
```typescript
// Source: .planning/research/ARCHITECTURE.md
// OLD (Codex) — WRONG for Copilot:
const response = result.stdout || result.stderr || 'No output from Codex';

// NEW (Copilot) — CORRECT:
const response = result.stdout.trim();
if (!response && result.stderr) {
  throw new ToolExecutionError(toolName, `Copilot error: ${result.stderr}`);
}
const finalResponse = response || 'No response from Copilot';
```

### Pattern 4: Base Args Array

**What:** All Copilot invocations share the same base flags as an array constant. Handler-specific args are appended.
**When to use:** Every handler that calls `executeCommand('copilot', ...)`.
**Example:**
```typescript
const COPILOT_BASE_ARGS = [
  '--allow-all-tools',
  '--no-ask-user',
  '--silent',
  '--no-color',
  '--no-auto-update',
] as const;

function buildCopilotArgs(promptFlag: '-p', prompt: string, model?: string, addDir?: string): string[] {
  const args: string[] = [promptFlag, prompt, ...COPILOT_BASE_ARGS];
  if (model) args.push('--model', model);
  if (addDir) args.push('--add-dir', addDir);
  return args;
}
```

### Pattern 5: strictExitCode in executeCommand

**What:** Add an optional `options` parameter to `executeCommand()` with a `strictExitCode` boolean. When true, non-zero exit code always rejects even if stdout/stderr is present.
**When to use:** Copilot handlers pass `{ strictExitCode: true }`; existing Codex behavior (if any) can remain lenient.
**Example:**
```typescript
// In command.ts
export interface ExecuteCommandOptions {
  strictExitCode?: boolean;
}

export async function executeCommand(
  file: string,
  args: string[] = [],
  envOverride?: ProcessEnv,
  options: ExecuteCommandOptions = {}
): Promise<CommandResult> {
  // ...existing spawn setup...
  child.on('close', (code) => {
    if (options.strictExitCode) {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new CommandExecutionError([file, ...args].join(' '), `Command failed with exit code ${code}: ${stderr}`, new Error(stderr)));
    } else {
      // existing lenient logic preserved
      if (code === 0 || stdout || stderr) resolve({ stdout, stderr });
      else reject(new CommandExecutionError(...));
    }
  });
}
```

### Pattern 6: addDir Path Validation (SEC-02)

**What:** Validate `addDir` input before passing to CLI. The `spawn()` args array prevents shell injection for prompts, but `addDir` values should be validated as legitimate filesystem paths.
**When to use:** Any handler that accepts `addDir`.
**Example:**
```typescript
// Source: OpenCode QUORUM review (2026-02-20)
function validateAddDir(addDir: string): void {
  if (addDir.includes('\0')) throw new ValidationError('addDir contains null bytes');
  if (addDir.split('/').includes('..')) throw new ValidationError('addDir must not contain path traversal');
  if (!path.isAbsolute(addDir)) throw new ValidationError('addDir must be an absolute path');
}
```

### Anti-Patterns to Avoid

- **Reading stderr as the AI response:** `result.stderr` is the error channel for Copilot (opposite of Codex). Never use it as the primary response.
- **Keeping session storage "just in case":** Dead code breaks tests and confuses contributors. Delete `src/session/` on the first step.
- **Adding model validation in handlers:** The `copilot` CLI validates `--model` with a clear error. Double-validating at handler level is maintenance burden.
- **Using `gh copilot suggest` / `gh copilot explain`:** These invoke the deprecated extension which returns a deprecation notice with exit 0. The `executeCommand` success heuristic will treat this as a valid response.
- **Omitting `--silent`:** Without it, stderr gets usage stats (`"Total usage est: 1 Premium request"`) on every call.
- **Omitting `--no-auto-update`:** Adds 1-2s latency per tool call for update checks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol | Custom JSON-RPC over stdio | `@modelcontextprotocol/sdk` (existing) | Already integrated; handles handshake, progress notifications, schema validation |
| CLI subprocess execution | Custom spawn wrapper | `executeCommand()` in `src/utils/command.ts` (update, don't replace) | Already handles Windows escaping, buffer limits, error events |
| Input validation | Manual type checks | Zod schemas (existing pattern) | Type-safe at runtime; parse() throws ZodError which becomes ValidationError |
| Shell injection prevention | Manual string sanitization of prompts | `spawn(file, argsArray)` without `shell:true` | On Unix, `execve()` passes args directly — no shell involved, no injection possible |

**Key insight:** The entire existing infrastructure (transport, routing, error handling, command execution) is reusable. Only the tool-specific content changes.

---

## Common Pitfalls

### Pitfall 1: Stdout/Stderr Inversion (Critical)

**What goes wrong:** Handlers return empty string because they read `result.stderr` for the response. Copilot writes to stdout.
**Why it happens:** Multiple comments in `command.ts` and `handlers.ts` say "codex writes output to stderr" — these survive a find-replace but leave logic wrong.
**How to avoid:** After deleting old handlers, grep for `result.stderr` in all new handler files. The only valid use of `result.stderr` in new handlers is as an error signal, not as response content.
**Warning signs:** Tools return empty string; tool returns "Total usage est:" text; tests pass with mocked stdout but fail with real binary.

### Pitfall 2: Lenient Exit Code Masking Errors

**What goes wrong:** Quota errors ("402 You have no quota") and auth errors return exit 1 with stderr content. The existing `code===0 || stdout || stderr` logic resolves these as success, returning the error text as the "response."
**Why it happens:** The comment on line 88 of `command.ts` explicitly says this is intentional for Codex. It is wrong for Copilot.
**How to avoid:** Add `strictExitCode: true` option to `executeCommand()`. All Copilot handlers pass this option.
**Warning signs:** Quota exhaustion returns a message that looks like a valid response; auth failures look like successful AI answers.

### Pitfall 3: `-i` Flag Instead of `-p`

**What goes wrong:** Using `-i`/`--interactive` causes the process to hang waiting for TTY input. Jest tests time out; MCP server appears to hang.
**Why it happens:** Both flags accept a prompt string and look similar. `-i` pre-seeds the TUI session, `-p` is headless.
**How to avoid:** Always use `-p` for non-interactive MCP invocations. Add a unit test that verifies the flag used.
**Warning signs:** Child process never emits `close` event; integration test times out at 10s.

### Pitfall 4: Stats Contamination Without `--silent`

**What goes wrong:** Without `--silent`, stderr contains "Total usage est: 1 Premium request\nAPI time spent: 2s..." after every run. If strict exit code checking is off, these stats can bleed into responses.
**Why it happens:** Stats are emitted unconditionally without the flag.
**How to avoid:** Include `--silent` in `COPILOT_BASE_ARGS`. Verified: with `--silent`, stderr is empty on success.

### Pitfall 5: Model Name Mismatch

**What goes wrong:** `gpt-5.3-codex` is in the Copilot CLI allowlist, but it was the Codex default. Anthropic/Gemini models require prior interactive activation. Using one of those as default causes "Error: Run copilot --model ... in interactive mode" failures.
**Why it happens:** Model list looks similar between CLI versions.
**How to avoid:** Use `gpt-4.1` as `DEFAULT_COPILOT_MODEL`. Update `CODEX_DEFAULT_MODEL_ENV_VAR` to a Copilot-appropriate env var name. Update Zod schema to not enumerate models (let CLI validate with its own enum).
**Warning signs:** Exit code 1 immediately with no network latency; error mentions "interactive mode."

### Pitfall 6: ESM + Jest Import Resolution

**What goes wrong:** Tests fail with "Cannot use import statement in a module" or "Unknown file extension" errors when importing from session storage (being deleted) or if any import path changes.
**Why it happens:** The codebase uses `"type":"module"` (ESM) with `.js` extensions in imports. ts-jest handles this, but mocking with `jest.mock('../session/storage.js')` must be cleaned up when the file is deleted.
**How to avoid:** Delete test files that reference session storage before or simultaneously with deleting `src/session/`. Run `npm run build && npm test` after each major step to catch import errors early.
**Warning signs:** "Module not found" errors for deleted files; "Cannot find module" in Jest output.

### Pitfall 7: Windows `shell:true` Caveat for addDir

**What goes wrong:** On Windows, `command.ts` uses `shell: true` to inherit PATH. This means the args array IS passed through the shell, and `addDir` values containing shell metacharacters could cause issues.
**Why it happens:** `spawn()` on Windows needs `shell: true` for PATH inheritance; existing `escapeArgForWindows()` handles the common cases but may not cover all edge cases.
**How to avoid:** Validate `addDir` as a filesystem path (absolute, no null bytes, no `..` segments) before passing. This is sufficient for all platforms.

---

## Code Examples

Verified patterns from codebase inspection and official sources:

### Types Rewrite (src/types.ts)
```typescript
// Replace TOOLS enum
export const TOOLS = {
  SUGGEST: 'suggest',
  EXPLAIN: 'explain',
  ASK: 'ask',
  PING: 'ping',
} as const;

// Replace model constants
export const DEFAULT_COPILOT_MODEL = 'gpt-4.1' as const;
export const COPILOT_DEFAULT_MODEL_ENV_VAR = 'COPILOT_DEFAULT_MODEL' as const;

// New Zod schemas
export const SuggestToolSchema = z.object({
  prompt: z.string(),
  target: z.enum(['shell', 'git', 'gh']).optional(),
  model: z.string().optional(),
  addDir: z.string().optional(),
});

export const ExplainToolSchema = z.object({
  command: z.string(),
  model: z.string().optional(),
  addDir: z.string().optional(),
});

export const AskToolSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
  addDir: z.string().optional(),
});

// PingToolSchema: keep as-is
// Remove: CodexToolSchema, ReviewToolSchema, HelpToolSchema, ListSessionsToolSchema
// Remove: SandboxMode, AVAILABLE_CODEX_MODELS, getModelDescription
// Keep: ToolResult, ToolDefinition, ToolAnnotations, ServerConfig, CommandResult, ToolHandlerContext, ProgressToken
```

### mcp-stdio.test.ts Stub Update
```typescript
// Old (delete):
function createCodexStub(): string {
  const stubDir = mkdtempSync(path.join(tmpdir(), 'codex-mcp-test-'));
  const stubPath = path.join(stubDir, 'codex');
  // ...
}

// New:
function createCopilotStub(): string {
  const stubDir = mkdtempSync(path.join(tmpdir(), 'copilot-mcp-test-'));
  const stubPath = path.join(stubDir, 'copilot');
  const stubScript = `#!/bin/sh
printf "This is a test response from Copilot\\n"
exit 0
`;
  writeFileSync(stubPath, stubScript, { mode: 0o755 });
  chmodSync(stubPath, 0o755);
  return stubDir;
}
```

### Integration Test Flag Verification (TEST-04)
```typescript
// Verify CLI flags passed correctly
function createCopilotFlagCapturingStub(): string {
  const stubDir = mkdtempSync(path.join(tmpdir(), 'copilot-mcp-test-'));
  const stubPath = path.join(stubDir, 'copilot');
  // Write received args to a temp file for inspection
  const argsFile = path.join(stubDir, 'captured-args.json');
  const stubScript = `#!/bin/sh
printf '%s\\n' "$@" > ${argsFile}
printf "stub response\\n"
exit 0
`;
  writeFileSync(stubPath, stubScript, { mode: 0o755 });
  chmodSync(stubPath, 0o755);
  return stubDir;
}
// Test: after calling a tool, read argsFile and verify --allow-all-tools, --no-ask-user, --silent, --no-color, --no-auto-update are present
```

### executeCommand strictExitCode Option
```typescript
// command.ts: add options parameter (backward-compatible)
export interface ExecuteCommandOptions {
  strictExitCode?: boolean;
}

export async function executeCommand(
  file: string,
  args: string[] = [],
  envOverride?: ProcessEnv,
  options: ExecuteCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // ...existing spawn setup unchanged...

    child.on('close', (code) => {
      if (stderr) {
        console.error(chalk.yellow('Command stderr:'), stderr);
      }

      if (options.strictExitCode) {
        // Strict mode for Copilot: only exit 0 is success
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new CommandExecutionError(
            [file, ...args].join(' '),
            `Command failed with exit code ${code}: ${stderr || 'no error message'}`,
            new Error(stderr || 'Unknown error')
          ));
        }
      } else {
        // Legacy lenient mode (unchanged for backward compat)
        if (code === 0 || stdout || stderr) {
          if (code !== 0 && (stdout || stderr)) {
            console.error(chalk.yellow('Command failed but produced output, using output'));
          }
          resolve({ stdout, stderr });
        } else {
          reject(new CommandExecutionError(
            [file, ...args].join(' '),
            `Command failed with exit code ${code}`,
            new Error(stderr || 'Unknown error')
          ));
        }
      }
    });
    // ...existing error handler unchanged...
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gh copilot suggest -t shell` | `copilot -p "Suggest a shell command to: ..."` | Oct 2025 (deprecation) | gh extension returns deprecation notice with exit 0; standalone binary is the only functional path |
| Session management layer | Stateless per-invocation | Phase 1 | Removes ~400 lines of session code; each tool call is independent |
| stderr as primary response | stdout as primary response | Phase 1 | Codex used stderr; Copilot uses stdout |
| Lenient exit code (`code===0 || stdout || stderr`) | Strict exit code for Copilot (`code===0` only) | Phase 1 | Quota/auth errors now surface as errors instead of responses |
| `CodexMcpServer` class | `CopilotMcpServer` class | Phase 1 | Naming only; no logic change |
| 5 tools (codex, review, ping, help, listSessions) | 4 tools (suggest, explain, ask, ping) | Phase 1 | review/help/listSessions are TUI-only or inapplicable to stateless CLI |

**Deprecated/outdated:**
- `src/session/storage.ts`: Entire file. Copilot CLI is stateless per invocation; session management adds complexity with no benefit in v1.
- `InMemorySessionStorage`: Deleted with the session layer.
- `CODEX_DEFAULT_MODEL_ENV_VAR` / `DEFAULT_CODEX_MODEL`: Replaced with `COPILOT_DEFAULT_MODEL_ENV_VAR` / `DEFAULT_COPILOT_MODEL`.
- `CodexToolSchema`, `ReviewToolSchema`, `HelpToolSchema`, `ListSessionsToolSchema`: All deleted from `types.ts`.
- `SandboxMode` Zod enum: Codex-specific; deleted.

---

## Build Order (Dependency-Safe)

Changing in this order keeps `npm run build` green at each step:

1. **Delete session layer** — `src/session/storage.ts`, `src/session/` directory
2. **Delete session test files** — `session.test.ts`, `resume-functionality.test.ts`, `context-building.test.ts`
3. **Rewrite `src/types.ts`** — new TOOLS enum, schemas, model constants (all other files depend on this)
4. **Update `src/utils/command.ts`** — add `strictExitCode` option (backward-compatible; no callers break)
5. **Rewrite `src/tools/handlers.ts`** — delete 4 old handlers, add SuggestToolHandler, ExplainToolHandler, AskToolHandler; keep PingToolHandler
6. **Rewrite `src/tools/definitions.ts`** — 4 new definitions (suggest, explain, ask, ping)
7. **Update `src/server.ts`** — rename `CodexMcpServer` → `CopilotMcpServer`
8. **Update `src/index.ts`** — update `SERVER_CONFIG.name`, import `CopilotMcpServer`
9. **Rewrite tests** — `index.test.ts`, `mcp-stdio.test.ts`, and remaining test files

---

## Open Questions

1. **`--allow-all-tools` as default vs. opt-in**
   - What we know: Phase 1 requirements (CLI-03) hardcode `--allow-all-tools`. The security risk is that the Copilot agent can run arbitrary shell commands.
   - What's unclear: Whether users of the MCP server expect agent-mode (can execute commands) or Q&A-mode (responses only).
   - Recommendation: Follow CLI-03 as written (hardcode). Document the security implication in the tool description. Phase 2 can revisit if user feedback requests opt-in.

2. **`addDir` validation depth**
   - What we know: `spawn()` args array prevents injection; `addDir` needs path validation.
   - What's unclear: Whether to resolve symlinks, validate existence, or restrict to subdirectories of the working directory.
   - Recommendation: Phase 1 minimum — reject null bytes, reject `..` segments, require absolute path. Phase 2 can add existence checks or directory restrictions.

3. **`ANSI escape code stripping` (CLI-06)**
   - What we know: CLI-06 is mapped to Phase 2. `--no-color` suppresses most ANSI codes, but user config files (`~/.copilot/config.json`) can re-enable them.
   - What's unclear: Whether Phase 1 handlers should strip ANSI as a defensive measure.
   - Recommendation: Phase 1 handlers should NOT strip ANSI — that's Phase 2 scope. `--no-color` is sufficient for clean environments.

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — live CLI testing, `@github/copilot` v0.0.412, 2026-02-20; all binary flags verified
- `.planning/research/ARCHITECTURE.md` — codebase inspection + architecture analysis, 2026-02-20
- `.planning/research/PITFALLS.md` — live CLI testing for all 10 pitfalls, 2026-02-20
- `.planning/codebase/ARCHITECTURE.md` — full codebase layer analysis, 2026-02-20
- `.planning/codebase/STRUCTURE.md` — directory and file inventory, 2026-02-20
- `src/utils/command.ts` — direct inspection of lenient exit code logic (lines 87-104)
- `src/__tests__/mcp-stdio.test.ts` — direct inspection of stub pattern for reuse

### Secondary (MEDIUM confidence)
- OpenCode QUORUM review (2026-02-20) — confirmed all 9 findings; suggested `strictExitCode` flag pattern in `executeCommand()` and `addDir` validation requirements; challenged default model (`gpt-4o` vs `gpt-4.1`); STACK.md live-tested data overrides OpenCode's suggestion

### Tertiary (LOW confidence)
- None

---

## QUORUM Note

**Quorum status:** REDUCED — Gemini unavailable (quota exhausted, resets in ~1h49m from 2026-02-20T17:39 UTC). Claude + OpenCode reached consensus on all substantive findings. One minor disagreement (default model: OpenCode suggested `gpt-4o`; resolved in favor of `gpt-4.1` per HIGH-confidence STACK.md live test data).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing stack verified functional
- Architecture patterns: HIGH — derived directly from codebase inspection + ARCHITECTURE.md
- Pitfalls: HIGH — live CLI testing on `copilot` v0.0.412 and `gh copilot` v1.2.0
- SEC-02 shell injection: HIGH for prompt (spawn args array), MEDIUM for addDir (path validation logic is straightforward but not live-tested)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days; copilot CLI releases frequently but API surface for `-p` mode is stable)
