# Architecture

**Analysis Date:** 2026-02-20

## Pattern Overview

**Overall:** Model Context Protocol (MCP) Server with Tool Handler Pattern

This is an MCP server implementation that acts as a bridge between Claude (via MCP) and the Codex CLI. It follows a request-handler pattern where MCP requests come in via stdio transport and are routed to specific tool handlers that execute CLI commands and return results.

**Key Characteristics:**
- Request-response architecture: MCP server receives tool requests via stdin and sends results via stdout
- Tool-based execution: Each capability (codex, review, ping, help, listSessions) is implemented as a separate tool handler
- Session management: Stateful conversation support through in-memory session storage
- Command execution bridge: Spawns external Codex CLI processes and captures output
- Error handling layer: Custom error types for validation, execution, and command failures

## Layers

**Transport Layer:**
- Purpose: Handle MCP protocol communication via standard input/output
- Location: `src/server.ts` (CodexMcpServer class, lines 105-109)
- Contains: MCP server initialization, stdio transport setup
- Depends on: @modelcontextprotocol/sdk
- Used by: Entry point (`src/index.ts`) starts the server

**Request Handler Layer:**
- Purpose: Route incoming MCP requests to appropriate tool handlers
- Location: `src/server.ts` (setupHandlers method, lines 41-99)
- Contains: ListToolsRequest handler (returns tool definitions), CallToolRequest handler (executes tools)
- Depends on: Tool definitions, tool handlers
- Used by: MCP transport layer triggers handlers when requests arrive

**Tool Handler Layer:**
- Purpose: Implement business logic for each tool (codex, review, ping, help, listSessions)
- Location: `src/tools/handlers.ts`
- Contains: Five handler classes
  - `CodexToolHandler`: Executes Codex CLI with session support
  - `ReviewToolHandler`: Runs code reviews via Codex CLI
  - `PingToolHandler`: Echo test tool
  - `HelpToolHandler`: Proxies Codex --help output
  - `ListSessionsToolHandler`: Reports active session metadata
- Depends on: Command execution, session storage, input validation
- Used by: Request handler layer calls execute() on handlers

**Session Management Layer:**
- Purpose: Maintain conversation state across multiple tool invocations
- Location: `src/session/storage.ts`
- Contains: `InMemorySessionStorage` class implementing `SessionStorage` interface
- Key features:
  - In-memory Map-based storage
  - TTL enforcement (24-hour timeout per session)
  - Max session limit (100 concurrent)
  - Session validation (ID format: letters, numbers, hyphens, underscores; max 256 chars)
- Depends on: Error handling
- Used by: CodexToolHandler and ListSessionsToolHandler

**Command Execution Layer:**
- Purpose: Execute external processes (Codex CLI) and capture output
- Location: `src/utils/command.ts`
- Contains: Two functions
  - `executeCommand()`: Spawns process, waits for completion, returns combined stdout/stderr
  - `executeCommandStreaming()`: Spawns process, streams output chunks via progress callback
- Features:
  - Windows shell escaping for special characters
  - 10MB buffer limit per stream (stdout/stderr)
  - Truncation warnings
  - Progress debouncing (100ms minimum between updates)
- Depends on: Node.js child_process
- Used by: CodexToolHandler and ReviewToolHandler

**Type & Validation Layer:**
- Purpose: Define types and provide runtime validation via Zod schemas
- Location: `src/types.ts`
- Contains:
  - Tool name enum (TOOLS constant)
  - Zod input schemas (CodexToolSchema, ReviewToolSchema, PingToolSchema, etc.)
  - Type definitions (CodexToolArgs, ReviewToolArgs, etc.)
  - Server config interface
  - Tool definition and result interfaces
- Depends on: Zod library
- Used by: All handlers for schema validation

**Tool Definition Layer:**
- Purpose: Describe tools to MCP clients (capabilities, parameters, schemas)
- Location: `src/tools/definitions.ts`
- Contains: Array of ToolDefinition objects with:
  - Input schemas (JSON schema format)
  - Output schemas (for structured content)
  - Annotations (hints about destructiveness, idempotence, etc.)
- Depends on: Type definitions
- Used by: Request handler returns these when ListToolsRequest arrives

**Error Handling Layer:**
- Purpose: Custom error types and unified error formatting
- Location: `src/errors.ts`
- Contains: Three custom error classes
  - `ToolExecutionError`: When a tool handler fails
  - `CommandExecutionError`: When CLI command fails
  - `ValidationError`: When input validation fails
- Function: `handleError()` converts errors to user-facing strings
- Used by: All handlers and server for error reporting

## Data Flow

**Incoming Tool Request Flow:**

1. Client connects via MCP and sends CallToolRequest (stdin)
2. MCP transport layer receives request
3. Request handler extracts tool name and arguments
4. Argument validation against Zod schema (throws ValidationError if invalid)
5. Tool handler is dispatched and execute() is called with args and context
6. Handler processes request:
   - For codex/review: Builds CLI command args, executes via command layer
   - For ping/help: Executes simple operations
   - For listSessions: Queries session storage
7. Handler catches errors and returns ToolResult
8. Result is sent back via stdout to client

**Session Resumption Flow (Codex with existing session):**

1. CodexToolHandler receives prompt + sessionId
2. Handler checks if session exists in InMemorySessionStorage
3. If Codex conversation ID exists for session:
   - Use `codex exec resume <conversationId> <prompt>`
   - Conversion to resume subcommand with limited flags
4. If no Codex conversation ID:
   - Fall back to `codex exec` with manual context building
   - Builds enhanced prompt from previous turns
5. After execution, extracts conversation ID from Codex output
6. Stores ID in session for future resumption
7. Adds turn to session (prompt + response)

**Command Execution Flow:**

1. Handler builds command args array (e.g., ['exec', '--model', 'gpt-5.3-codex', ...])
2. Calls executeCommand() or executeCommandStreaming()
3. Spawns child process with:
   - Windows shell mode if on Windows (for PATH inheritance)
   - Environment override (for CODEX_MCP_CALLBACK_URI if provided)
   - stdio: pipe (capture stdout/stderr, no stdin relay)
4. Collects data on stdout and stderr streams (up to 10MB each)
5. Returns Promise that resolves when child closes
6. Handler checks exit code and output presence
7. Returns combined stdout+stderr or error

**State Management:**

- **Sessions**: Stored in memory in InMemorySessionStorage.sessions Map
- **Session Persistence**: Session data is lost on server restart (no persistence)
- **Turn Tracking**: Each session maintains array of ConversationTurns (prompt, response, timestamp)
- **Conversation IDs**: Extracted from Codex CLI output via regex and stored in session
- **Progress Notifications**: Sent via MCP notifications/progress during streaming execution

## Key Abstractions

**ToolHandler Interface (implicit):**
- Purpose: Define contract that all tool handlers implement
- Pattern: Each handler has `execute(args: unknown, context: ToolHandlerContext): Promise<ToolResult>`
- Examples: CodexToolHandler, ReviewToolHandler, PingToolHandler, HelpToolHandler, ListSessionsToolHandler
- Benefit: Request handler can dispatch any tool by name without knowing specific handler type

**SessionStorage Interface:**
- Purpose: Abstract session persistence mechanism
- Location: `src/session/storage.ts` (lines 19-30)
- Methods: createSession, ensureSession, getSession, updateSession, deleteSession, listSessions, addTurn, resetSession, setCodexConversationId, getCodexConversationId
- Implementation: InMemorySessionStorage
- Benefit: Allows swapping in persistent storage (database, file-based) without changing handler code

**CommandResult:**
- Purpose: Normalize output from spawned processes
- Structure: `{ stdout: string; stderr: string; }`
- Usage: Both executeCommand and executeCommandStreaming return this
- Benefit: Handlers don't need to know about Node.js streams or buffers

**ToolHandlerContext:**
- Purpose: Pass request metadata and capabilities to handlers
- Fields:
  - `progressToken?`: Token for sending progress notifications back to client
  - `sendProgress(message, progress?, total?)`: Async function to send progress
- Benefit: Decouples handler logic from MCP-specific notification mechanics

**Zod Schemas:**
- Purpose: Runtime validation of tool arguments
- Pattern: Each tool has a schema (CodexToolSchema, ReviewToolSchema, etc.)
- Used by: Handler calls `schema.parse(args)` which throws ZodError on invalid input
- Benefit: Type safety + runtime validation in one place

## Entry Points

**CLI Entry Point:**
- Location: `src/index.ts`
- Triggers: When script is run (Node.js executable)
- Responsibilities:
  1. Create ServerConfig object
  2. Instantiate CodexMcpServer
  3. Call server.start()
  4. Handle startup errors and exit with code 1 if failure

**MCP Request Entry Points:**
- ListToolsRequest: Triggers when client asks what tools are available
  - Handler: `server.setRequestHandler(ListToolsRequestSchema, ...)`
  - Returns: Array of tool definitions
- CallToolRequest: Triggers when client invokes a tool
  - Handler: `server.setRequestHandler(CallToolRequestSchema, ...)`
  - Extracts: tool name, arguments, progress token
  - Returns: ToolResult with content and optional error flag

## Error Handling

**Strategy:** Errors are caught at handler level and returned as ToolResult with isError=true

**Patterns:**

1. **Validation Errors** (Zod failures):
   ```typescript
   catch (error) {
     if (error instanceof ZodError) {
       throw new ValidationError(TOOLS.CODEX, error.message);
     }
   }
   ```
   - Result: isError=true, text contains "Validation failed for tool..."

2. **Command Execution Errors**:
   ```typescript
   child.on('error', (error) => {
     reject(new CommandExecutionError(cmd, message, error));
   });
   ```
   - Result: Promise rejection, caught by handler, wrapped in ToolExecutionError

3. **Tool Execution Errors**:
   ```typescript
   catch (error) {
     if (error instanceof ValidationError) throw error;
     throw new ToolExecutionError(TOOLS.CODEX, 'Failed to execute codex command', error);
   }
   ```
   - Result: Caught by server request handler, returns isError=true

4. **Server-Level Errors** (in request handler):
   ```typescript
   catch (error) {
     return {
       content: [{ type: 'text', text: handleError(error, 'tool "codex"') }],
       isError: true,
     };
   }
   ```
   - Result: No exception thrown, response sent with error flag

## Cross-Cutting Concerns

**Logging:** Uses console.error() for debug output
- Command execution: Logs CLI commands before spawn
- Warnings: Buffer truncation warnings
- Errors: Stderr output from commands
- Uses chalk for color coding (blue for commands, yellow for warnings, red for errors, green for success)

**Validation:** Two-level approach
- Input validation: Zod schemas in tool handlers
- Session ID validation: InMemorySessionStorage.ensureSession() checks length and pattern
- Error handling: ValidationError thrown for user-facing validation messages

**Authentication:** No built-in auth
- Handled by: Codex CLI (user runs `codex login` separately)
- Environment variable: CODEX_MCP_CALLBACK_URI and per-request callbackUri for callback setup
- OpenAI API key: Not handled by this server, managed by Codex CLI

---

*Architecture analysis: 2026-02-20*
