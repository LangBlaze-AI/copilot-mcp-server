import { askTool } from '../tools/ask.tool.js';
import { suggestTool } from '../tools/suggest.tool.js';
import { explainTool } from '../tools/explain.tool.js';
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

  test('askTool rejects with ToolExecutionError when executeCommand rejects', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('command failed with exit code 1'));
    await expect(askTool.execute({ prompt: 'Test prompt' })).rejects.toThrow(ToolExecutionError);
  });

  test('suggestTool rejects with ToolExecutionError on command failure', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('copilot not found'));
    await expect(suggestTool.execute({ prompt: 'list files' })).rejects.toThrow(ToolExecutionError);
  });

  test('explainTool rejects with ToolExecutionError on command failure', async () => {
    mockedExecuteCommand.mockRejectedValue(new Error('copilot not found'));
    await expect(explainTool.execute({ command: 'ls -la' })).rejects.toThrow(ToolExecutionError);
  });

  test('askTool rejects with ValidationError when addDir contains null byte', async () => {
    await expect(
      askTool.execute({ prompt: 'test', addDir: '/path/\0with-null' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('askTool rejects with ValidationError when addDir contains path traversal', async () => {
    await expect(
      askTool.execute({ prompt: 'test', addDir: '/path/../traversal' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('askTool rejects with ValidationError when addDir is not absolute', async () => {
    await expect(
      askTool.execute({ prompt: 'test', addDir: 'relative/path' })
    ).rejects.toThrow(ValidationError);
    expect(mockedExecuteCommand).not.toHaveBeenCalled();
  });

  test('askTool throws ToolExecutionError when stdout empty and stderr non-empty', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'quota error' });
    await expect(askTool.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
  });
});

describe('Phase 2: Hardened Error Handling', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
  });

  // ERR-01: ENOENT — binary not found
  test('askTool: ENOENT produces user-readable install message, not raw ENOENT', async () => {
    const enoentError = Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' });
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError(
        'copilot',
        'Binary not found: "copilot". If using the default copilot binary, install it from: https://github.com/github/gh-copilot. If using COPILOT_BINARY_PATH, verify the path is correct.',
        enoentError
      )
    );
    const rejection = askTool.execute({ prompt: 'test' });
    await expect(rejection).rejects.toThrow(ToolExecutionError);
    await expect(rejection).rejects.toThrow(/not found|not installed/i);
    // Raw 'ENOENT' string must NOT appear in the ToolExecutionError message
    try {
      await askTool.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\bENOENT\b/);
    }
  });

  // ERR-02: Quota exhaustion
  test('askTool: quota error produces "quota exceeded" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 402: quota exceeded', new Error('quota'))
    );
    await expect(askTool.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await askTool.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).toMatch(/quota exceeded/i);
    }
  });

  // ERR-03: Auth failure
  test('askTool: auth error produces "authentication failed" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 401: unauthorized', new Error('auth'))
    );
    await expect(askTool.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await askTool.execute({ prompt: 'test' });
    } catch (e) {
      expect((e as Error).message).toMatch(/authentication failed/i);
    }
  });

  // ERR-04: Timeout
  test('askTool: timeout error propagates timed-out message', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command timed out after 60000ms', new Error('Timeout'))
    );
    await expect(askTool.execute({ prompt: 'test' })).rejects.toThrow(ToolExecutionError);
    try {
      await askTool.execute({ prompt: 'test' });
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

  // CLI-06: ANSI stripping via extractResponse
  test('askTool: ANSI escape codes in stdout are stripped from response', async () => {
    // stdout contains ANSI red color sequence around the response text
    const ansiStdout = '\u001B[31mHello from Copilot\u001B[0m';
    mockedExecuteCommand.mockResolvedValue({ stdout: ansiStdout, stderr: '' });
    const result = await askTool.execute({ prompt: 'test' });
    expect(result).toBe('Hello from Copilot');
    // ANSI escape sequence must not appear in output
    expect(result).not.toContain('\u001B');
  });

  // suggestTool and explainTool: verify they also classify errors
  test('suggestTool: auth error produces "authentication failed" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 401: unauthenticated', new Error('auth'))
    );
    await expect(suggestTool.execute({ prompt: 'list files' })).rejects.toThrow(ToolExecutionError);
    try {
      await suggestTool.execute({ prompt: 'list files' });
    } catch (e) {
      expect((e as Error).message).toMatch(/authentication failed/i);
    }
  });

  test('explainTool: quota error produces "quota exceeded" classification', async () => {
    mockedExecuteCommand.mockRejectedValue(
      new CommandExecutionError('copilot', 'Command failed with exit code 402: rate limit exceeded', new Error('quota'))
    );
    await expect(explainTool.execute({ command: 'ls -la' })).rejects.toThrow(ToolExecutionError);
    try {
      await explainTool.execute({ command: 'ls -la' });
    } catch (e) {
      expect((e as Error).message).toMatch(/quota exceeded/i);
    }
  });
});

describe('Hybrid Soft Timeout', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
  });

  // Soft timeout resolves (does not throw) with partial output prefix
  test('askTool: soft timeout resolves with partial output prefix', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: '[Soft timeout - partial output]\nPartial Copilot response',
      stderr: '',
    });
    const result = await askTool.execute({ prompt: 'test', softTimeoutMs: 5000 });
    expect(result).toContain('[Soft timeout - partial output]');
    expect(result).toContain('Partial Copilot response');
  });

  // Soft timeout with no output yet still resolves (not rejects)
  test('askTool: soft timeout with empty stdout resolves to prefix only', async () => {
    mockedExecuteCommand.mockResolvedValue({
      stdout: '[Soft timeout - partial output]\n',
      stderr: '',
    });
    const result = await askTool.execute({ prompt: 'test', softTimeoutMs: 1000 });
    expect(result).toContain('[Soft timeout - partial output]');
  });

  // softTimeoutMs is forwarded to executeCommand
  test('askTool: passes softTimeoutMs to executeCommand', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: 'response', stderr: '' });
    await askTool.execute({ prompt: 'hello', softTimeoutMs: 30000 });
    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      expect.objectContaining({ softTimeoutMs: 30000 })
    );
  });

  // Time budget prefix is injected into the prompt when softTimeoutMs is set
  test('askTool: injects time budget prefix into prompt when softTimeoutMs is set', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: 'response', stderr: '' });
    await askTool.execute({ prompt: 'my question', softTimeoutMs: 1800000 });
    const calledArgs = mockedExecuteCommand.mock.calls[0][1] as string[];
    const promptArg = calledArgs[calledArgs.indexOf('-p') + 1];
    expect(promptArg).toContain('[Time budget: 30m.');
    expect(promptArg).toContain('my question');
  });

  // Without softTimeoutMs, no time budget prefix is injected
  test('askTool: no time budget prefix when softTimeoutMs is absent', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: 'response', stderr: '' });
    await askTool.execute({ prompt: 'my question' });
    const calledArgs = mockedExecuteCommand.mock.calls[0][1] as string[];
    const promptArg = calledArgs[calledArgs.indexOf('-p') + 1];
    expect(promptArg).not.toContain('[Time budget:');
    expect(promptArg).toBe('my question');
  });

  // suggestTool also supports softTimeoutMs
  test('suggestTool: passes softTimeoutMs to executeCommand', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: 'ls -la', stderr: '' });
    await suggestTool.execute({ prompt: 'list files', softTimeoutMs: 10000 });
    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      expect.objectContaining({ softTimeoutMs: 10000 })
    );
  });

  // explainTool also supports softTimeoutMs
  test('explainTool: passes softTimeoutMs to executeCommand', async () => {
    mockedExecuteCommand.mockResolvedValue({ stdout: 'Lists files', stderr: '' });
    await explainTool.execute({ command: 'ls -la', softTimeoutMs: 10000 });
    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      expect.objectContaining({ softTimeoutMs: 10000 })
    );
  });
});
