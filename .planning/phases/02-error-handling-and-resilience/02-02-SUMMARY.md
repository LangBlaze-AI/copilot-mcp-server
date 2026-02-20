---
phase: 02-error-handling-and-resilience
plan: "02"
status: complete
completed: 2026-02-20
tests_before: 42
tests_after: 51
build: pass
---

# Plan 02-02 Summary: Extend error-scenarios.test.ts with Phase 2 Tests

## What Was Done

Extended `src/__tests__/error-scenarios.test.ts` with a new `describe('Phase 2: Hardened Error Handling', ...)` block containing 9 new test cases. The 7 pre-existing tests were not modified.

### New Imports Added

- `CommandExecutionError` and `scrubTokens` from `../errors.js` added to existing import

### New Test Cases (9 total)

1. **ERR-01: ENOENT** — `AskToolHandler` receives a `CommandExecutionError` with ENOENT-pattern message; asserts `ToolExecutionError` thrown and message matches `/not found|not installed/i`; asserts raw `\bENOENT\b` does not appear in the `ToolExecutionError` message
2. **ERR-02: Quota (Ask)** — `AskToolHandler` receives 402/quota error; asserts `ToolExecutionError` message matches `/quota exceeded/i`
3. **ERR-03: Auth (Ask)** — `AskToolHandler` receives 401/unauthorized error; asserts `ToolExecutionError` message matches `/authentication failed/i`
4. **ERR-04: Timeout** — `AskToolHandler` receives timeout error; asserts `ToolExecutionError` message matches `/timed out/i`
5. **SEC-01: Token scrubbing (replacement)** — `scrubTokens()` replaces a live `GH_TOKEN` value with `[REDACTED]`; restores env in finally block
6. **SEC-01: Token scrubbing (guard)** — `scrubTokens()` does NOT scrub tokens with length <= 4 chars
7. **CLI-06: ANSI stripping** — `AskToolHandler` returns clean text when stdout contains ANSI escape sequences; asserts no `\u001B` in output and exact text matches
8. **ERR-03: Auth (Suggest)** — `SuggestToolHandler` classifies unauthenticated error as authentication failed
9. **ERR-02: Quota (Explain)** — `ExplainToolHandler` classifies rate limit error as quota exceeded

## Verification

- `npm run build` — exits 0, zero TypeScript errors
- `npm test` — 51/51 tests pass (42 pre-existing + 9 new), zero regressions
- `npm test -- --verbose 2>&1 | grep "Phase 2"` — outputs `Phase 2: Hardened Error Handling`

## Requirements Satisfied

- CLI-05: quota/auth error classification tested for all three handlers (Ask, Suggest, Explain)
- CLI-06: ANSI stripping tested via handler integration
- SEC-01: `scrubTokens()` function tested directly (replacement and guard)
- SEC-03: COPILOT_BINARY_PATH referenced in ENOENT test message; grep confirms per-call usage
- ERR-01: ENOENT scenario tested — user-friendly message, no raw ENOENT in ToolExecutionError
- ERR-02: Quota classification tested for AskToolHandler and ExplainToolHandler
- ERR-03: Auth classification tested for AskToolHandler and SuggestToolHandler
- ERR-04: Timeout scenario tested — timed out message propagates
- TEST-03: Error scenario tests exist and pass for all required scenarios

## Phase 2 Complete

Phase 2 (Error Handling and Resilience) is fully complete:
- Plan 02-01: Production hardening (errors.ts, command.ts, handlers.ts)
- Plan 02-02: Test coverage (error-scenarios.test.ts)
- All 9 requirements (CLI-05, CLI-06, SEC-01, SEC-03, ERR-01, ERR-02, ERR-03, ERR-04, TEST-03) satisfied
- 51 tests pass, build clean
