# Codebase Concerns

**Analysis Date:** 2026-02-20

## Tech Debt

### Session Storage Not Persistent
- **Issue:** In-memory session storage is volatile and lost on server restart
- **Files:** `src/session/storage.ts`, `src/tools/handlers.ts` (line 480)
- **Impact:** Users cannot resume conversations across server restarts. Sessions are valuable for multi-turn interactions with Codex, but they only last while the server is running.
- **Fix approach:** Implement persistent storage (filesystem, database, or Redis) with migration from in-memory storage. Create `PersistentSessionStorage` implementation that implements `SessionStorage` interface. Session lifetime management (24-hour TTL) should be preserved.

### Context Building Fallback Uses Hard-Coded Heuristics
- **Issue:** When Codex conversation ID is unavailable, `buildEnhancedPrompt()` slices recent turns and uses fragile string matching to detect code
- **Files:** `src/tools/handlers.ts` (lines 238-261)
- **Pattern:** Simple substring matching for `"function"` or `"def "` is fragile across languages and formats
- **Impact:** Context building may fail to recognize relevant code in other languages (Go, Rust, Java) or when code is formatted differently. Manual context reconstruction is inferior to native resume.
- **Fix approach:** Either (1) Ensure native Codex resume is always available, or (2) Improve heuristics with language-aware parsing or AST-based detection. Consider using a proper code parser.

### Regex Patterns for ID Extraction Are Lenient
- **Issue:** Conversation ID extraction uses case-insensitive regex that accepts variations in output format
- **Files:** `src/tools/handlers.ts` (lines 172-173)
- **Pattern:** `/(\conversation|session)\s*id\s*:\s*([a-zA-Z0-9-]+)/i`
- **Impact:** While lenient matching is good for robustness, it may accept malformed IDs if Codex CLI output changes unexpectedly. No validation of extracted ID format.
- **Fix approach:** Add stricter validation of extracted conversation IDs before storing. Define expected format (UUID, length, allowed chars) and validate against it.

## Known Issues

### Streaming Progress Debouncing May Lose Information
- **Issue:** Progress updates are debounced at 100ms intervals to avoid flooding
- **Files:** `src/utils/command.ts` (lines 154-166)
- **Impact:** Fast-changing processes may have progress updates skipped if they occur within 100ms of previous update. Final update wrapper tries to compensate (lines 199-206) but may still lose intermediate state.
- **Workaround:** System currently sends final progress notification, but rapid changes during execution may not be fully captured
- **Fix approach:** Consider accumulating skipped messages or increasing debounce threshold only for duplicate messages. Profile actual usage to determine if 100ms is appropriate.

### Command Execution Returns Success if stdout OR stderr Present
- **Issue:** Exit code handling is lenient: accepts non-zero exit if output is present
- **Files:** `src/utils/command.ts` (lines 87-89, 209-210)
- **Pattern:** `if (code === 0 || stdout || stderr)` treats command with exit code 1 and output as success
- **Impact:** Commands that fail but emit error messages to stderr will be treated as successful. Can hide real errors if Codex CLI changes output format.
- **Fix approach:** Tighten exit code handling: require exit code 0 for success, or explicitly whitelist non-zero codes that are known-safe. Add logging when accepting non-zero exit.

### Session Data Validation Issue
- **Issue:** When turns array is corrupted (not an array), code adds defensive check but doesn't prevent corruption in the first place
- **Files:** `src/session/storage.ts` (lines 118-120) - addTurn() validates array before pushing
- **Impact:** Defensive check is good, but doesn't explain how corruption can happen. Test corrupts turns deliberately but production path unclear.
- **Fix approach:** Add stricter typing or use Object.seal() on session objects. TypeScript type checking should prevent this in compiled code, but runtime safety is weak.

## Security Considerations

### Environment Variable Exposure in Progress Messages
- **Issue:** Command arguments (including potential env overrides) are logged to stderr
- **Files:** `src/utils/command.ts` (lines 43, 136-139)
- **Log output:** `console.error(chalk.blue('Executing:'), file, escapedArgs.join(' '))`
- **Risk:** Debug logs may be captured in CI/CD systems or application logs. If users pass sensitive data via arguments (unlikely but possible), they would be exposed.
- **Current mitigation:** Arguments are properly escaped for Windows shell, not a direct injection risk
- **Recommendations:** (1) Suppress argument logging in production, (2) Add environment variable sanitization to hide secrets in logs, (3) Warn users not to pass sensitive data in tool arguments.

### Buffer Overflow Protection (Mitigated)
- **Issue:** 10MB buffer limits exist to prevent memory exhaustion
- **Files:** `src/utils/command.ts` (lines 25, 59-61, 72-74, 171-173, 185-187)
- **Current mitigation:** Good - MAX_BUFFER_SIZE is enforced, truncation is logged
- **Risk:** Legitimate long-running operations could produce >10MB output, leading to truncation and data loss
- **Fix approach:** Make buffer limit configurable, add option to stream to disk for very large outputs, document the limit in tool descriptions.

### Shell Execution on Windows
- **Issue:** Windows uses shell=true for process spawning to inherit PATH correctly
- **Files:** `src/utils/command.ts` (lines 46, 143)
- **Risk:** Shell=true can expose command injection if arguments aren't properly escaped
- **Current mitigation:** Arguments are escaped with escapeArgForWindows() (lines 11-20), handling quotes and special characters
- **Recommendations:** (1) Add more comprehensive shell escaping tests, (2) Consider using cross-platform alternatives to shell=true, (3) Add command validation/sandboxing.

## Performance Bottlenecks

### Session List Operation Triggers Cleanup
- **Issue:** `listSessions()` calls `cleanupExpiredSessions()` every time
- **Files:** `src/session/storage.ts` (line 108)
- **Cost:** Full session map iteration and deletion with every list call. If there are 100 sessions, this is O(n) work per request.
- **Impact:** List operations become slower as session count grows. No caching of cleanup cycles.
- **Improvement path:** (1) Use time-based cleanup (periodic background task), not request-based, (2) Add cleanup debouncing, (3) Consider lazy deletion on TTL expiry check rather than eager deletion.

### Context Building Iterates All Turns
- **Issue:** `buildEnhancedPrompt()` always operates on last 2 turns regardless of conversation length
- **Files:** `src/tools/handlers.ts` (line 245)
- **Pattern:** Fixed slice of last 2 turns means conversation history beyond that is always ignored
- **Impact:** Works well for short conversations but wastes turn data for long sessions. No smarter context selection based on relevance.
- **Improvement path:** Implement context compression or summarization. Use semantic search to find relevant past turns. Consider byte-limit based context selection instead of turn count.

### Regex Matching on Every Command Response
- **Issue:** Pattern matching for conversation ID, session ID, and thread ID happens on every execution
- **Files:** `src/tools/handlers.ts` (lines 172-188)
- **Impact:** Multiple regex operations on potentially large stderr strings (up to 10MB). No caching or lazy evaluation.
- **Improvement path:** (1) Cache regex compilation, (2) Use single-pass parsing instead of multiple regex matches, (3) Only extract IDs when session is active (avoid unnecessary work).

## Fragile Areas

### Conversation ID Format Assumptions
- **Files:** `src/tools/handlers.ts` (lines 172-173)
- **Why fragile:** Code assumes Codex CLI output format is stable. Regex pattern must match output exactly. If Codex CLI changes `conversation id:` to `conv_id:` or uses different formatting, resume breaks silently.
- **Safe modification:** (1) Add comprehensive tests for all known output formats, (2) Document expected format with examples, (3) Add feature detection or version checking, (4) Log extracted IDs for debugging.
- **Test coverage:** Edge cases test different formats (lines 69-91 in edge-cases.test.ts) but production Codex output hasn't been validated against actual CLI versions.

### Resume Mode Command Building
- **Files:** `src/tools/handlers.ts` (lines 97-111)
- **Why fragile:** Resume mode has strict flag ordering requirements. "All exec options must come BEFORE 'resume' subcommand" (comment line 99). Any change to flag insertion logic could break resume entirely.
- **Safe modification:** (1) Add integration tests with actual Codex CLI, (2) Document flag ordering constraints clearly, (3) Consider defensive flag validation, (4) Add version-aware command building.
- **Test coverage:** Model selection test (edge-cases.test.ts lines 24-50) validates flag ordering but relies on mock expectations, not actual Codex CLI.

### Session ID Validation
- **Files:** `src/session/storage.ts` (lines 59-68)
- **Why fragile:** Regex `/^[a-zA-Z0-9_-]+$/` is strict but arbitrary. If users provide session IDs from external systems, format restrictions could be surprising.
- **Safe modification:** (1) Document session ID format restrictions clearly, (2) Offer session ID generation helper, (3) Add lenient mode with UUID generation fallback.

## Scaling Limits

### In-Memory Session Storage Capacity
- **Current limit:** `maxSessions = 100` (storage.ts line 34)
- **Capacity:** Can hold 100 sessions. Once limit reached, oldest sessions are deleted (line 161).
- **Impact:** If server handles >100 concurrent users, some sessions will be evicted. Data loss after 24 hours (TTL) is guaranteed.
- **Scaling path:** Migrate to persistent storage (database, Redis, filesystem) with distributed session support. Current limit is appropriate only for single-server deployments with <100 users.

### 10MB Buffer Limit for Command Output
- **Current limit:** `MAX_BUFFER_SIZE = 10 * 1024 * 1024` (command.ts line 25)
- **Impact:** Codex responses larger than 10MB are truncated. Warning is logged but user doesn't know response is incomplete.
- **Scaling path:** (1) Make configurable, (2) Implement streaming to disk for large responses, (3) Add response size estimation and warning before execution, (4) Document limit in tool descriptions.

### Session TTL is Fixed
- **Current TTL:** 24 hours (storage.ts line 35)
- **Impact:** Long-lived sessions are cleared regardless of activity pattern. No per-session or per-user configuration.
- **Scaling path:** Make TTL configurable. Consider activity-based TTL (reset on access) vs. fixed TTL (24h from creation).

## Dependencies at Risk

### Multiple High-Severity Vulnerabilities in Dev Dependencies
- **Risk:** 30 vulnerabilities in node_modules (2 low, 1 moderate, 27 high)
- **Impact:** Build tooling is at risk. While dev dependencies don't affect runtime directly, they impact development security and CI/CD integrity.
- **Vulnerable packages:**
  - `ajv` <8.18.0: ReDoS vulnerability in `$data` option (in ESLint dependency chain)
  - `minimatch` <10.2.1: ReDoS via repeated wildcards (in glob, jest, ESLint chains)
  - `hono` <4.11.10: Timing comparison weakness in auth (though hono is not a direct dependency)
- **Migration plan:** (1) Run `npm audit fix` to auto-patch where possible, (2) Update ESLint to 10.0.0+ (breaking change, test required), (3) Pin vulnerable packages to fixed versions, (4) Add security audits to CI/CD.

### @modelcontextprotocol/sdk Version Constraint
- **Current version:** `^1.24.0` (allows up to <2.0.0)
- **Risk:** Major version bump to SDK could break MCP protocol compatibility
- **Impact:** If SDK introduces breaking changes, server must be updated and tested
- **Mitigation:** (1) Monitor SDK releases, (2) Test with latest SDK before production deployment, (3) Consider pinning to specific SDK version with deliberate upgrade testing.

## Missing Critical Features

### No Timeout Handling for Command Execution
- **Problem:** Commands can hang indefinitely if Codex CLI is unresponsive
- **Impact:** MCP server or client could hang waiting for response. No way to cancel a hung execution.
- **Blocks:** Long-running or stalled executions, can't be interrupted
- **Fix approach:** (1) Add configurable timeout to executeCommand(), (2) Kill process on timeout, (3) Return timeout error to client, (4) Document timeout behavior.

### No Execution Cancellation
- **Problem:** Once a tool execution starts, it cannot be cancelled
- **Impact:** Clients are forced to wait for completion or disconnect
- **Blocks:** Interactive use cases where user wants to stop mid-execution
- **Fix approach:** Implement MCP request cancellation protocol (if supported), add signal handlers, allow client-side timeout.

### No Execution History or Logging
- **Problem:** Tool execution history is not persisted. Each session only stores conversation turns, not execution metadata.
- **Impact:** Cannot audit what was executed, when, or with what parameters. Debugging issues requires logs from console output only.
- **Blocks:** Compliance, debugging, rate limiting
- **Fix approach:** Add execution log storage (file or database) with metadata: timestamp, tool, args, duration, exit code, user.

### No Rate Limiting
- **Problem:** No limits on tool invocation frequency per session or globally
- **Impact:** Single client can spam tool calls, potentially exhausting Codex CLI quota or server resources
- **Blocks:** Production deployment without external rate limiting (e.g., API gateway)
- **Fix approach:** Implement sliding-window rate limiting per session ID, add configurable limits, return 429 on limit exceeded.

## Test Coverage Gaps

### No Tests for Actual Codex CLI Integration
- **What's not tested:** Real Codex CLI execution, actual output formats, version compatibility
- **Files:** All handlers are tested with mocks (see `jest.mock()` in test files)
- **Risk:** Regex patterns and command construction are validated against expectations, not real CLI behavior. Changes in Codex CLI output format will not be caught until production.
- **Priority:** High
- **Fix approach:** (1) Add integration tests with Codex CLI (requires CLI installation), (2) Snapshot actual CLI output for version compatibility, (3) Add version detection and conditional tests.

### No Tests for Progress Notification Failures
- **What's not tested:** What happens when MCP notifications fail to send or are rejected
- **Files:** `src/server.ts` (lines 71-73) silently catches and logs notification errors
- **Risk:** Silent failure mode. Client may not realize progress updates were lost.
- **Priority:** Medium
- **Fix approach:** Add tests that mock notification failures, verify error handling, add metrics for failed notifications.

### No Tests for Very Large Command Output
- **What's not tested:** Actual handling of output near 10MB limit, truncation behavior
- **Files:** `src/utils/command.ts` tests don't simulate large output
- **Risk:** Truncation edge cases may not work as expected. Buffer management under stress is untested.
- **Priority:** Medium
- **Fix approach:** Add tests that spawn processes producing large output, verify truncation warnings are logged, validate output is correctly capped.

### No Tests for Session Eviction Scenarios
- **What's not tested:** Behavior when max sessions limit is reached, or when TTL cleanup runs with active usage
- **Files:** `src/session/storage.ts` has cleanup logic but no tests exercise full lifecycle
- **Risk:** Race conditions or unexpected session loss in production under high load
- **Priority:** Medium
- **Fix approach:** Add tests that create many sessions, verify LRU eviction works, test concurrent access during cleanup.

### No Error Recovery Tests
- **What's not tested:** Partial failures (e.g., command succeeds but response parsing fails), or recovery from corruption
- **Files:** Error scenarios test single-point failures but not cascading errors
- **Risk:** Unexpected error combinations could crash the server or corrupt state
- **Priority:** Low
- **Fix approach:** Add chaos engineering tests (inject random failures), test transaction semantics, verify state consistency after errors.

---

*Concerns audit: 2026-02-20*
