# Coding Conventions

**Analysis Date:** 2026-02-20

## Naming Patterns

**Files:**
- Lowercase with hyphens for multi-word names: `context-building.test.ts`, `error-scenarios.test.ts`
- Classes and interfaces have `.ts` extension
- Test files follow pattern: `[name].test.ts` or `[name].spec.ts`

**Functions:**
- camelCase for function names and methods: `executeCommand`, `buildEnhancedPrompt`, `createSession`, `setCodexConversationId`
- Async functions return `Promise<T>`: `async function executeCommand()`
- Private methods prefixed with `private`: `private buildEnhancedPrompt()`, `private cleanupExpiredSessions()`
- Handler methods named `execute`: All tool handlers implement `async execute(args, context)`

**Variables:**
- camelCase for const and let declarations: `sessionStorage`, `mockedExecuteCommand`, `cmdArgs`
- UPPERCASE_SNAKE_CASE for constants: `DEFAULT_CODEX_MODEL`, `MAX_BUFFER_SIZE`, `PROGRESS_DEBOUNCE_MS`
- Prefix unused parameters with underscore: `_context`, `_meta` (see eslint rule: `argsIgnorePattern: '^_'`)
- Prefix private instance variables with `private readonly`: `private readonly sessionStorage`, `private readonly config`

**Types:**
- PascalCase for interfaces and types: `ServerConfig`, `ToolHandlerContext`, `ToolResult`, `ConversationTurn`
- Type aliases with `type` keyword: `type ToolName`, `type ProgressToken`, `type CommandResult`
- Error classes extend Error: `class ToolExecutionError extends Error`
- Enums use `as const` pattern for type-safe constants: `const TOOLS = { CODEX: 'codex', ... } as const`

## Code Style

**Formatting:**
- Tool: Prettier
- Configured in `.prettierrc`:
  - `semi: true` - Semicolons required
  - `singleQuote: true` - Use single quotes
  - `printWidth: 80` - Line width limit of 80 characters
  - `tabWidth: 2` - 2 spaces for indentation
  - `useTabs: false` - Spaces not tabs
  - `bracketSpacing: true` - Space inside object literals
  - `arrowParens: always` - Always include parentheses around arrow function parameters
  - `endOfLine: lf` - Unix line endings

**Linting:**
- Tool: ESLint (ESLint 9.x flat config with @typescript-eslint plugins)
- Config file: `eslint.config.mjs` (flat config format)
- Key rules:
  - `@typescript-eslint/no-unused-vars`: Error with `argsIgnorePattern: '^_'` - unused params starting with `_` allowed
  - `@typescript-eslint/explicit-function-return-type`: Off - return types inferred
  - `@typescript-eslint/no-explicit-any`: Warn - avoid `any` but not required
  - `no-console`: Off - console output allowed (used for logging)
  - `eol-last`: Error - require newline at end of file
- Strict mode enabled: applies both recommended and strict TypeScript rules

## Import Organization

**Order:**
1. Standard library imports: `import { spawn } from 'child_process'`
2. Third-party packages: `import chalk from 'chalk'`, `import { z } from 'zod'`
3. MCP SDK imports: `import { Server } from '@modelcontextprotocol/sdk/server/index.js'`
4. Internal imports with `.js` extension (ES modules): `import { CodexMcpServer } from './server.js'`
5. Type-only imports use `type` keyword: `import { type ServerConfig, type ToolName } from './types.js'`

**Path Aliases:**
- None configured - uses relative paths or full module paths from src root
- All ES module imports include `.js` extension (even for `.ts` files)

## Error Handling

**Patterns:**
- Custom error classes: `ToolExecutionError`, `CommandExecutionError`, `ValidationError`
- All custom errors extend Error base class and include meaningful context
- Error class structure includes public properties for context:
  ```typescript
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`Failed to execute tool "${toolName}": ${message}`);
    this.name = 'ToolExecutionError';
  }
  ```
- Validation via Zod schemas with error handling:
  ```typescript
  try {
    const args: CodexToolArgs = CodexToolSchema.parse(args);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(TOOLS.CODEX, error.message);
    }
  }
  ```
- Progress notifications wrapped in try-catch to not fail operations:
  ```typescript
  try {
    await extra.sendNotification({ ... });
  } catch (err) {
    console.error(chalk.yellow('Failed to send progress notification:'), err);
  }
  ```
- Error handling in command execution: distinguishes between exit codes and actual failures
  ```typescript
  if (code === 0 || stdout || stderr) {
    resolve({ stdout, stderr });
  } else {
    reject(new CommandExecutionError(...));
  }
  ```

## Logging

**Framework:** console (Node.js built-in) with chalk for colors

**Patterns:**
- `console.error()` for all output (MCP uses stderr for logging to avoid mixing with tool output)
- Colored logging with chalk:
  - `chalk.blue()` for general execution logs
  - `chalk.yellow()` for warnings
  - `chalk.green()` for success messages
  - `chalk.red()` for errors
- Example: `console.error(chalk.blue('Executing:'), file, args.join(' '))`
- No structured logging - simple formatted strings

## Comments

**When to Comment:**
- Complex algorithms get JSDoc comments explaining intent
- Public class methods and functions have descriptive blocks
- Edge cases and platform-specific behavior (e.g., Windows shell escaping)
- Limitations and workarounds noted inline

**JSDoc/TSDoc:**
- Functions use JSDoc blocks for documentation:
  ```typescript
  /**
   * Execute a command with streaming output support.
   * Calls onProgress callback with each chunk of output for real-time feedback.
   *
   * Note: Unlike executeCommand, this function treats stderr output as success
   * because tools like codex write their primary output to stderr.
   */
  export async function executeCommandStreaming(...): Promise<CommandResult>
  ```
- Exported interfaces and types documented with comments
- Private implementation details often documented inline

## Function Design

**Size:** Functions typically 20-50 lines for handlers, up to 100+ for complex command builders
- Large functions broken into smaller private helpers (e.g., `buildEnhancedPrompt`)
- Handler methods follow single responsibility: parse args, validate, execute, return result

**Parameters:**
- Destructuring used for complex parameters:
  ```typescript
  const { prompt, sessionId, resetSession, model, ... }: CodexToolArgs = CodexToolSchema.parse(args);
  ```
- Default values for optional context: `context: ToolHandlerContext = defaultContext`
- Options object for configuration: `options: StreamingCommandOptions = {}`

**Return Values:**
- Type-annotated return types for public functions: `async function executeCommand(...): Promise<CommandResult>`
- Explicit return types for handlers: `Promise<ToolResult>`
- Standard return structure: `{ content: [...], isError?: boolean, structuredContent?: ... }`

## Module Design

**Exports:**
- Classes exported as named exports: `export class CodexMcpServer`
- Functions exported as named exports: `export async function executeCommand`
- Const assertions exported: `export const TOOLS = { ... } as const`
- Handlers exported as registry object: `export const toolHandlers = { [TOOLS.CODEX]: ..., ... } as const`

**Barrel Files:**
- No barrel file pattern (`index.ts` exports everything)
- Direct imports preferred: `import { toolHandlers } from '../tools/handlers.js'`

**Singleton Pattern:**
- Session storage instantiated once and shared: `const sessionStorage = new InMemorySessionStorage();`
- Handlers use shared storage instance via constructor injection

---

*Convention analysis: 2026-02-20*
