import { askTool } from '../tools/ask.tool.js';
import { executeCommand } from '../utils/command.js';
import { COPILOT_DEFAULT_MODEL_ENV_VAR, DEFAULT_COPILOT_MODEL } from '../types.js';

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

describe('Model Selection', () => {
  beforeEach(() => {
    mockedExecuteCommand.mockClear();
    mockedExecuteCommand.mockResolvedValue({ stdout: 'response', stderr: '' });
    delete process.env[COPILOT_DEFAULT_MODEL_ENV_VAR];
  });

  afterEach(() => {
    delete process.env[COPILOT_DEFAULT_MODEL_ENV_VAR];
  });

  test('passing model gpt-4o results in --model gpt-4o in executeCommand args', async () => {
    await askTool.execute({ prompt: 'test', model: 'gpt-4o' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('gpt-4o');
  });

  test('passing model claude-sonnet-4-5 results in --model claude-sonnet-4-5', async () => {
    await askTool.execute({ prompt: 'test', model: 'claude-sonnet-4-5' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('claude-sonnet-4-5');
  });

  test('not passing model results in --model gpt-4.1 (DEFAULT_COPILOT_MODEL)', async () => {
    await askTool.execute({ prompt: 'test' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe(DEFAULT_COPILOT_MODEL);
  });

  test('model from COPILOT_DEFAULT_MODEL_ENV_VAR is used when model param is absent', async () => {
    process.env[COPILOT_DEFAULT_MODEL_ENV_VAR] = 'custom-model';
    await askTool.execute({ prompt: 'test' });

    const args = getCallArgs();
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('custom-model');
  });
});
