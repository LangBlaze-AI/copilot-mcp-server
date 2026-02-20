# Technology Stack

**Analysis Date:** 2026-02-20

## Languages

**Primary:**
- TypeScript 5.9.2 - All source code

## Runtime

**Environment:**
- Node.js (current/latest stable)

**Package Manager:**
- npm - Lockfile present (`package-lock.json`)

## Frameworks

**Core:**
- @modelcontextprotocol/sdk 1.24.0 - MCP server implementation and transport (stdio)

**Build/Compilation:**
- TypeScript 5.9.2 - Compilation to ES2022 target

**Development:**
- tsx 4.20.4 - TypeScript executor for dev mode

**Testing:**
- Jest 30.0.5 - Test runner and framework
- ts-jest 29.4.1 - Jest transformer for TypeScript

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.24.0 - Why it matters: Core MCP protocol implementation; enables stdio server transport for Claude integration
- chalk 5.6.0 - Terminal color output for logging
- zod 4.0.17 - Runtime schema validation for tool arguments

**Development:**
- @typescript-eslint/parser 8.39.1 - TypeScript parsing for ESLint
- @typescript-eslint/eslint-plugin 8.39.1 - TypeScript-specific ESLint rules
- eslint 9.33.0 - Linting framework
- prettier 3.6.2 - Code formatting
- @types/jest 30.0.0 - TypeScript definitions for Jest
- @types/node 24.3.0 - Node.js type definitions

## Configuration

**Build Configuration:**
- `tsconfig.json`: ES2022 target, ESNext modules, strict mode enabled
- `jest.config.mjs`: ts-jest transformer with ESM support, coverage collection enabled
- `.prettierrc`: Semicolons, trailing commas, single quotes, 80-char printWidth, 2-space tabs

**Language Options:**
- Strict TypeScript mode enabled
- Declaration maps and source maps generated
- Module resolution: Node
- ES modules (ESNext with type: "module" in package.json)

## CLI Integration

**External CLI:**
- @openai/codex CLI (v0.75.0+) - Required runtime dependency, installed separately by users
  - Provides `codex` and `codex review` commands
  - Expects OpenAI API key via `codex login`
  - Wrapper executed via Node's `child_process.spawn()`

## Platform Requirements

**Development:**
- Node.js with npm
- git (for code review features)
- @openai/codex CLI installed globally or available in PATH
- OpenAI API key configured via Codex CLI

**Production:**
- Node.js runtime
- @openai/codex v0.75.0+ installed and available in PATH
- OpenAI API key configured (via `codex login`)

## Scripts

**Build & Run:**
- `npm run build` - Compile TypeScript to dist/
- `npm start` - Run compiled server: `node dist/index.js`
- `npm run dev` - Development mode with tsx (hot reload support)

**Testing:**
- `npm test` - Run Jest test suite
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report (text, lcov, html)

**Code Quality:**
- `npm run lint` - ESLint check on src/**/*.ts
- `npm run lint:fix` - ESLint auto-fix
- `npm run format` - Prettier format all TypeScript files
- `npm run format:check` - Verify Prettier compliance

**Cleanup:**
- `npm run clean` - Remove dist/ directory

## Execution Model

**Entry Point:**
- `src/index.ts` - Shebang script that starts CodexMcpServer
- Compiled to `dist/index.js` with executable marker in package.json bin field
- Registered as MCP server via stdio transport in `.mcp.json`

**Command Execution:**
- All Codex CLI invocations use `child_process.spawn()` with shell inheritance
- Windows compatibility: Args escaped for cmd.exe; shell mode enabled on Windows
- Buffer size capped at 10MB to prevent memory exhaustion
- Both stdout and stderr captured (Codex writes primary output to stderr)

**Session Management:**
- In-memory storage only (InMemorySessionStorage in `src/session/storage.ts`)
- Max 100 concurrent sessions with 24-hour TTL
- Conversation turns stored locally for context building
- Codex conversation IDs extracted from CLI output for resumption

---

*Stack analysis: 2026-02-20*
