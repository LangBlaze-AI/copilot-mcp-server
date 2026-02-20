# Testing Patterns

**Analysis Date:** 2026-02-20

## Test Framework

**Runner:**
- Jest 30.0.5
- Config: `jest.config.mjs` (ES module format)
- Preset: `ts-jest/presets/default-esm` for TypeScript support with ESM

**Assertion Library:**
- Jest built-in matchers: `expect()`, `toEqual()`, `toContain()`, `toThrow()`, `rejects.toThrow()`

**Run Commands:**
```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Generate coverage report
```

## Test File Organization

**Location:**
- Colocated in `src/__tests__/` directory (not alongside source files)
- Alternative: `src/**/*.test.ts` pattern also detected (via glob pattern in jest.config.mjs)

**Naming:**
- `[feature].test.ts` format: `index.test.ts`, `edge-cases.test.ts`, `error-scenarios.test.ts`
- Related tests grouped in single file by feature or component

**Structure:**
```
src/__tests__/
├── index.test.ts                 # Tool definitions, handlers, server init
├── session.test.ts               # InMemorySessionStorage tests
├── context-building.test.ts      # Prompt enhancement logic
├── edge-cases.test.ts            # Session ID formats, long contexts
├── error-scenarios.test.ts       # Error handling and validation
├── model-selection.test.ts       # Model parameter handling
├── default-model.test.ts         # Default model configuration
├── resume-functionality.test.ts  # Session resume behavior
└── mcp-stdio.test.ts             # MCP protocol compliance
```

## Test Structure

**Suite Organization:**
```typescript
import { CodexToolHandler } from '../tools/handlers.js';
import { InMemorySessionStorage } from '../session/storage.js';
import { executeCommand } from '../utils/command.js';

// Mock setup at top of file
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockedExecuteCommand = executeCommand as jest.MockedFunction<
  typeof executeCommand
>;

describe('Edge Cases and Integration Issues', () => {
  let handler: CodexToolHandler;
  let sessionStorage: InMemorySessionStorage;

  beforeEach(() => {
    sessionStorage = new InMemorySessionStorage();
    handler = new CodexToolHandler(sessionStorage);
    mockedExecuteCommand.mockClear();
  });

  test('should handle model parameters with resume', async () => {
    // Test body
  });
});
```

**Patterns:**
- Describe block per feature/component
- BeforeEach hooks for test setup and mock clearing
- BeforeAll/AfterAll for environment preservation (e.g., `process.env` state)
- Async tests using `async/await` syntax
- Typed mock functions: `jest.MockedFunction<typeof executeCommand>`

## Mocking

**Framework:** Jest mocking (jest.mock)

**Patterns:**
```typescript
// Mock entire module
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    stdout: 'mocked output',
    stderr: '',
  }),
}));

// Mock chalk to avoid ESM issues
jest.mock('chalk', () => ({
  default: {
    blue: (text: string) => text,
    yellow: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
  },
}));

// Use mocked function in tests
const mockedExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

beforeEach(() => {
  mockedExecuteCommand.mockClear();
  mockedExecuteCommand.mockResolvedValue({ stdout: 'Response', stderr: '' });
  // Or mockRejectedValue for error cases
});

// Verify mock calls
expect(mockedExecuteCommand).toHaveBeenCalledWith('codex', ['exec', '--model', 'gpt-4']);
expect(mockedExecuteCommand).not.toHaveBeenCalled();
const call = mockedExecuteCommand.mock.calls[0];
```

**What to Mock:**
- External command execution: `executeCommand`, `executeCommandStreaming`
- Third-party packages with side effects: `chalk` (to avoid color codes in test output)
- Environment variables for feature flags

**What NOT to Mock:**
- Internal storage classes: `InMemorySessionStorage` instantiated in tests
- Handler classes: instantiated directly for unit testing
- Zod schemas: tested directly for validation behavior
- MCP SDK types and schemas: tested for protocol compatibility

## Fixtures and Factories

**Test Data:**
```typescript
// Session creation
const sessionId = sessionStorage.createSession();

// Adding conversation turns
sessionStorage.addTurn(sessionId, {
  prompt: 'What is recursion?',
  response: 'Recursion is a programming technique where a function calls itself.',
  timestamp: new Date(),
});

// Handler instantiation
const handler = new CodexToolHandler(sessionStorage);

// Default test contexts
const defaultContext: ToolHandlerContext = {
  sendProgress: async () => {},
};
```

**Location:**
- No separate fixtures directory
- Test data created inline in test bodies using builder pattern
- Mock responses created in beforeEach hooks

## Coverage

**Requirements:** Not enforced (no threshold in jest.config.mjs)

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage Configuration:**
- Collects from `src/**/*.ts` excluding `**/*.d.ts` and `**/__tests__/**`
- Reports in text, lcov (HTML), and HTML formats
- Output to `coverage/` directory

## Test Types

**Unit Tests:**
- Test individual handler classes in isolation
- Mock external dependencies (command execution, storage)
- Example: `PingToolHandler.execute()` returns correct message
- Scope: Single class or function, ~1 assertion per test
- Location: Each feature has dedicated test file

**Integration Tests:**
- Test handlers with real InMemorySessionStorage
- Mock only command execution
- Verify session management, context building, metadata
- Example: `CodexToolHandler` with real sessions extracts conversation IDs correctly
- Scope: Handler + storage interaction
- Location: `context-building.test.ts`, `resume-functionality.test.ts`, `session.test.ts`

**E2E Tests:**
- Build test via `npm run build` to verify TypeScript compilation
- MCP schema validation: verify tool results conform to MCP SDK types
- Example: `CallToolResultSchema.safeParse(result)` succeeds for all handlers
- Not full e2e against real MCP server (not feasible without running server)

## Common Patterns

**Async Testing:**
```typescript
test('should handle model parameters with resume', async () => {
  // Setup
  const sessionId = sessionStorage.createSession();
  sessionStorage.setCodexConversationId(sessionId, 'existing-conv-id');
  mockedExecuteCommand.mockResolvedValue({ stdout: 'Response', stderr: '' });

  // Execute
  await handler.execute({
    prompt: 'Use different model',
    sessionId,
    model: 'gpt-4',
  });

  // Assert
  const call = mockedExecuteCommand.mock.calls[0];
  expect(call[1]).toEqual([
    'exec',
    '--skip-git-repo-check',
    '-c',
    'model="gpt-4"',
    // ... rest of args
  ]);
});
```

**Error Testing:**
```typescript
test('should handle codex CLI authentication errors', async () => {
  mockedExecuteCommand.mockRejectedValue(
    new Error('Authentication failed: Please run `codex login`')
  );

  await expect(
    handler.execute({ prompt: 'Test prompt' })
  ).rejects.toThrow(ToolExecutionError);
});

// Or for validation errors
test('should reject review prompt with uncommitted', async () => {
  const reviewHandler = new ReviewToolHandler();

  await expect(
    reviewHandler.execute({
      prompt: 'Review instructions',
      uncommitted: true,
    })
  ).rejects.toThrow(ValidationError);

  expect(mockedExecuteCommand).not.toHaveBeenCalled();
});
```

**Environment Variable Testing:**
```typescript
describe('Context Building Analysis', () => {
  let originalStructuredContent: string | undefined;

  beforeAll(() => {
    originalStructuredContent = process.env.STRUCTURED_CONTENT_ENABLED;
  });

  afterAll(() => {
    if (originalStructuredContent) {
      process.env.STRUCTURED_CONTENT_ENABLED = originalStructuredContent;
    } else {
      delete process.env.STRUCTURED_CONTENT_ENABLED;
    }
  });

  beforeEach(() => {
    process.env.STRUCTURED_CONTENT_ENABLED = '1';
  });

  test('should build enhanced prompt correctly', async () => {
    // Test with env var set
  });
});
```

**Validation Testing:**
```typescript
test('should reject invalid sessionId values', async () => {
  await expect(
    handler.execute({
      prompt: 'Test prompt',
      sessionId: 'bad id', // Contains space, invalid
    })
  ).rejects.toThrow(ValidationError);

  expect(mockedExecuteCommand).not.toHaveBeenCalled();
});
```

---

*Testing analysis: 2026-02-20*
