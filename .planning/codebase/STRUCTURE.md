# Codebase Structure

**Analysis Date:** 2026-02-20

## Directory Layout

```
copilot-mcp-server/
├── src/                          # Source code
│   ├── __tests__/                # Test files (co-located with source)
│   │   ├── index.test.ts         # Server and tool initialization tests
│   │   ├── session.test.ts       # Session storage tests
│   │   ├── context-building.test.ts
│   │   ├── default-model.test.ts
│   │   ├── edge-cases.test.ts
│   │   ├── error-scenarios.test.ts
│   │   ├── mcp-stdio.test.ts
│   │   ├── model-selection.test.ts
│   │   └── resume-functionality.test.ts
│   ├── tools/                    # Tool definitions and handlers
│   │   ├── definitions.ts        # Tool metadata for MCP clients
│   │   └── handlers.ts           # Tool handler implementations
│   ├── session/                  # Session state management
│   │   └── storage.ts            # In-memory session storage
│   ├── utils/                    # Utility functions
│   │   └── command.ts            # CLI command execution wrapper
│   ├── index.ts                  # CLI entry point
│   ├── server.ts                 # MCP server setup and request routing
│   ├── types.ts                  # TypeScript interfaces and Zod schemas
│   └── errors.ts                 # Custom error classes
├── docs/                         # Documentation
├── .planning/                    # GSD planning documents
│   └── codebase/                 # Architecture and structure docs
├── .github/                      # GitHub configuration
├── .vscode/                      # VS Code settings
├── package.json                  # Node.js dependencies and scripts
├── package-lock.json             # Dependency lockfile
├── tsconfig.json                 # TypeScript compiler options
├── jest.config.mjs               # Test runner configuration
├── eslint.config.mjs             # Linting rules
├── .prettierrc                   # Code formatter settings
├── .gitignore                    # Git exclusions
├── .mcp.json                     # MCP server configuration
├── README.md                     # Project overview
└── CLAUDE.md                     # Claude-specific instructions
```

## Directory Purposes

**src/**
- Purpose: All source code including implementations and tests
- Contains: TypeScript files organized by concern
- Key files: Entry point (index.ts), server (server.ts), types/schemas (types.ts)

**src/__tests__/**
- Purpose: Jest test files co-located with source
- Contains: Test suites for each major module
- Pattern: Test files match source files they test (index.test.ts tests index.ts behavior, session.test.ts tests session/storage.ts)
- Key files: index.test.ts (comprehensive tests), session.test.ts (storage tests)

**src/tools/**
- Purpose: MCP tool definitions and handler implementations
- Contains:
  - definitions.ts: Tool metadata describing to MCP clients what each tool does
  - handlers.ts: Implementations of 5 tool handlers (Codex, Review, Ping, Help, ListSessions)

**src/session/**
- Purpose: Session state management
- Contains: InMemorySessionStorage class for maintaining conversation context
- Key files: storage.ts (single responsibility: session persistence)

**src/utils/**
- Purpose: Shared utility functions
- Contains: Command execution wrappers for spawning external processes
- Key files: command.ts (executeCommand, executeCommandStreaming)

**docs/**
- Purpose: User-facing documentation
- Contains: API reference, session management guide, CLI integration details

**.planning/codebase/**
- Purpose: GSD planning and architecture documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, and other analysis docs

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI entry point - creates and starts MCP server (line 1: shebang, line 11-21: main())
- Production build output: `dist/index.js` (compiled from src/index.ts)

**Configuration:**
- `tsconfig.json`: TypeScript compiler (ES2022 target, strict mode, ESNext module)
- `jest.config.mjs`: Test runner (ts-jest preset, 10MB coverage)
- `eslint.config.mjs`: Linting rules (strict TypeScript, no-unused-vars with _ prefix convention)
- `.prettierrc`: Code formatter settings

**Core Logic:**
- `src/server.ts`: MCP server initialization and request routing
  - CodexMcpServer class (constructor, setupHandlers, start)
  - Lines 41-99: Request handler setup (ListTools, CallTool)
- `src/types.ts`: All type definitions and Zod schemas
  - Tool enum (TOOLS constant, line 4-10)
  - Schema definitions (lines 92-127)
- `src/tools/definitions.ts`: Tool metadata for MCP clients
  - Describes to clients what each tool does and what parameters it accepts
- `src/tools/handlers.ts`: Tool handler implementations
  - CodexToolHandler: Lines 36-262 (codex execution with sessions)
  - ReviewToolHandler: Lines 366-477 (code review)
  - PingToolHandler: Lines 264-291
  - HelpToolHandler: Lines 293-322
  - ListSessionsToolHandler: Lines 324-364
  - Handler registry: Lines 479-488
- `src/session/storage.ts`: Session management
  - InMemorySessionStorage: Lines 32-167
  - Interfaces (SessionStorage, SessionData): Lines 5-30

**Utilities:**
- `src/utils/command.ts`: External command execution
  - executeCommand: Lines 34-117 (sync execution)
  - executeCommandStreaming: Lines 127-238 (streaming with progress)
  - Windows escaping: Lines 11-20

**Error Handling:**
- `src/errors.ts`: Custom error classes
  - ToolExecutionError, CommandExecutionError, ValidationError (lines 1-31)
  - handleError helper (lines 33-38)

**Testing:**
- `src/__tests__/index.test.ts`: Main integration tests
  - Server initialization (lines 139-144)
  - Tool definitions validation (lines 47-89)
  - Tool handlers existence (lines 91-100)
  - Schema compatibility (lines 146-164)
- `src/__tests__/session.test.ts`: Session storage tests
  - All CRUD operations tested (lines 10-72)

## Naming Conventions

**Files:**
- TypeScript: `camelCase.ts` (e.g., `index.ts`, `server.ts`, `command.ts`)
- Test files: `*.test.ts` (e.g., `index.test.ts`, `session.test.ts`)
- No file extensions in imports (ESM with .js extension in imports, e.g., `'./server.js'`)

**Directories:**
- lowercase, plural for collections (e.g., `tools/`, `utils/`, `session/`)
- `__tests__/` follows Jest convention

**Classes:**
- PascalCase (e.g., `CodexMcpServer`, `CodexToolHandler`, `InMemorySessionStorage`)
- Tool handler classes: `{Name}ToolHandler` pattern (CodexToolHandler, ReviewToolHandler, etc.)
- Error classes: `{Type}Error` pattern (ToolExecutionError, ValidationError, CommandExecutionError)

**Functions:**
- camelCase (e.g., `executeCommand`, `handleError`, `buildEnhancedPrompt`)
- Async functions use async/await pattern
- Handler execute methods: `execute(args, context)` (consistent across all handlers)

**Variables/Constants:**
- camelCase for variables (e.g., `sessionId`, `selectedModel`, `cmdArgs`)
- UPPER_CASE for constants and enums (e.g., `TOOLS`, `DEFAULT_CODEX_MODEL`, `MAX_BUFFER_SIZE`)

**Types:**
- PascalCase (e.g., `ToolName`, `ToolResult`, `SessionData`, `CommandResult`)
- Interface prefix optional (not used, just `SessionStorage` not `ISessionStorage`)

## Where to Add New Code

**New Tool:**
1. Add tool name to `TOOLS` enum in `src/types.ts` (lines 4-10)
2. Add Zod schema in `src/types.ts` (after line 127)
3. Create handler class in `src/tools/handlers.ts`
4. Add tool definition in `src/tools/definitions.ts`
5. Register handler in `toolHandlers` registry at bottom of `src/tools/handlers.ts`
6. Add test file: `src/__tests__/{toolname}.test.ts`

**New Utility Function:**
- Place in `src/utils/` in appropriate file
- If command-related, add to `src/utils/command.ts`
- Otherwise create new file: `src/utils/{name}.ts`
- Export from module and import where needed

**New Error Type:**
- Add class to `src/errors.ts`
- Follow pattern: `export class {Name}Error extends Error { constructor(...) { super(...) } }`

**New Session Feature:**
- Add method to `SessionStorage` interface in `src/session/storage.ts` (lines 19-30)
- Implement in `InMemorySessionStorage` class (lines 32-167)
- If persistence needed, consider creating `PersistentSessionStorage` class in same file

**Tests:**
- Co-locate with source in `src/__tests__/` directory
- Name file: `{source-file}.test.ts`
- Use Jest describe/test blocks (see `src/__tests__/index.test.ts` for pattern)

## Special Directories

**src/__tests__/**
- Purpose: Jest test suite
- Generated: No
- Committed: Yes
- Pattern: Test files use mocking (chalk, command execution)
- Coverage: Collected by Jest, stored in coverage/ (gitignored)

**dist/**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)
- Source mapping: Source maps included (sourceMap: true in tsconfig)

**node_modules/**
- Purpose: NPM dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)
- Lock file: package-lock.json (committed)

**docs/**
- Purpose: User documentation
- Generated: No
- Committed: Yes
- Contains: API reference, session management guide, Codex CLI integration details

---

*Structure analysis: 2026-02-20*
