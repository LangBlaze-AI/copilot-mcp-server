# Architecture Research

**Domain:** MCP Server — GitHub Copilot CLI Integration
**Researched:** 2026-02-20
**Confidence:** HIGH

---

## Standard Architecture

### System Overview

The existing server uses a four-layer request pipeline. The migration preserves this pipeline intact; only the tool handler and schema layers change.

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CLIENT (Claude Code)                  │
│               (stdio: JSON-RPC over stdin/stdout)            │
└────────────────────────┬────────────────────────────────────┘
                         │ CallToolRequest / ListToolsRequest
┌────────────────────────▼────────────────────────────────────┐
│  TRANSPORT + REQUEST HANDLER LAYER  [src/server.ts]          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CopilotMcpServer (rename from CodexMcpServer)       │    │
│  │  - ListToolsRequest → returns toolDefinitions         │    │
│  │  - CallToolRequest  → routes to toolHandlers[name]   │    │
│  │  - ToolHandlerContext (progressToken, sendProgress)   │    │
│  └─────────────────────────────────────────────────────┘    │
│  KEEP AS-IS except class rename and import update            │
└────────────────────────┬────────────────────────────────────┘
                         │ handler.execute(args, context)
┌────────────────────────▼────────────────────────────────────┐
│  TOOL HANDLER LAYER  [src/tools/handlers.ts]                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ SuggestTool  │ │ ExplainTool  │ │  AskToolHandler      │ │
│  │ Handler      │ │ Handler      │ │  (general prompt via  │ │
│  │ (gh copilot  │ │ (gh copilot  │ │   copilot -p flag)   │ │
│  │  suggest -t) │ │  explain)    │ │                      │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │                │                    │             │
│  ┌──────▼────────────────▼────────────────────▼───────────┐ │
│  │           PingToolHandler (unchanged)                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│  FULL REWRITE: delete Codex/Review/Help/ListSessions         │
│  ADD: Suggest, Explain, Ask handlers                         │
└────────────────────────┬────────────────────────────────────┘
                         │ executeCommand('gh', ['copilot', ...])
                         │  OR executeCommand('copilot', ['-p', ...])
┌────────────────────────▼────────────────────────────────────┐
│  COMMAND EXECUTION LAYER  [src/utils/command.ts]             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  executeCommand()          executeCommandStreaming()  │    │
│  │  - spawn() with pipe stdio                           │    │
│  │  - 10MB buffer cap                                   │    │
│  │  - Windows shell escaping                            │    │
│  │  - CommandResult { stdout, stderr }                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  KEEP AS-IS — completely CLI-agnostic                        │
└────────────────────────┬────────────────────────────────────┘
                         │ child_process.spawn()
┌────────────────────────▼────────────────────────────────────┐
│  EXTERNAL CLI                                                │
│  ┌─────────────────────┐  ┌────────────────────────────┐   │
│  │ gh copilot suggest  │  │ copilot -p <prompt>        │   │
│  │ gh copilot explain  │  │  --model <model> -s        │   │
│  └─────────────────────┘  └────────────────────────────┘   │
│  Two binaries in play; see CLI Landscape section below       │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Change Action |
|-----------|----------------|---------------|
| `src/index.ts` | Entry point; instantiates server | Rename `CodexMcpServer` → `CopilotMcpServer`; update name/version constant |
| `src/server.ts` | MCP transport + request routing | Rename class; update imports; no logic change |
| `src/types.ts` | Tool name enum, Zod schemas, shared types | Replace TOOLS enum entries; replace/add Zod schemas; remove Codex-specific constants |
| `src/tools/definitions.ts` | Tool metadata sent to MCP clients | Full rewrite: 3 new tools (suggest, explain, ask) + keep ping |
| `src/tools/handlers.ts` | Business logic per tool | Full rewrite: delete 4 handlers; add 3 new; keep PingToolHandler |
| `src/utils/command.ts` | CLI subprocess execution | Keep as-is |
| `src/errors.ts` | Custom error classes | Keep as-is |
| `src/session/storage.ts` | Session state management | Delete entirely |
| `src/__tests__/session.test.ts` | Session storage tests | Delete |
| `src/__tests__/resume-functionality.test.ts` | Session resume tests | Delete |
| `src/__tests__/context-building.test.ts` | Session context tests | Delete |
| `src/__tests__/index.test.ts` | Integration tests | Rewrite: new tool names/counts |
| `src/__tests__/error-scenarios.test.ts` | Error handling tests | Rewrite: Copilot-specific errors |
| `src/__tests__/model-selection.test.ts` | Model flag tests | Rewrite: Copilot model list |
| `src/__tests__/default-model.test.ts` | Default model tests | Rewrite: Copilot default model |
| `src/__tests__/edge-cases.test.ts` | Edge case tests | Rewrite: remove session edges |
| `src/__tests__/mcp-stdio.test.ts` | Full stdio integration | Rewrite: new tool names, stub binary |

---

## GitHub Copilot CLI Landscape

Two distinct binaries exist. The project must commit to one:

**Option A: `gh copilot` extension (github/gh-copilot v1.2.0)**
- Commands: `gh copilot suggest -t <shell|git|gh> <prompt>` and `gh copilot explain <command>`
- No `ask` subcommand in current version
- Output: written to **stdout** (verified via shell redirect testing)
- Exit code: 0 on success
- Interactive-by-default; non-interactive behavior: outputs deprecation warning to stdout and exits with code 0 when no TTY is detected — rendering it unusable for subprocess capture in the current version
- Status: Marked deprecated by GitHub (2025-09-25 announcement) in favor of github/copilot-cli

**Option B: `copilot` binary (github/copilot-cli v0.0.412)**
- Primary non-interactive flag: `-p <prompt>` (prompt mode, exits after completion)
- Silent flag: `-s` (suppresses stats, outputs only agent response)
- Output: **stdout only** (verified: `copilot -p "..." -s --no-color` → stdout; errors → stderr)
- Exit code: 0 on success, 1 on argument/auth error
- Model selection: `--model <model>` with validated choices (claude-sonnet-4.6, gpt-5.3-codex, etc.)
- Supports: `--resume [sessionId]` for session continuity if needed later

**Recommended: Option B (`copilot` binary)** — it is the replacement for the deprecated extension, supports true non-interactive mode, routes output to stdout, and offers a broader model selection including Claude and Gemini models.

The `suggest` and `explain` concepts from the gh extension map to the new binary as follows:

| Old (gh extension) | New (copilot binary) | MCP Tool Name |
|---|---|---|
| `gh copilot suggest -t shell <task>` | `copilot -p "Suggest a shell command to: <task>" -s` | `suggest` |
| `gh copilot suggest -t git <task>` | `copilot -p "Suggest a git command to: <task>" -s` | `suggest` (with `target` param) |
| `gh copilot suggest -t gh <task>` | `copilot -p "Suggest a gh CLI command to: <task>" -s` | `suggest` (with `target` param) |
| `gh copilot explain <command>` | `copilot -p "Explain this command: <command>" -s` | `explain` |
| (no equivalent) | `copilot -p <prompt> -s` | `ask` |

---

## Recommended Project Structure

The directory layout is unchanged. Only file contents change.

```
src/
├── __tests__/                # Test files — partial rewrites
│   ├── index.test.ts         # Rewrite: new tool names, new handler classes
│   ├── mcp-stdio.test.ts     # Rewrite: stub binary for 'copilot', new tool names
│   ├── error-scenarios.test.ts  # Rewrite: Copilot-specific auth errors
│   ├── model-selection.test.ts  # Rewrite: Copilot model list
│   ├── default-model.test.ts    # Rewrite: Copilot default model
│   ├── edge-cases.test.ts       # Rewrite: remove session edges
│   ├── session.test.ts          # DELETE
│   ├── resume-functionality.test.ts  # DELETE
│   └── context-building.test.ts      # DELETE
├── tools/
│   ├── definitions.ts        # Full rewrite: suggest, explain, ask, ping
│   └── handlers.ts           # Full rewrite: 3 new handlers + Ping (kept)
├── session/
│   └── storage.ts            # DELETE entire directory
├── utils/
│   └── command.ts            # Keep as-is
├── index.ts                  # Rename constant + class reference
├── server.ts                 # Rename class; update imports
├── types.ts                  # Replace TOOLS enum, schemas, constants
└── errors.ts                 # Keep as-is
```

### Structure Rationale

- **`src/session/`:** Deleted. Copilot CLI is stateless per invocation. No in-server session tracking required.
- **`src/tools/handlers.ts`:** Three new handler classes (SuggestToolHandler, ExplainToolHandler, AskToolHandler) plus the existing PingToolHandler. No constructor dependency injection needed — no session storage.
- **`src/tools/definitions.ts`:** Four tool definitions (suggest, explain, ask, ping). The `suggest` tool carries an optional `target` enum parameter (`shell`, `git`, `gh`) matching the gh extension's -t flag semantics.
- **`src/utils/command.ts`:** Unchanged. The abstraction is `executeCommand(file, args)` — swapping `'codex'` for `'copilot'` and changing args is entirely a handler responsibility.

---

## Architectural Patterns

### Pattern 1: Stateless Handler — No Constructor Injection

**What:** New handlers have no constructor parameters. They are instantiated directly.
**When to use:** When the tool requires no shared stateful resources.
**Trade-offs:** Simpler instantiation and testing; no mock injection needed for session storage.

```typescript
// New pattern (Copilot) — no constructor args
export class SuggestToolHandler {
  async execute(args: unknown, context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    const { prompt, target } = SuggestToolSchema.parse(args);
    const cmdArgs = ['-p', buildSuggestPrompt(prompt, target), '-s', '--no-color'];
    const result = await executeCommand('copilot', cmdArgs);
    return { content: [{ type: 'text', text: result.stdout || result.stderr }] };
  }
}

// Tool handler registry — no shared storage instance needed
export const toolHandlers = {
  [TOOLS.SUGGEST]: new SuggestToolHandler(),
  [TOOLS.EXPLAIN]: new ExplainToolHandler(),
  [TOOLS.ASK]: new AskToolHandler(),
  [TOOLS.PING]: new PingToolHandler(),
} as const;
```

### Pattern 2: Prompt Construction as the Core Logic

**What:** Each handler's primary job is to construct an appropriate natural-language prompt string that drives the Copilot CLI, rather than assembling flag-heavy CLI argument arrays.
**When to use:** When the CLI interface is a single `-p` flag and all capability differentiation is in the prompt text.
**Trade-offs:** Prompt wording affects output quality; easier to adjust than adding/removing CLI flags.

```typescript
// suggest handler: wraps prompt to guide Copilot toward a specific target
function buildSuggestPrompt(prompt: string, target?: 'shell' | 'git' | 'gh'): string {
  if (!target) return `Suggest a command to accomplish: ${prompt}`;
  const targetLabel = { shell: 'shell', git: 'git', gh: 'GitHub CLI (gh)' }[target];
  return `Suggest a ${targetLabel} command to accomplish: ${prompt}`;
}

// explain handler: frames the input as a command to be explained
function buildExplainPrompt(command: string): string {
  return `Explain what this command does: ${command}`;
}

// ask handler: pass-through — the prompt is already user-intent text
// no transformation needed
```

### Pattern 3: Output from Stdout (Changed from Codex Stderr Pattern)

**What:** The `copilot` binary in `-p -s` mode writes the agent response to **stdout** and errors to **stderr**. This is the inverse of the Codex CLI, which wrote primary output to stderr.
**When to use:** Always for the Copilot integration.
**Trade-offs:** Cleaner separation; `result.stdout` is the canonical response; `result.stderr` signals errors. Update response-reading logic in handlers accordingly.

```typescript
// Codex pattern (OLD) — checked both stdout and stderr:
const response = result.stdout || result.stderr || 'No output from Codex';

// Copilot pattern (NEW) — stdout is primary; stderr is error signal:
const response = result.stdout.trim() || 'No response from Copilot';
if (!result.stdout && result.stderr) {
  throw new ToolExecutionError(TOOLS.ASK, result.stderr);
}
```

---

## Data Flow

### Request Flow (New)

```
MCP Client sends CallToolRequest { name: 'suggest', arguments: { prompt: '...', target: 'git' } }
    |
    v
server.ts: CallToolRequest handler
    - validates tool name
    - builds ToolHandlerContext (progressToken, sendProgress)
    |
    v
SuggestToolHandler.execute(args, context)
    - SuggestToolSchema.parse(args)           ← Zod validation
    - buildSuggestPrompt(prompt, target)      ← prompt construction
    - executeCommand('copilot', ['-p', prompt, '-s', '--no-color', '--model', model])
    |
    v
src/utils/command.ts: executeCommand()
    - spawn('copilot', args, { stdio: pipe })
    - collects stdout (primary response)
    - collects stderr (error signal)
    - resolves CommandResult { stdout, stderr }
    |
    v
SuggestToolHandler: reads result.stdout as response
    - returns ToolResult { content: [{ type: 'text', text: response }] }
    |
    v
server.ts: returns ToolResult to MCP client via stdout transport
```

### Key Data Flows

1. **suggest flow:** MCP args `{ prompt, target? }` → prompt string built with target label → `copilot -p <prompt> -s --no-color [--model <model>]` → stdout response → ToolResult text
2. **explain flow:** MCP args `{ command }` → prompt `"Explain what this command does: <command>"` → same execution → ToolResult text
3. **ask flow:** MCP args `{ prompt, model? }` → prompt passed through directly → same execution → ToolResult text
4. **error flow:** Non-zero exit or empty stdout with stderr → `CommandExecutionError` → caught by handler → `ToolExecutionError` → caught by server → ToolResult with `isError: true`

### State Management

No session state. Each tool invocation is fully independent:
- No shared Map in handlers
- No TTL management
- No turn history
- `InMemorySessionStorage` class and `src/session/` directory are deleted

---

## Copilot Output Parsing vs Codex Output Parsing

This is a significant behavioral difference that affects how handlers read `CommandResult`.

| Aspect | Codex CLI (old) | Copilot CLI (new) |
|--------|----------------|-------------------|
| Primary response channel | `stderr` (Codex writes output to stderr) | `stdout` (with `-s` flag, response goes to stdout) |
| Error channel | `stdout` (sometimes) | `stderr` |
| Exit code on partial output | 0 even with non-zero context | 1 on argument/auth error; 0 on success |
| Session/conversation ID extraction | Regex on stderr: `/(conversation|session)\s*id\s*:/i` | Not applicable — stateless |
| Thread ID extraction | Regex on stderr: `/thread\s*id\s*:/i` | Not applicable |
| Model validation | At handler level (any string allowed) | At CLI level (enum enforced; invalid model → exit 1 + stderr message) |
| Interactive mode behavior | Requires `--skip-git-repo-check` flag | Use `-p` flag to force non-interactive |

**Critical handler change:** Replace the response-reading line in every handler:

```typescript
// OLD (Codex) — stderr was primary
const response = result.stdout || result.stderr || 'No output from Codex';

// NEW (Copilot) — stdout is primary
const response = result.stdout.trim();
if (!response && result.stderr) {
  throw new ToolExecutionError(toolName, `Copilot error: ${result.stderr}`);
}
const finalResponse = response || 'No response from Copilot';
```

**Note on `executeCommand` success heuristic:** The current `command.ts` resolves on `code === 0 || stdout || stderr`. For Copilot, a non-zero exit with stderr content should be treated as an error (not a partial success). The handler layer should check for this: if `result.stderr` is present and `result.stdout` is empty, surface the error. Alternatively, a narrow fix in `executeCommand` can be gated by a flag, but the current generic approach is sufficient if handlers are defensive.

---

## Build Order

Changes must be made in dependency order to keep the build green throughout:

**Step 1 — Delete session layer** (no dependents will be broken immediately since handlers still exist)
- Delete `src/session/storage.ts` and `src/session/` directory
- Delete `src/__tests__/session.test.ts`, `resume-functionality.test.ts`, `context-building.test.ts`

**Step 2 — Replace types.ts** (all handlers and definitions depend on this)
- Replace `TOOLS` enum: `{ SUGGEST, EXPLAIN, ASK, PING }`
- Remove: `DEFAULT_CODEX_MODEL`, `CODEX_DEFAULT_MODEL_ENV_VAR`, `AVAILABLE_CODEX_MODELS`, `SandboxMode`
- Add: Copilot model list constant, `DEFAULT_COPILOT_MODEL` (e.g., `'gpt-5.3-codex'`)
- Replace schemas: `SuggestToolSchema`, `ExplainToolSchema`, `AskToolSchema`, keep `PingToolSchema`
- Remove: `CodexToolSchema`, `ReviewToolSchema`, `HelpToolSchema`, `ListSessionsToolSchema`
- Keep unchanged: `ToolResult`, `ToolDefinition`, `ToolAnnotations`, `ServerConfig`, `CommandResult`, `ToolHandlerContext`, `ProgressToken`

**Step 3 — Rewrite src/tools/handlers.ts** (depends on types.ts)
- Delete: `CodexToolHandler`, `ReviewToolHandler`, `HelpToolHandler`, `ListSessionsToolHandler`
- Delete: session storage import
- Add: `SuggestToolHandler`, `ExplainToolHandler`, `AskToolHandler`
- Keep: `PingToolHandler` (no changes needed)
- Update: `toolHandlers` registry to 4 entries

**Step 4 — Rewrite src/tools/definitions.ts** (depends on types.ts)
- Replace all definitions with 4 new ones: suggest, explain, ask, ping

**Step 5 — Update src/server.ts** (depends on types.ts and handlers)
- Rename class `CodexMcpServer` → `CopilotMcpServer`
- No routing logic changes required

**Step 6 — Update src/index.ts** (depends on server.ts)
- Update `SERVER_CONFIG.name` to `'copilot-mcp-server'`
- Update import to `CopilotMcpServer`

**Step 7 — Rewrite tests** (depends on all source)
- Rewrite `index.test.ts`: update tool count (4 not 5), new tool names, new handler class names
- Rewrite `mcp-stdio.test.ts`: stub binary named `copilot` not `codex`; new tool names in test calls
- Rewrite `error-scenarios.test.ts`: remove session-related tests; add Copilot auth error cases
- Rewrite `model-selection.test.ts`: Copilot model names
- Rewrite `default-model.test.ts`: new default model constant
- Rewrite `edge-cases.test.ts`: remove session edge cases

**Step 8 — Update package metadata** (no build dependency)
- `package.json`: name, description, bin field if present
- `.mcp.json`: server name key
- `README.md`: tool table, auth instructions, examples

---

## Scaling Considerations

Not applicable to this architecture. The MCP server is a local stdio bridge; it has no concurrent request load or network scaling concerns. Performance is bounded entirely by the `copilot` binary's response latency.

---

## Anti-Patterns

### Anti-Pattern 1: Keeping Session Storage "Just In Case"

**What people do:** Leave `src/session/storage.ts` in place and simply not use it, to allow future reinstatement.
**Why it is wrong:** Dead code in the handler layer confuses future contributors, session test files continue to pass against deleted behavior, and TypeScript imports from a deleted file will fail at build time anyway.
**Do this instead:** Delete the session directory and its tests entirely in Step 1. If session support is reinstated later, it can be re-added cleanly.

### Anti-Pattern 2: Adding Model Validation in the Handler

**What people do:** Copy the model validation logic from Codex (where the handler validated model strings against `AVAILABLE_CODEX_MODELS`) into the Copilot handlers.
**Why it is wrong:** The `copilot` binary validates its own `--model` argument against an enforced enum and returns exit code 1 with a clear error message on invalid input. Double-validating at the handler level is redundant and creates a maintenance burden when new models are added.
**Do this instead:** Pass the model string directly to the CLI. Let the CLI validate it. Catch the resulting `CommandExecutionError` and surface it as a `ToolExecutionError`.

### Anti-Pattern 3: Using the Deprecated gh Extension

**What people do:** Target `gh copilot suggest` / `gh copilot explain` (the old gh extension) because those subcommand names match the tool names in the project requirements.
**Why it is wrong:** The `gh copilot` extension (v1.2.0) detects no-TTY environments and outputs a deprecation warning to stdout instead of running. This means `executeCommand('gh', ['copilot', 'suggest', ...])` will return the deprecation message as the "response" in all CI/headless environments.
**Do this instead:** Use the `copilot` binary with the `-p` flag. Wrap the prompt text to replicate the `suggest`/`explain`/`ask` semantics (see Pattern 2 above).

### Anti-Pattern 4: Reading stderr as the Primary Response

**What people do:** Copy the Codex response-reading pattern (`result.stdout || result.stderr`) into Copilot handlers.
**Why it is wrong:** Codex wrote its response to stderr; Copilot writes it to stdout (with `-s`). Reading stderr as the fallback will surface error messages (auth failures, model validation errors) as successful responses.
**Do this instead:** In Copilot handlers, read `result.stdout` as the primary response. Treat a non-empty `result.stderr` with empty `result.stdout` as an error condition.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `copilot` binary | `child_process.spawn()` via `executeCommand()` | Must be in PATH; installed via github/copilot-cli; no npm dep |
| GitHub auth | Pre-existing user auth via `copilot login` | Server does not manage OAuth; user handles auth before starting server |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| server.ts ↔ handlers.ts | Direct call: `handler.execute(args, context)` | No change from current pattern |
| handlers.ts ↔ command.ts | `executeCommand('copilot', args)` | File arg changes from `'codex'` to `'copilot'` |
| server.ts ↔ types.ts | TOOLS enum for name validation, ToolName type | TOOLS entries change; validation logic unchanged |
| handlers.ts ↔ types.ts | Schema imports, ToolResult type | Schemas replaced; ToolResult type unchanged |

---

## Sources

- Live `gh copilot --help` output (v1.2.0 extension, installed locally)
- Live `copilot --help` output (github/copilot-cli v0.0.412, installed locally)
- Shell redirect tests confirming output channel routing for both binaries
- GitHub deprecation announcement: https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension
- Existing codebase: `src/utils/command.ts`, `src/tools/handlers.ts`, `src/types.ts`

---

*Architecture research for: GitHub Copilot CLI MCP Server integration*
*Researched: 2026-02-20*
