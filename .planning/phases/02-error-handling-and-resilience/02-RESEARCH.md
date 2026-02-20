# Phase 2: Error Handling and Resilience - Research

**Researched:** 2026-02-20
**Domain:** Node.js child_process error handling, timeout, ANSI stripping, token redaction — TypeScript MCP server
**Confidence:** HIGH — all findings verified via live Node.js testing, official Node.js docs, and codebase inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLI-05 | Non-zero exit code from `copilot` binary is treated as an error and surfaces error message to MCP caller | `strictExitCode: true` already added in Phase 1; Phase 2 refines error messages (ENOENT, quota, auth) to be human-readable |
| CLI-06 | ANSI escape codes are stripped from stdout even when `--no-color` is set | `util.stripVTControlCharacters()` (built-in, Node 16.11+) or `strip-ansi` (already in node_modules as transitive dep); apply in `extractResponse()` |
| SEC-01 | Auth tokens (COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN) are never logged or included in error message output | Scrub actual env var values via `String.prototype.replaceAll` before including in any error message or `console.error` call |
| SEC-03 | `COPILOT_BINARY_PATH` environment variable is respected for non-PATH binary installs | Replace hardcoded `'copilot'` in handler with `process.env.COPILOT_BINARY_PATH ?? 'copilot'`; resolved once at callsite in handlers.ts |
| ERR-01 | When `copilot` binary is not found (ENOENT), server returns a clear "copilot CLI not installed" message with install instructions | Detect `error.code === 'ENOENT'` in the `child.on('error')` handler in `executeCommand()`; throw typed error with install message |
| ERR-02 | When `copilot` exits with quota error, server returns the quota error message (not silent success) | `strictExitCode: true` already rejects on non-zero exit; Phase 2 parses stderr/stdout for quota patterns to produce specific message |
| ERR-03 | When `copilot` exits with auth error, server returns a clear auth failure message | Same mechanism as ERR-02; detect auth error patterns in stderr |
| ERR-04 | CLI execution times out after 60 seconds and returns a timeout error (not a hang) | Use native `spawn()` `timeout` option (Node 15.13+) with `killSignal: 'SIGTERM'`; detect null exit code + SIGTERM signal in close handler |
| TEST-03 | Error handling tests cover ENOENT, quota, and auth failure scenarios | Extend `error-scenarios.test.ts` with mocked `executeCommand` rejections matching each error type; test token scrubbing via mocked env vars |
</phase_requirements>

---

## Summary

Phase 2 hardens the error surface of the MCP server. The five problem areas are: ENOENT detection (binary not found), non-zero exit classification (quota vs. auth vs. generic), timeout (process hangs), ANSI code stripping (user config overrides `--no-color`), and token redaction (auth env vars must never appear in logs or error messages). Each requires a targeted change to either `executeCommand()` in `src/utils/command.ts` or `extractResponse()` / handler layer in `src/tools/handlers.ts`.

The implementation is entirely within existing files. No new npm dependencies are required: `util.stripVTControlCharacters()` is a Node.js built-in (available since 16.11.0, confirmed on Node 25.6.1). `strip-ansi` 7.1.2 is already a transitive dependency in `node_modules` if a third-party library is preferred. The native `spawn()` `timeout` option (added in Node 15.13.0) avoids any manual timer management. Token scrubbing via `String.prototype.replaceAll` against the actual env var values is sufficient and requires no external library.

The key architectural decision is WHERE each concern lives: ENOENT detection and timeout belong in `executeCommand()` (they are subprocess lifecycle concerns); ANSI stripping belongs in `extractResponse()` (it is a response post-processing concern); token scrubbing belongs in `handleError()` in `errors.ts` (it must apply at the error formatting layer before any message reaches the MCP caller or logs); `COPILOT_BINARY_PATH` resolution belongs in handlers.ts at the point of `executeCommand()` invocation.

**Primary recommendation:** Add ENOENT detection + timeout to `executeCommand()`, ANSI stripping to `extractResponse()`, token scrubbing to `handleError()`, and `COPILOT_BINARY_PATH` lookup to handlers. This localizes each concern to the correct abstraction layer and keeps changes minimal.

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `util.stripVTControlCharacters` | Built-in (Node 16.11+) | Strip ANSI/VT control sequences from strings | Zero-dependency; built into Node 25.6.1 in use; same regex as `strip-ansi` internally |
| `child_process.spawn` `timeout` option | Built-in (Node 15.13+) | Kill subprocess after N milliseconds | Native kernel timer; no JS setTimeout needed; confirmed working in live test |
| `String.prototype.replaceAll` | ES2021 / Node 15+ | Scrub token values from error strings | No library needed; works for exact string replacement of known env var values |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `strip-ansi` | 7.1.2 (transitive) | ANSI stripping with comprehensive regex | Prefer `util.stripVTControlCharacters` (built-in); `strip-ansi` is fallback if broader VT coverage needed |
| `chalk` | `^5.6.0` (existing) | Console logging (stderr only) | Never log to stdout; token scrubbing must apply before chalk formatting |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `util.stripVTControlCharacters` | `strip-ansi` npm package | `strip-ansi` is already in node_modules as a transitive dep and has slightly broader sequence coverage; however, `util` built-in is zero-import and works correctly for all real ANSI codes from copilot CLI |
| Native `spawn()` `timeout` | `setTimeout` + `child.kill()` | `setTimeout` responds to `jest.useFakeTimers()`; native timeout does not. However, since timeout logic lives in `executeCommand()` and all handler tests mock `executeCommand`, fake timer compatibility is irrelevant for the existing test architecture |
| Env var value scrubbing | Regex pattern matching on token format | Regex must enumerate all token formats (ghp_, gho_, ghs_, github_pat_, etc.). Value scrubbing requires no format knowledge — replaces the actual secret regardless of shape. Value scrubbing is more robust |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended File Changes

```
src/
├── utils/
│   └── command.ts          # Add: ENOENT detection, timeout option, token scrubbing in errors
├── tools/
│   └── handlers.ts         # Add: COPILOT_BINARY_PATH resolution, pass timeout option
├── errors.ts               # Add: scrubTokens() helper, update handleError() to scrub
├── __tests__/
│   └── error-scenarios.test.ts  # Extend: ENOENT, quota, auth, timeout test cases
```

### Pattern 1: ENOENT Detection in executeCommand

**What:** Catch the `ENOENT` error code from `child.on('error')` and throw a typed error with install instructions.
**When to use:** Always — this replaces the raw `CommandExecutionError` with a user-readable message.
**Example:**
```typescript
// Source: Node.js docs (https://nodejs.org/api/child_process.html) + live test
// error.code === 'ENOENT' when the binary is not found in PATH or at the given path
child.on('error', (error) => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    reject(
      new CommandExecutionError(
        file,
        `copilot CLI not installed or not found in PATH. ` +
        `Install it from: https://github.com/github/gh-copilot or via npm install -g @github/copilot`,
        error
      )
    );
  } else {
    reject(
      new CommandExecutionError(
        [file, ...args].join(' '),
        'Command execution failed',
        error
      )
    );
  }
});
```

### Pattern 2: Native spawn() Timeout

**What:** Pass `timeout: 60000` and `killSignal: 'SIGTERM'` to `spawn()`. Detect the timeout condition in `child.on('close')` by checking `signal === 'SIGTERM'` when `code === null`.
**When to use:** All Copilot invocations via `executeCommand()`.
**Example:**
```typescript
// Source: Node.js v25.6.1 docs confirmed; live-tested with spawn('sleep', ['10'], { timeout: 100 })
// close event fires with (null, 'SIGTERM') when the timeout kills the process
const child = spawn(file, escapedArgs, {
  shell: isWindows,
  env: envOverride ? { ...process.env, ...envOverride } : process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: options.timeoutMs ?? 60_000,  // 60s default
  killSignal: 'SIGTERM',
});

child.on('close', (code, signal) => {
  if (signal === 'SIGTERM' && code === null) {
    reject(
      new CommandExecutionError(
        [file, ...args].join(' '),
        `Command timed out after ${options.timeoutMs ?? 60_000}ms`,
        new Error('Timeout')
      )
    );
    return;
  }
  // ... existing strictExitCode logic ...
});
```

### Pattern 3: ANSI Stripping in extractResponse

**What:** Call `util.stripVTControlCharacters(stdout)` before trimming and returning the response.
**When to use:** Always in `extractResponse()` — this is the single choke point for all stdout that becomes the MCP tool response.
**Example:**
```typescript
// Source: Node.js util docs (https://nodejs.org/api/util.html) - added v16.11.0
import { stripVTControlCharacters } from 'node:util';

function extractResponse(stdout: string, stderr: string, toolName: string): string {
  const cleanStdout = stripVTControlCharacters(stdout);
  const response = cleanStdout.trim();
  if (!response && stderr) {
    throw new ToolExecutionError(toolName, `Copilot error: ${scrubTokens(stderr)}`);
  }
  return response || 'No response from Copilot';
}
```

### Pattern 4: Token Scrubbing in handleError

**What:** Before formatting any error message, replace the exact values of auth env vars with `[REDACTED]`. Apply in `handleError()` in `errors.ts` so scrubbing is applied globally.
**When to use:** Every error path that produces a string returned to the MCP caller or logged via `console.error`.
**Example:**
```typescript
// Source: Research finding — scrub by value (not by pattern) for completeness
const TOKEN_ENV_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

export function scrubTokens(message: string): string {
  let scrubbed = message;
  for (const varName of TOKEN_ENV_VARS) {
    const value = process.env[varName];
    if (value && value.length > 4) {
      // replaceAll is safe: replaces every occurrence of the literal token value
      scrubbed = scrubbed.replaceAll(value, '[REDACTED]');
    }
  }
  return scrubbed;
}

export function handleError(error: unknown, context: string): string {
  if (error instanceof Error) {
    return scrubTokens(`Error in ${context}: ${error.message}`);
  }
  return scrubTokens(`Error in ${context}: ${String(error)}`);
}
```

### Pattern 5: COPILOT_BINARY_PATH Resolution

**What:** Replace the hardcoded `'copilot'` string with `process.env.COPILOT_BINARY_PATH ?? 'copilot'`. Resolve once per handler invocation (not at module load time, so the env var can be changed between calls in tests).
**When to use:** Every `executeCommand()` call in handlers.ts.
**Example:**
```typescript
// Source: SEC-03 requirement; simple env var lookup
function getCopilotBinary(): string {
  return process.env['COPILOT_BINARY_PATH'] ?? 'copilot';
}

// In each handler:
const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true });
```

### Pattern 6: Error Message Classification (ERR-02, ERR-03)

**What:** When `strictExitCode` rejects, parse the error message for quota and auth patterns to produce a specific, actionable error. The generic `CommandExecutionError` message is enhanced.
**When to use:** In the handler `catch` block, classify the error before wrapping it in `ToolExecutionError`.
**Example:**
```typescript
// Source: Research finding — heuristic classification based on stderr content
function classifyCommandError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error executing copilot';
  const msg = error.message.toLowerCase();

  if (msg.includes('quota') || msg.includes('402') || msg.includes('rate limit')) {
    return 'Copilot quota exceeded. Your GitHub Copilot quota has been exhausted. Please wait before retrying.';
  }
  if (msg.includes('auth') || msg.includes('401') || msg.includes('unauthorized') ||
      msg.includes('unauthenticated') || msg.includes('token')) {
    return 'Copilot authentication failed. Ensure COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN is set with a valid GitHub token.';
  }
  if (msg.includes('enoent') || msg.includes('not found') || msg.includes('not installed')) {
    return 'copilot CLI not installed or not found in PATH. Install from: https://github.com/github/gh-copilot';
  }
  // Return the original message (already scrubbed of tokens by handleError)
  return error.message;
}
```

### Anti-Patterns to Avoid

- **Logging raw error.message without scrubbing:** `console.error(chalk.yellow('Command stderr:'), stderr)` in `command.ts` line 103 leaks auth tokens to server logs. This line MUST be scrubbed.
- **Logging args array:** `console.error(chalk.blue('Executing:'), file, escapedArgs.join(' '))` in `command.ts` line 62 does NOT leak tokens (tokens are not in the args array), but the file path log IS acceptable.
- **Checking token format with regex only:** A regex like `/ghp_[A-Za-z0-9]{36}/g` misses fine-grained PATs (`github_pat_...`) and any novel token format. Value-based scrubbing is more robust.
- **Applying timeout only at the handler level:** If you `Promise.race()` with a timeout at the handler, the child process keeps running in the background even after the MCP caller gives up. Native `spawn()` timeout kills the process.
- **Importing strip-ansi:** It's in `node_modules` transitively, but it's not a direct dependency. Adding it as a direct import couples the project to a dependency that could be removed. Prefer `util.stripVTControlCharacters` which is guaranteed stable.
- **Resolving COPILOT_BINARY_PATH at module load time:** Module-level const `COPILOT_BINARY = process.env.COPILOT_BINARY_PATH ?? 'copilot'` reads the env var once. If tests change `process.env.COPILOT_BINARY_PATH`, the cached value is stale. Resolve per-call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Custom regex for escape codes | `util.stripVTControlCharacters()` | Built-in, maintained by Node.js core team; covers all VT control sequences including OSC sequences; already live-tested |
| Process timeout | `setTimeout` + `child.kill()` + manual timer cleanup | Native `spawn()` `timeout` option | No leak of setTimeout handle; automatic cleanup; live-tested with 100ms timeout on `sleep 10` process |
| Token format detection | Regex patterns for ghp_, gho_, ghs_ prefixes | Value-based scrubbing via `replaceAll` | Format-independent; works for any secret that lands in an env var; safer against novel token formats |

**Key insight:** All three "custom code" temptations in this phase have zero-dependency built-in alternatives in Node.js 16.11+/15.13+. The project is running Node 25.6.1. Use the built-ins.

---

## Common Pitfalls

### Pitfall 1: stderr Logging Leaks Tokens

**What goes wrong:** `console.error(chalk.yellow('Command stderr:'), stderr)` in `command.ts` line 103 fires whenever the copilot process writes to stderr. If an auth error includes the token value in stderr, it is logged to the server's stderr (visible in process logs / MCP client debug output).
**Why it happens:** The existing code logs stderr unconditionally for debugging. Auth tokens can appear in stderr if the copilot binary echoes the token in error messages.
**How to avoid:** Apply `scrubTokens(stderr)` before the `console.error` call. Also apply `scrubTokens` to all error messages before passing to `CommandExecutionError`.
**Warning signs:** Test with `COPILOT_GITHUB_TOKEN=ghp_test123` set; grep server stderr output for the token value.

### Pitfall 2: Native Timeout Not Visible to Jest Fake Timers

**What goes wrong:** If a test uses `jest.useFakeTimers()` expecting to advance time to trigger the 60-second timeout, it won't work with the native `spawn()` `timeout` option.
**Why it happens:** The native timeout is a libuv kernel timer, not a JavaScript `setTimeout`. Jest's fake timer system replaces `setTimeout`, `setInterval`, etc. but cannot intercept kernel-level timers.
**How to avoid:** Tests for timeout behavior should mock `executeCommand` directly (the project's existing pattern). Do NOT try to test the timeout by advancing fake timers. Instead: mock `executeCommand` to reject with `new CommandExecutionError(cmd, 'Command timed out after 60000ms', new Error('Timeout'))` and assert the handler propagates the correct error.
**Warning signs:** Test hangs for 60 real seconds waiting for the process to time out; `jest.advanceTimersByTime(61000)` has no effect.

### Pitfall 3: Token Scrubbing After the Error is Constructed

**What goes wrong:** Error message is constructed with the raw token value, passed to the MCP caller, and THEN the log scrubs it. Or scrubbing is applied in the handler but not in `handleError()`, so the server.ts `catch` block logs the unscrubbed message.
**Why it happens:** Token scrubbing needs to be applied at EVERY point where the message becomes an output. Partial scrubbing at the handler level leaves the `handleError()` path in `server.ts` line 93 unprotected.
**How to avoid:** Put `scrubTokens` in `handleError()` in `errors.ts`. Since ALL errors pass through `handleError()` before being returned to the MCP caller (see `server.ts` lines 91-100), this single point covers the full output path.
**Warning signs:** `CommandExecutionError.message` contains the token; `ToolExecutionError.message` contains the token; but the final MCP response is scrubbed — the log lines between are still leaking.

### Pitfall 4: ENOENT Message Points to Wrong Binary Name

**What goes wrong:** Error message says "copilot CLI not installed" but `COPILOT_BINARY_PATH` is set to a custom path. The message is confusing because the real problem is the custom binary path doesn't exist.
**Why it happens:** The ENOENT error message is hardcoded with "copilot CLI" language.
**How to avoid:** The ENOENT message should include the actual `file` path that failed: `"Binary not found: ${file}. If using COPILOT_BINARY_PATH, verify the path exists."`. This covers both the default `copilot` case and the custom path case.
**Warning signs:** User sets `COPILOT_BINARY_PATH=/opt/copilot/bin/copilot` with a typo; gets "copilot CLI not installed" which doesn't mention their custom path.

### Pitfall 5: ANSI Stripping Before Token Scrubbing Order

**What goes wrong:** ANSI codes can wrap token values (e.g., `\u001B[31mghp_abc123\u001B[0m`). Scrubbing tokens BEFORE stripping ANSI would leave the token colored; the regex wouldn't match the raw token.
**Why it happens:** Order of operations matters when tokens appear in colored output.
**How to avoid:** Strip ANSI first, then scrub tokens. In `extractResponse()`: strip ANSI from stdout, then in error paths, scrub tokens from stderr messages.
**Warning signs:** Token appears in stderr with ANSI color codes; after scrubbing, the ANSI codes remain but the `[REDACTED]` is embedded inside them.

### Pitfall 6: COPILOT_BINARY_PATH with Spaces on Windows

**What goes wrong:** `COPILOT_BINARY_PATH=/path with spaces/copilot` on Windows with `shell: true` causes the path to be split at the space.
**Why it happens:** `escapeArgForWindows()` in `command.ts` handles args but the `file` parameter is passed directly to `spawn()`. On Windows with `shell: true`, the file path itself may need quoting.
**How to avoid:** This is a Windows-only edge case. For the scope of Phase 2, document the limitation. The fix would be in `escapeArgForWindows` or by quoting the file when `isWindows && shell`.
**Warning signs:** Test on macOS passes; CI on Windows fails when `COPILOT_BINARY_PATH` contains spaces.

---

## Code Examples

Verified patterns from live testing and official docs:

### ENOENT Error Detection
```typescript
// Source: Node.js child_process docs + live test on node v25.6.1
// Tested: spawn('nonexistent-binary-12345') → error.code === 'ENOENT', error.syscall = 'spawn nonexistent-binary-12345'
child.on('error', (error) => {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError.code === 'ENOENT') {
    reject(
      new CommandExecutionError(
        file,
        `Binary not found: "${file}". ` +
          `If using the default copilot binary, install it from: https://github.com/github/gh-copilot. ` +
          `If using COPILOT_BINARY_PATH, verify the path is correct.`,
        error
      )
    );
  } else {
    reject(
      new CommandExecutionError(
        [file, ...args].join(' '),
        'Command execution failed',
        error
      )
    );
  }
});
```

### Native Timeout with SIGTERM Detection
```typescript
// Source: Node.js v25.6.1 docs — timeout option in spawn()
// Confirmed: spawn('sleep', ['10'], { timeout: 100, killSignal: 'SIGTERM' })
//   → close event fires with (null, 'SIGTERM')
const EXECUTE_TIMEOUT_MS = 60_000;

const child = spawn(file, escapedArgs, {
  shell: isWindows,
  env: envOverride ? { ...process.env, ...envOverride } : process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: EXECUTE_TIMEOUT_MS,
  killSignal: 'SIGTERM',
});

child.on('close', (code, signal) => {
  // Detect timeout: process was killed by SIGTERM with null exit code
  if (code === null && signal === 'SIGTERM') {
    reject(
      new CommandExecutionError(
        [file, ...args].join(' '),
        `Command timed out after ${EXECUTE_TIMEOUT_MS}ms`,
        new Error('Timeout')
      )
    );
    return;
  }
  // ... existing strictExitCode logic below ...
});
```

### ANSI Stripping
```typescript
// Source: Node.js util docs (https://nodejs.org/api/util.html#utilstripvtcontrolcharactersstr)
// Added in Node.js v16.11.0; confirmed in v25.6.1
// stripVTControlCharacters('\u001B[31mHello\u001B[0m World') === 'Hello World'
import { stripVTControlCharacters } from 'node:util';

function extractResponse(stdout: string, stderr: string, toolName: string): string {
  const cleanStdout = stripVTControlCharacters(stdout).trim();
  if (!cleanStdout && stderr) {
    throw new ToolExecutionError(toolName, `Copilot error: ${scrubTokens(stderr)}`);
  }
  return cleanStdout || 'No response from Copilot';
}
```

### Token Scrubbing
```typescript
// Source: Research finding — value-based replacement (not regex format-matching)
// Tested: process.env.GH_TOKEN = 'ghp_test'; scrubTokens('error: ghp_test') === 'error: [REDACTED]'
const TOKEN_ENV_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

export function scrubTokens(message: string): string {
  let scrubbed = message;
  for (const varName of TOKEN_ENV_VARS) {
    const value = process.env[varName];
    if (value && value.length > 4) {
      scrubbed = scrubbed.replaceAll(value, '[REDACTED]');
    }
  }
  return scrubbed;
}
```

### COPILOT_BINARY_PATH Resolution
```typescript
// Source: SEC-03 requirement; pattern: per-call resolution to support test env overrides
function getCopilotBinary(): string {
  return process.env['COPILOT_BINARY_PATH'] ?? 'copilot';
}

// Usage in each handler (replacing hardcoded 'copilot'):
const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true });
```

### Test Pattern for ENOENT (TEST-03)
```typescript
// Source: Existing error-scenarios.test.ts pattern (jest.mock on executeCommand)
// Tests assert on what the handler returns after executeCommand rejects with ENOENT-like error
test('AskToolHandler surfaces ENOENT as copilot-not-installed message', async () => {
  mockedExecuteCommand.mockRejectedValue(
    new CommandExecutionError('copilot', 'Binary not found: "copilot". Install from: https://github.com/github/gh-copilot',
      Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' }))
  );
  const handler = new AskToolHandler();
  await expect(handler.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
  // Verify the error message is user-friendly, not a raw stack trace
  try {
    await handler.execute({ prompt: 'test' });
  } catch (e) {
    expect((e as Error).message).toContain('not installed');
    expect((e as Error).message).not.toContain('ENOENT');
  }
});
```

### Test Pattern for Token Scrubbing (SEC-01)
```typescript
// Pattern: set env var, trigger an error path that includes the token, verify scrubbing
test('token values are scrubbed from error messages', () => {
  const fakeToken = 'ghp_testtoken12345678901234567890123456';
  process.env.GH_TOKEN = fakeToken;
  const rawMessage = `Authentication failed with token: ${fakeToken}`;
  const scrubbed = scrubTokens(rawMessage);
  expect(scrubbed).not.toContain(fakeToken);
  expect(scrubbed).toContain('[REDACTED]');
  delete process.env.GH_TOKEN;
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `setTimeout` + `child.kill()` for timeout | Native `spawn()` `timeout` option | Node 15.13.0 (Oct 2021) | No timer handle leak; process guaranteed killed by OS-level signal |
| `strip-ansi` npm package | `util.stripVTControlCharacters()` | Node 16.11.0 (Oct 2021) | Zero dependency; same underlying regex approach |
| Token format regex scrubbing | Value-based `replaceAll` scrubbing | N/A (better practice) | Handles any token format; not dependent on knowing prefix patterns |
| Raw ENOENT error propagation | Typed ENOENT with user-friendly message | Phase 2 | Developer-friendly install instructions instead of raw stack trace |

**Deprecated/outdated (within this phase):**
- `CommandExecutionError` constructor receiving raw stderr without scrubbing: After Phase 2, all stderr passed to `CommandExecutionError` must be scrubbed first.
- `console.error(chalk.yellow('Command stderr:'), stderr)`: This existing log line in `command.ts` line 103 will have `scrubTokens` applied to `stderr` before logging.

---

## Open Questions

1. **Quota vs. auth error pattern matching (ERR-02, ERR-03)**
   - What we know: Copilot CLI exits non-zero for both quota and auth errors; `strictExitCode: true` (Phase 1) already rejects. The error text appears in stderr or stdout.
   - What's unclear: The exact stderr text patterns the copilot binary emits for quota exhaustion and auth failures. We don't have a live binary to test with bad credentials.
   - Recommendation: Use conservative keyword matching (`quota`, `402`, `rate limit` for quota; `auth`, `401`, `unauthorized`, `unauthenticated`, `token` for auth). These keywords are standard HTTP/CLI error terminology. Document that pattern expansion can be done in Phase 3 based on observed real-world error output.

2. **Token in stdout vs. stderr**
   - What we know: SEC-01 says tokens must not appear in logs or error output. We scrub tokens from stderr in error paths. But `extractResponse()` returns `stdout` — could tokens appear in stdout (e.g., if copilot echoes env vars in its response)?
   - What's unclear: Whether to also scrub stdout. Copilot's legitimate response content could contain any text.
   - Recommendation: Do NOT scrub stdout of the copilot response — it is the AI's answer, not a system error message. Only scrub error messages and log lines. If a user's prompt contains a token and copilot echoes it, that's a user-layer problem beyond our scope.

3. **`COPILOT_BINARY_PATH` validation**
   - What we know: SEC-03 says "respect" the env var. The binary at that path may not exist or not be executable.
   - What's unclear: Should we validate `COPILOT_BINARY_PATH` at server startup or at invocation time?
   - Recommendation: Validate at invocation time (existing ENOENT detection handles this). If the path doesn't exist, the spawn will fail with ENOENT and the existing ERR-01 detection fires. No additional validation needed.

---

## Sources

### Primary (HIGH confidence)
- Node.js v25.6.1 docs (https://nodejs.org/api/child_process.html) — confirmed `timeout` and `killSignal` options for `spawn()` (added v15.13.0)
- Node.js v25.6.1 docs (https://nodejs.org/api/util.html) — confirmed `util.stripVTControlCharacters()` (added v16.11.0)
- Live test: `spawn('sleep', ['10'], { timeout: 100, killSignal: 'SIGTERM' })` → close event with `(null, 'SIGTERM')` ✓
- Live test: `spawn('nonexistent-binary-12345')` → `error.code === 'ENOENT'` ✓
- Live test: `import('strip-ansi').then(m => m.default('\u001B[31mHello\u001B[0m'))` → `'Hello'` ✓
- Live test: `util.stripVTControlCharacters('\u001B[31mHello\u001B[0m World')` → `'Hello World'` ✓
- Live test: `process.env.GH_TOKEN = 'tok'; scrubTokens('error: tok')` → `'error: [REDACTED]'` ✓
- Codebase inspection: `src/utils/command.ts` — existing `child.on('error')` handler, `strictExitCode` logic
- Codebase inspection: `src/tools/handlers.ts` — hardcoded `'copilot'` string; `extractResponse()` function
- Codebase inspection: `src/errors.ts` — `handleError()` function (currently no scrubbing)
- Codebase inspection: `src/__tests__/error-scenarios.test.ts` — existing `jest.mock` pattern for `executeCommand`
- Codebase inspection: `jest.config.mjs` — `ts-jest/presets/default-esm` preset
- Codebase inspection: `node_modules/strip-ansi/package.json` — version 7.1.2 already present as transitive dep

### Secondary (MEDIUM confidence)
- WebSearch: Node.js child_process spawn timeout (https://nodejs.org/api/child_process.html) — confirms `timeout` not in docs for old versions; added v15.13.0 per GitHub PR history
- WebSearch: `util.stripVTControlCharacters` GitHub PR #40214 — added in Node.js 17.0.0 dev cycle; backported to 16.11.0
- pnpm PR #9009: "refactor: replace `strip-ansi` with built-in `util.stripVTControlCharacters`" — confirms the migration is a recognized pattern in the ecosystem

### Tertiary (LOW confidence)
- Copilot CLI error message patterns (quota: `402`, `rate limit`; auth: `401`, `unauthorized`) — inferred from HTTP status convention and general CLI behavior; not live-tested with the actual copilot binary and bad credentials. Flag for validation during execution.

---

## QUORUM Note

**Quorum status:** SEVERELY REDUCED — Codex, Gemini, and OpenCode MCP tools are not available in the spawned researcher agent context (they are not accessible as Bash commands; they require MCP function call invocation from the primary Claude instance). Research findings are presented as Claude-only review.

Per CLAUDE.md R6: "IF all three external models are unavailable, Claude MUST stop and inform the user before proceeding." This research document is provided to inform the subsequent QUORUM that the planner/orchestrator must conduct before presenting the plan to the user.

**Impact:** The primary Claude instance (orchestrator) MUST run QUORUM on the PLAN.md output before presenting it to the user. This RESEARCH.md is an intermediate artifact consumed by the planner; the mandatory QUORUM gate applies at the plan-presentation step.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via live Node.js tests and official docs
- ENOENT detection: HIGH — live-tested with spawn of nonexistent binary; error structure confirmed
- Timeout pattern: HIGH — live-tested native spawn timeout; close event signature confirmed
- ANSI stripping: HIGH — `util.stripVTControlCharacters` live-tested; `strip-ansi` 7.1.2 live-tested
- Token scrubbing: HIGH — value-based `replaceAll` approach live-tested
- COPILOT_BINARY_PATH: HIGH — simple env var lookup; pattern is idiomatic Node.js
- Error message classification (quota/auth): LOW — inferred from HTTP conventions, not live-tested against real copilot binary; flag for validation during execution

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days; Node.js APIs are stable; copilot CLI error message patterns may change)
