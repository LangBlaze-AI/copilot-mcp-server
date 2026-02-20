import {
  AskToolHandler,
  SuggestToolHandler,
  ExplainToolHandler,
} from '../tools/handlers.js';
import { executeCommand } from '../utils/command.js';
import { ToolExecutionError, ValidationError } from '../errors.js';

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
