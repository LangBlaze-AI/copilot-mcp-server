# External Integrations

**Analysis Date:** 2026-02-20

## APIs & External Services

**OpenAI:**
- OpenAI Codex API - AI code analysis, generation, and review
  - SDK/Client: @openai/codex (CLI wrapper)
  - Auth: API key configured via `codex login` command (user-managed)
  - Authentication: File-based credentials stored by Codex CLI (not handled by MCP server)

**Codex CLI Integration:**
- Codex CLI v0.75.0+ - Required external CLI tool executed as subprocess
  - Commands: `codex exec`, `codex review`, `codex resume`
  - Transport: Child process with stdio pipes
  - Models supported: gpt-5.3-codex (default), gpt-5.2-codex, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5-codex, gpt-4o, gpt-4, o3, o4-mini
  - Reasoning effort levels: none, minimal, low, medium, high, xhigh

## Data Storage

**Session Storage:**
- Type: In-memory only (InMemorySessionStorage)
- Location: `src/session/storage.ts`
- Scope: Per-process; cleared on server restart
- Capacity: Max 100 sessions with 24-hour TTL
- Data retained: Conversation turns (prompt/response pairs), Codex conversation IDs, timestamps

**External Code Context:**
- Git repository access - read-only for code review and context analysis
- Working directory - user-specified or current directory

**File Storage:**
- Not applicable - MCP server doesn't persist session data to disk

**Caching:**
- None - All Codex calls are fresh requests to OpenAI API (via Codex CLI)

## Authentication & Identity

**Auth Provider:**
- OpenAI API key authentication
- Implementation: User-managed via Codex CLI (`codex login --api-key "key"`)
- MCP Server responsibility: None - delegates to Codex CLI
- Credentials location: Codex CLI handles storage (outside this codebase)

**Session Identification:**
- Session IDs: User-provided string identifiers (alphanumeric, hyphen, underscore only; max 256 chars)
- Conversation tracking: Codex CLI emits conversation IDs on new sessions
- Extraction: Regex parsing of CLI output to capture conversation ID for resumption

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to stderr via console.error()

**Logs:**
- Approach: console.error() with chalk color coding
- Logging locations:
  - `src/index.ts` - Server startup success/failure
  - `src/utils/command.ts` - Command execution with colored output (blue for exec, yellow for warnings)
  - `src/tools/handlers.ts` - Tool execution progress and errors
  - Progress notifications sent via MCP notifications/progress method

**Structured Logging:**
- Not implemented - Plain text console logging only

## CI/CD & Deployment

**Hosting:**
- Not applicable - MCP server is a CLI tool distributed via npm
- Distribution: npm package (codex-mcp-server)
- Installation: `npm i -g codex-mcp-server` or `npx codex-mcp-server`

**CI Pipeline:**
- Not detected in source code
- GitHub workflows may exist (check `.github/workflows/` if present)

## Environment Configuration

**Required env vars:**
- `CODEX_DEFAULT_MODEL` (optional) - Override default model for Codex and Review tools; defaults to `gpt-5.3-codex` if not set
- `CODEX_MCP_CALLBACK_URI` (optional) - Static MCP callback URI passed to Codex CLI; can be overridden per-tool via `callbackUri` argument
- `STRUCTURED_CONTENT_ENABLED` (optional) - Enable structuredContent field in tool responses (values: '1', 'true', 'yes', 'on')

**Secrets location:**
- OpenAI API key: Stored by Codex CLI (user's system, not in .env)
- No .env file in this codebase - Secrets are external to the MCP server

## Webhooks & Callbacks

**Incoming:**
- None - MCP server is stdio-based, not HTTP

**Outgoing:**
- Callback URI support: Optional parameter passed to Codex CLI via `CODEX_MCP_CALLBACK_URI` env var
  - Purpose: Codex CLI may send status updates or completion callbacks to specified URI
  - Mechanism: Passed through as environment variable to subprocess
  - User-specified per-tool via `callbackUri` argument in Codex tool

## MCP Protocol Integration

**Server Registration:**
- Configuration file: `.mcp.json`
- Transport: stdio (standard input/output)
- Name: codex-cli
- Invocation: `node dist/index.js`

**Tool Exposure:**
- codex - Execute Codex CLI for AI assistance (supports sessions, model selection, reasoning effort, sandbox modes)
- review - Code review tool for Git changes (uncommitted, branch-based, or commit-specific)
- listSessions - List active conversation sessions
- ping - Health check
- help - Fetch Codex CLI help information

**Progress Notifications:**
- Method: MCP notifications/progress
- Used when: ProgressToken present in request metadata
- Frequency: Debounced at 100ms intervals to avoid flooding
- Content: Real-time output chunks from Codex CLI execution

**Structured Output:**
- Metadata returned in two ways for compatibility:
  1. `content[0]._meta` - For Claude Code compatibility
  2. `structuredContent` field - For MCP clients with proper structured content support
- Metadata includes: threadId, model, sessionId, callbackUri, base (for reviews), commit (for reviews)

## Git Integration

**Purpose:**
- Code review source: Read uncommitted changes, branches, or specific commits
- Mechanism: Codex CLI invokes `git` commands internally

**Scope:**
- Read-only access to repository metadata and diffs
- Working directory specification via `-C` flag to Codex CLI
- Features: Review uncommitted changes, compare branches, analyze commits

---

*Integration audit: 2026-02-20*
