---
phase: 01-core-cli-integration
plan: 02
subsystem: api
tags: [copilot, mcp, handlers, typescript, zod]

requires:
  - phase: 01-core-cli-integration/01-01
    provides: TOOLS enum, Zod schemas, DEFAULT_COPILOT_MODEL, strictExitCode option
provides:
  - AskToolHandler, SuggestToolHandler, ExplainToolHandler, PingToolHandler (stateless)
  - toolHandlers registry keyed by TOOLS enum
  - toolDefinitions array with 4 MCP tool definitions
  - CopilotMcpServer class (renamed from CodexMcpServer)
  - npm run build passing with zero TypeScript errors
affects: [01-03]

tech-stack:
  added: []
  patterns:
    - stateless-handler-classes
    - COPILOT_BASE_ARGS-const
    - stdout-primary-response
    - addDir-path-validation
    - strictExitCode-for-copilot

key-files:
  created: []
  modified:
    - src/tools/handlers.ts
    - src/tools/definitions.ts
    - src/server.ts
    - src/index.ts
    - src/__tests__/index.test.ts
    - src/__tests__/error-scenarios.test.ts
    - src/__tests__/edge-cases.test.ts
    - src/__tests__/default-model.test.ts
    - src/__tests__/model-selection.test.ts
    - src/__tests__/mcp-stdio.test.ts

key-decisions:
  - "Test files rewritten in Plan 01-02 (not 01-03) to satisfy npm run build requirement"
  - "extractResponse helper: empty stdout + non-empty stderr throws ToolExecutionError"
  - "COPILOT_BASE_ARGS as const: five flags hardcoded, not configurable"
  - "PingToolHandler does NOT invoke copilot binary — immediate response only"

patterns-established:
  - "COPILOT_BASE_ARGS pattern: all flags in one const, spread into args array"
  - "buildCopilotArgs: model resolution chain (param > env var > default)"
  - "validateAddDir: null-byte, traversal, absolute-path checks in order"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, CLI-01, CLI-02, CLI-03, CLI-04, SEC-02]

duration: 20min
completed: 2026-02-20
---

# Plan 01-02: Handler and Definition Layer Rewrite

**Four stateless Copilot tool handlers (ask/suggest/explain/ping) invoke `copilot -p` with hardcoded safety flags; stdout/stderr inversion fixed; npm run build passes with zero TypeScript errors**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-20T17:55:00Z
- **Completed:** 2026-02-20T18:15:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Rewrote `handlers.ts`: four stateless handler classes, COPILOT_BASE_ARGS const with 5 flags, addDir path validation, stdout as primary response
- Rewrote `definitions.ts` with 4 MCP tool definitions using TOOLS enum
- Renamed `CodexMcpServer` to `CopilotMcpServer` in server.ts and index.ts
- Rewrote all 6 test files to remove Codex references (required to achieve zero build errors)
- `npm run build` now passes with zero TypeScript errors — codebase fully compilable

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite handlers.ts** - `4bfcd27` (feat)
2. **Task 2: Rewrite definitions.ts + update server.ts/index.ts + test file stubs** - `65c0d23` (feat)

## Files Created/Modified
- `src/tools/handlers.ts` - Four Copilot handlers; COPILOT_BASE_ARGS; addDir validation; extractResponse
- `src/tools/definitions.ts` - 4 tool definitions (ask, suggest, explain, ping)
- `src/server.ts` - Renamed to CopilotMcpServer
- `src/index.ts` - Updated import and server name
- `src/__tests__/index.test.ts` - Rewritten: 4-tool tests, handler existence, MCP schema
- `src/__tests__/error-scenarios.test.ts` - Rewritten: Copilot error propagation, addDir validation
- `src/__tests__/edge-cases.test.ts` - Rewritten: model routing, addDir, env var
- `src/__tests__/default-model.test.ts` - Rewritten: constant verification
- `src/__tests__/model-selection.test.ts` - Rewritten: model param routing
- `src/__tests__/mcp-stdio.test.ts` - Rewritten: 4-tool list, stdout, ping via copilot stub

## Decisions Made
- Test files rewritten here (not in 01-03) because the build requires zero TS errors now
- PingToolHandler returns immediate response without invoking copilot binary
- extractResponse: empty stdout + non-empty stderr throws ToolExecutionError (not returns stderr)

## Deviations from Plan

### Auto-fixed Issues

**1. Test files rewritten in Plan 01-02 instead of Plan 01-03**
- **Found during:** Task 2 (npm run build check)
- **Issue:** tsconfig includes `src/**/*` which includes test files. Test files had Codex imports that caused build failure. Plan 01-02 requires `npm run build` to pass.
- **Fix:** Rewrote all 6 test files with Copilot patterns as part of Task 2 to achieve the zero-error build. Plan 01-03 will extend these tests with the full flag-verification integration tests.
- **Files modified:** All 6 test files in src/__tests__/
- **Verification:** `npm run build` exits 0
- **Committed in:** 65c0d23

---

**Total deviations:** 1 auto-fixed (build requirement)
**Impact on plan:** No scope creep — Plan 01-03 still required for full integration test coverage (CLI flag verification, copilot stub with arg capture, -p flag assertion).

## Issues Encountered

None beyond the test file situation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- npm run build passes — Plan 01-03 can immediately run `npm test`
- mcp-stdio.test.ts has a copilot stub but lacks flag verification — that's Plan 01-03's job
- All handler, definition, and server code is complete

---
*Phase: 01-core-cli-integration*
*Completed: 2026-02-20*
