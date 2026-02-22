import { askTool } from '../tools/ask.tool.js';
import { suggestTool } from '../tools/suggest.tool.js';
import { executeCommand } from '../utils/command.js';
import { DEFAULT_COPILOT_MODEL, COPILOT_DEFAULT_MODEL_ENV_VAR } from '../types.js';

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

function getCallArgs(): string[] {
  const call = mockedExecuteCommand.mock.calls[0];
  if (!call) throw new Error('executeCommand was not called');
  const args = call[1];
  if (!args) throw new Error('No args in call');
  return args;
}

describe('Edge Cases and Copilot Patterns', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
    mockedExecuteCommand.mockResolvedValue({ stdout: 'Copilot response', stderr: '' });
    delete process.env[COPILOT_DEFAULT_MODEL_ENV_VAR];
  });

  afterEach(() => {
    delete process.env[COPILOT_DEFAULT_MODEL_ENV_VAR];
  });

  test('suggestTool with no target uses default prompt', async () => {
    await suggestTool.execute({ prompt: 'list files' });

    const args = getCallArgs();
    const promptArg = args[1];
    expect(promptArg).toContain('Suggest a command to accomplish: list files');
  });

  test('model parameter is passed through to executeCommand args', async () => {
    await askTool.execute({ prompt: 'test', model: 'gpt-4o' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(modelIndex).toBeGreaterThan(-1);
    expect(args[modelIndex + 1]).toBe('gpt-4o');
  });

  test('addDir parameter results in --add-dir in executeCommand args', async () => {
    await askTool.execute({ prompt: 'test', addDir: '/absolute/path' });

    const args = getCallArgs();
    const addDirIndex = args.indexOf('--add-dir');
    expect(addDirIndex).toBeGreaterThan(-1);
    expect(args[addDirIndex + 1]).toBe('/absolute/path');
  });

  test('COPILOT_DEFAULT_MODEL_ENV_VAR is used when model param is not provided', async () => {
    process.env[COPILOT_DEFAULT_MODEL_ENV_VAR] = 'claude-sonnet-4-5';
    await askTool.execute({ prompt: 'test' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('claude-sonnet-4-5');
  });

  test('empty prompt string is accepted by Zod schema', async () => {
    await expect(askTool.execute({ prompt: '' })).resolves.toBeDefined();
  });

  test('default model gpt-4.1 is used when no model or env var provided', async () => {
    await askTool.execute({ prompt: 'test' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe(DEFAULT_COPILOT_MODEL);
  });
});
