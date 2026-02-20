---
phase: 02-error-handling-and-resilience
plan: "01"
status: complete
completed: 2026-02-20
tests_before: 42
tests_after: 42
build: pass
---

# Plan 02-01 Summary: Harden errors.ts, command.ts, handlers.ts

## What Was Done

Three source files hardened against all Phase 2 failure modes.

### Task 1: errors.ts — scrubTokens() and handleError()

- Added `TOKEN_ENV_VARS` const listing `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`
- Added exported `scrubTokens(message: string): string` function that replaces live env var token values with `[REDACTED]`; guard `value.length > 4` prevents short/empty string corruption
- Updated `handleError()` to apply `scrubTokens()` before returning (SEC-01)

### Task 2: command.ts — ENOENT detection, native timeout, scrubbed stderr log

- Added `import { CommandExecutionError, scrubTokens } from '../errors.js'`
- Added `EXECUTE_TIMEOUT_MS = 60_000` module-level constant (ERR-04)
- Added `timeout: EXECUTE_TIMEOUT_MS, killSignal: 'SIGTERM'` to `spawn()` options
- Updated `child.on('close', (code, signal)` — detects `(null, 'SIGTERM')` and rejects with `CommandExecutionError` carrying timeout message before strictExitCode block
- Updated `child.on('error', ...)` — detects `ENOENT` via `NodeJS.ErrnoException.code` and rejects with user-friendly install instructions message including the actual `file` path
- Updated `console.error` stderr log line to `scrubTokens(stderr)` (SEC-01)
- `executeCommandStreaming` untouched (not used by Copilot handlers)

### Task 3: handlers.ts — getCopilotBinary(), ANSI stripping, error classification

- Added `import { stripVTControlCharacters } from 'node:util'`
- Added `scrubTokens` to existing errors import
- Added `getCopilotBinary()` helper (per-call `process.env['COPILOT_BINARY_PATH'] ?? 'copilot'`) after `COPILOT_BASE_ARGS` (SEC-03)
- Added `classifyCommandError(error: unknown): string` — classifies quota (402/rate limit), auth (401/unauthorized/unauthenticated/token), ENOENT/not found, timeout, generic with scrub (CLI-05, ERR-01, ERR-02, ERR-03)
- Updated `extractResponse()` to call `stripVTControlCharacters(stdout).trim()` before trimming; applies `scrubTokens(stderr)` in error branch (CLI-06)
- All three AI handlers (`AskToolHandler`, `SuggestToolHandler`, `ExplainToolHandler`) updated: `executeCommand(getCopilotBinary(), ...)` replaces hardcoded `'copilot'`; catch blocks use `classifyCommandError(error)` as the `ToolExecutionError` message
- `PingToolHandler` unchanged

## Verification

- `npm run build` — exits 0, zero TypeScript errors
- `npm test` — 42/42 tests pass, zero regressions
- All 9 requirement grep checks pass
- Zero hardcoded `executeCommand('copilot', ...)` calls remaining in handlers.ts

## Requirements Satisfied

- CLI-05: `classifyCommandError()` in all three AI handler catch blocks
- CLI-06: `stripVTControlCharacters()` in `extractResponse()`
- SEC-01: `scrubTokens()` in `handleError()` and on stderr log line
- SEC-03: `getCopilotBinary()` per-call lookup; `COPILOT_BINARY_PATH` env var respected
- ERR-01: ENOENT detection with install instructions in `command.ts`
- ERR-02: Quota classification in `classifyCommandError()`
- ERR-03: Auth classification in `classifyCommandError()`
- ERR-04: Native `timeout: 60_000` in `spawn()`; SIGTERM detection in close handler
