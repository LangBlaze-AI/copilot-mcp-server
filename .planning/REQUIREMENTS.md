# Requirements: Copilot MCP Server

**Defined:** 2026-02-20
**Core Value:** Coding agents can invoke GitHub Copilot's ask, suggest, and explain capabilities over MCP with zero friction

## v1 Requirements

### Tools

- [ ] **TOOL-01**: User can invoke `ask` tool with a natural language prompt and receive a Copilot agent response
- [ ] **TOOL-02**: User can invoke `suggest` tool with a task description and receive a command suggestion
- [ ] **TOOL-03**: User can invoke `suggest` tool with an optional `target` param (`shell` | `git` | `gh`) to scope the suggestion type
- [ ] **TOOL-04**: User can invoke `explain` tool with a shell command string and receive a plain-language explanation
- [ ] **TOOL-05**: User can invoke `ping` tool to verify the MCP server is alive
- [ ] **TOOL-06**: User can pass a `model` parameter to `ask`, `suggest`, and `explain` to select the AI model (default: `gpt-4.1`)
- [ ] **TOOL-07**: User can pass an `addDir` parameter to `ask`, `suggest`, and `explain` to expose additional directories to the Copilot agent

### CLI Integration

- [ ] **CLI-01**: Server invokes the standalone `copilot` binary (not `gh copilot`) for all AI tool calls
- [ ] **CLI-02**: All AI invocations use `-p <prompt>` flag (not `-i/--interactive`)
- [ ] **CLI-03**: All AI invocations hardcode `--allow-all-tools`, `--no-ask-user`, `--silent`, `--no-color`, `--no-auto-update`
- [ ] **CLI-04**: AI response is read from stdout (not stderr — inverted from Codex behavior)
- [ ] **CLI-05**: Non-zero exit code from `copilot` binary is treated as an error and surfaces error message to MCP caller
- [ ] **CLI-06**: ANSI escape codes are stripped from stdout even when `--no-color` is set (user config may re-enable them)

### Security

- [ ] **SEC-01**: Auth tokens (COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN) are never logged or included in error message output
- [ ] **SEC-02**: Prompt and `addDir` inputs are validated to prevent shell injection before CLI invocation
- [ ] **SEC-03**: `COPILOT_BINARY_PATH` environment variable is respected for non-PATH binary installs

### Error Handling

- [ ] **ERR-01**: When `copilot` binary is not found (ENOENT), server returns a clear "copilot CLI not installed" message with install instructions
- [ ] **ERR-02**: When `copilot` exits with quota error, server returns the quota error message (not silent success)
- [ ] **ERR-03**: When `copilot` exits with auth error, server returns a clear auth failure message
- [ ] **ERR-04**: CLI execution times out after 60 seconds and returns a timeout error (not a hang)

### Project Cleanup

- [ ] **CLEAN-01**: Session management layer (`src/session/`) is deleted entirely
- [ ] **CLEAN-02**: `review`, `listSessions`, and `help` tools are removed
- [ ] **CLEAN-03**: Package name, server class name, and README are updated from Codex to Copilot branding
- [ ] **CLEAN-04**: Prerequisites documentation updated: `copilot` binary install + GitHub token auth (not `codex login`)

### Testing

- [ ] **TEST-01**: Handler tests are rewritten to test `ask`, `suggest`, `explain`, and `ping` tools
- [ ] **TEST-02**: Session-related test files are deleted (`session.test.ts`, `resume-functionality.test.ts`, `context-building.test.ts`)
- [ ] **TEST-03**: Error handling tests cover ENOENT, quota, and auth failure scenarios
- [ ] **TEST-04**: Integration tests verify correct CLI flags are passed in non-interactive mode

## v2 Requirements

### Session Continuity

- **SESS-01**: User can resume a prior Copilot conversation via session ID
- **SESS-02**: Server persists session IDs across `ask` tool calls via `--share` flag
- **SESS-03**: User can list active sessions via `listSessions` tool

## Out of Scope

| Feature | Reason |
|---------|--------|
| `gh copilot` extension | Deprecated Oct 2025, returns deprecation notice + exit 0, non-functional |
| `review` tool | `/review` is TUI-only, not accessible via `-p` in non-interactive mode |
| `help` tool | TUI-only, hangs without TTY |
| Session management (v1) | Copilot CLI is stateless; complexity not justified; explicitly decided in PROJECT.md |
| `--yolo` / `--allow-all` flags as user params | Grants broader filesystem/URL access beyond tool scope; security risk |
| Model enum validation in handler | CLI validates its own model enum with clear errors; handler validation is maintenance burden |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | Phase 1 | Pending |
| TOOL-02 | Phase 1 | Pending |
| TOOL-03 | Phase 1 | Pending |
| TOOL-04 | Phase 1 | Pending |
| TOOL-05 | Phase 1 | Pending |
| TOOL-06 | Phase 1 | Pending |
| TOOL-07 | Phase 1 | Pending |
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 1 | Pending |
| CLI-03 | Phase 1 | Pending |
| CLI-04 | Phase 1 | Pending |
| CLI-05 | Phase 2 | Pending |
| CLI-06 | Phase 2 | Pending |
| ERR-01 | Phase 2 | Pending |
| ERR-02 | Phase 2 | Pending |
| ERR-03 | Phase 2 | Pending |
| CLEAN-01 | Phase 1 | Pending |
| CLEAN-02 | Phase 1 | Pending |
| CLEAN-03 | Phase 3 | Pending |
| CLEAN-04 | Phase 3 | Pending |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 1 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 2 | Pending |
| ERR-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after CONSUL review (Gemini + OpenCode)*
