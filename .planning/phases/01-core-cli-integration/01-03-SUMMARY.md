---
phase: 01-core-cli-integration
plan: 03
subsystem: testing
tags: [jest, integration-test, copilot-stub, cli-flags, mcp]

requires:
  - phase: 01-core-cli-integration/01-02
    provides: AskToolHandler, SuggestToolHandler, ExplainToolHandler, PingToolHandler, CopilotMcpServer, npm build
provides:
  - Full green test suite: 42 tests, 6 suites, zero failures
  - mcp-stdio.test.ts with arg-capturing copilot stub verifying all 5 base flags and -p flag
  - Integration proof that 'copilot' binary is called (not 'gh' or 'codex')
  - All handler unit tests, addDir validation tests, model routing tests
affects: []

tech-stack:
  added: []
  patterns:
    - copilot-stub-arg-capture
    - nested-describe-server-lifecycle

key-files:
  created: []
  modified:
    - src/__tests__/mcp-stdio.test.ts

key-decisions:
  - "Arg-capturing stub: writes argv via shell printf to a temp file; read by test after await"
  - "Two describe blocks in mcp-stdio.test.ts: basic-stub and capturing-stub (separate server instances)"
  - "250ms delay before reading argsFile to ensure stub has finished writing"

patterns-established:
  - "createCopilotStub(captureArgs) pattern: reusable stub factory with optional arg capture"
  - "makeRequestSender: extracted helper for MCP stdio request sending"
  - "spawnServer: extracted helper for server process lifecycle"

requirements-completed: [TEST-01, TEST-04]

duration: 10min
completed: 2026-02-20
---

# Plan 01-03: Test Suite Completion — Full Green State

**42 tests pass across 6 suites; mcp-stdio.test.ts verifies all 5 copilot base flags and -p prompt flag via arg-capturing shell stub; Phase 1 all 17 requirements implemented and tested**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-20T18:15:00Z
- **Completed:** 2026-02-20T18:25:00Z
- **Tasks:** 2 (both collapsed into mcp-stdio.test.ts extension)
- **Files modified:** 1

## Accomplishments
- Extended `mcp-stdio.test.ts` with a second describe block using an arg-capturing copilot stub
- Verified all 5 base flags: `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`, `--no-auto-update`
- Verified `-p` is present; `-i` and `--interactive` are absent
- Verified the binary is named `copilot` (not `gh` or `codex`) via successful stub invocation
- `npm test` passes: 42 tests, 6 suites, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1 (index/error/edge/default-model/model-selection tests)** - Committed in 01-02 (65c0d23) — test stubs were required for build
2. **Task 2: Extend mcp-stdio.test.ts with flag verification** - `8474da8` (feat)

## Files Created/Modified
- `src/__tests__/mcp-stdio.test.ts` - Extended with arg-capturing stub and CLI flag assertions

## Decisions Made
- Two describe blocks with separate server instances: one non-capturing stub (basic response tests), one capturing stub (flag verification tests)
- 250ms sleep after ask tool call to ensure stub has written args file before reading
- `makeRequestSender` and `spawnServer` extracted as helpers for cleaner test code

## Deviations from Plan

None — mcp-stdio.test.ts was partially written in 01-02 (basic stub) and completed here (flag verification).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 is complete: all 17 requirements (TOOL-01 through TEST-04) implemented and tested
- Ready for phase verification

---
*Phase: 01-core-cli-integration*
*Completed: 2026-02-20*
