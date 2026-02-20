import {
  AskToolHandler,
  SuggestToolHandler,
  ExplainToolHandler,
} from '../tools/handlers.js';
import { executeCommand } from '../utils/command.js';
import { ToolExecutionError, ValidationError, CommandExecutionError, scrubTokens } from '../errors.js';

// Mock the command execution
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

jest.mock('chalk', () => ({
  default: {
    blue: (text: string) => text,
    yellow: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
  },
}));

const mockedExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('Error Handling Scenarios', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
  });

  test('AskToolHandler rejects with ToolExecutionError when executeCommand rejects', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('command failed with exit code 1'));
    const handler = new AskToolHandler();
    await expect(handler.execute({ prompt: 'Test prompt' })).rejects.toThrow(ToolExecutionError);
  });

  test('SuggestToolHandler rejects with ToolExecutionError on command failure', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('copilot not found'));
    const handler = new SuggestToolHandler();
    await expect(handler.execute({ prompt: 'list files' })).rejects.toThrow(ToolExecutionError);
  });

  test('ExplainToolHandler rejects with ToolExecutionError on command failure', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('copilot not found'));
    const handler = new ExplainToolHandler();
    await expect(handler.execute({ command: 'ls -la' })).rejects.toThrow(ToolExecutionError);
  });

  test('AskToolHandler rejects with ValidationError when addDir contains null byte', async () => {
    const handler = new AskToolHandler();
    await expect(
      handler.execute({ prompt: 'test', addDir: '/path/\0with-null' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('AskToolHandler rejects with ValidationError when addDir contains path traversal', async () => {
    const handler = new AskToolHandler();
    await expect(
      handler.execute({ prompt: 'test', addDir: '/path/../traversal' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('AskToolHandler rejects with ValidationError when addDir is not absolute', async () => {
    const handler = new AskToolHandler();
    await expect(
      handler.execute({ prompt: 'test', addDir: 'relative/path' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('AskToolHandler throws ToolExecutionError when stdout empty and stderr non-empty', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'quota error' });
    const handler = new AskToolHandler();
    await expect(handler.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
  });
});

describe('Phase 2: Hardened Error Handling', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
  });

  // ERR-01: ENOENT — binary not found
  test('AskToolHandler: ENOENT produces user-readable install message, not raw ENOENT', async () => {
    const enoentError = Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' });
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError(
        'copilot',
        'Binary not found: "copilot". If using the default copilot binary, install it from: https://github.com/github/gh-copilot. If using COPILOT_BINARY_PATH, verify the path is correct.',
        enoentError
      )
    );
    const handler = new AskToolHandler();
    const rejection = handler.execute({ prompt: 'test' });
    await expect(rejection).rejects.toThrow(ToolExecutionError);
    await expect(rejection).rejects.toThrow(/not found|not installed/i);
    // Raw 'ENOENT' string must NOT appear in the ToolExecutionError message
    try {
      await handler.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\bENOENT\b/);
    }
  });

  // ERR-02: Quota exhaustion
  test('AskToolHandler: quota error produces "quota exceeded" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 402: quota exceeded', new Error('quota'))
    );
    const handler = new AskToolHandler();
    await expect(handler.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await handler.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).toMatch(/quota exceeded/i);
    }
  });

  // ERR-03: Auth failure
  test('AskToolHandler: auth error produces "authentication failed" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 401: unauthorized', new Error('auth'))
    );
    const handler = new AskToolHandler();
    await expect(handler.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await handler.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).toMatch(/authentication failed/i);
    }
  });

  // ERR-04: Timeout
  test('AskToolHandler: timeout error propagates timed-out message', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command timed out after 60000ms', new Error('Timeout'))
    );
    const handler = new AskToolHandler();
    await expect(handler.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await handler.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).toMatch(/timed out/i);
    }
  });

  // SEC-01: Token scrubbing via scrubTokens()
  test('scrubTokens: replaces token value with [REDACTED]', () => {
    const fakeToken = 'ghp_testtoken12345678901234567890123456';
    const original = process.env['GH_TOKEN'];
    process.env['GH_TOKEN'] = fakeToken;
    try {
      const rawMessage = `Authentication failed with token: ${fakeToken}`;
      const scrubbed = scrubTokens(rawMessage);
      expect(scrubbed).not.toContain(fakeToken);
      expect(scrubbed).toContain('[REDACTED]');
    } finally {
      if (original === undefined) {
        delete process.env['GH_TOKEN'];
      } else {
        process.env['GH_TOKEN'] = original;
      }
    }
  });

  test('scrubTokens: short token values (<=4 chars) are NOT scrubbed (guard prevents word corruption)', () => {
    const original = process.env['GH_TOKEN'];
    process.env['GH_TOKEN'] = 'ab';
    try {
      const message = 'error message with ab in it';
      expect(scrubTokens(message)).toBe(message); // unchanged — guard prevents short replacements
    } finally {
      if (original === undefined) {
        delete process.env['GH_TOKEN'];
      } else {
        process.env['GH_TOKEN'] = original;
      }
    }
  });

  // CLI-06: ANSI stripping via handler
  test('AskToolHandler: ANSI escape codes in stdout are stripped from response', async () => {
    // stdout contains ANSI red color sequence around the response text
    const ansiStdout = '\u001B[31mHello from Copilot\u001B[0m';
    mockedExecuteCommand.mockResolvedValue({ stdout: ansiStdout, stderr: '' });
    const handler = new AskToolHandler();
    const result = await handler.execute({ prompt: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toBe('Hello from Copilot');
    // ANSI escape sequence must not appear in output
    expect(text).not.toContain('\u001B');
  });

  // SuggestToolHandler and ExplainToolHandler: verify they also classify errors
  test('SuggestToolHandler: auth error produces "authentication failed" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 401: unauthenticated', new Error('auth'))
    );
    const handler = new SuggestToolHandler();
    await expect(handler.execute({ prompt: 'list files' })).rejects.toThrow(ToolExecutionError);
    try {
      await handler.execute({ prompt: 'list files' });
    } catch (e) {
      expect((e as Error).message).toMatch(/authentication failed/i);
    }
  });

  test('ExplainToolHandler: quota error produces "quota exceeded" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 402: rate limit exceeded', new Error('quota'))
    );
    const handler = new ExplainToolHandler();
    await expect(handler.execute({ command: 'ls -la' })).rejects.toThrow(ToolExecutionError);
    try {
      await handler.execute({ command: 'ls -la' });
    } catch (e) {
      expect((e as Error).message).toMatch(/quota exceeded/i);
    }
  });
});
