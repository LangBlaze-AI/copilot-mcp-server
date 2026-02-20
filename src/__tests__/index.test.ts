// Mock chalk to avoid ESM issues in Jest
jest.mock('chalk', () => ({
  default: {
    blue: (text: string) => text,
    yellow: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
  },
}));

// Mock command execution to avoid actual copilot calls
jest.mock('../utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    stdout: 'Test Copilot response',
    stderr: '',
  }),
}));

import { TOOLS } from '../types.js';
import { toolDefinitions } from '../tools/definitions.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  toolHandlers,
  AskToolHandler,
  SuggestToolHandler,
  ExplainToolHandler,
  PingToolHandler,
} from '../tools/handlers.js';
import { CopilotMcpServer } from '../server.js';
import { ValidationError } from '../errors.js';
import { executeCommand } from '../utils/command.js';

const mockedExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

function getCallArgs(): string[] {
  const call = mockedExecuteCommand.mock.calls[0];
  if (!call) throw new Error('executeCommand was not called');
  const args = call[1];
  if (!args) throw new Error('No args in call');
  return args;
}

describe('Copilot MCP Server', () => {
  describe('Tool Definitions', () => {
    test('should have exactly 4 tools defined', () => {
      expect(toolDefinitions).toHaveLength(4);
      const toolNames = toolDefinitions.map((tool) => tool.name);
      expect(toolNames).toContain(TOOLS.ASK);
      expect(toolNames).toContain(TOOLS.SUGGEST);
      expect(toolNames).toContain(TOOLS.EXPLAIN);
      expect(toolNames).toContain(TOOLS.PING);
    });

    test('ask tool should have required prompt parameter', () => {
      const askTool = toolDefinitions.find((tool) => tool.name === TOOLS.ASK);
      expect(askTool).toBeDefined();
      expect(askTool?.inputSchema.required).toContain('prompt');
    });

    test('suggest tool should have required prompt parameter', () => {
      const suggestTool = toolDefinitions.find((tool) => tool.name === TOOLS.SUGGEST);
      expect(suggestTool).toBeDefined();
      expect(suggestTool?.inputSchema.required).toContain('prompt');
    });

    test('explain tool should have required command parameter', () => {
      const explainTool = toolDefinitions.find((tool) => tool.name === TOOLS.EXPLAIN);
      expect(explainTool).toBeDefined();
      expect(explainTool?.inputSchema.required).toContain('command');
    });

    test('ping tool should have no required parameters', () => {
      const pingTool = toolDefinitions.find((tool) => tool.name === TOOLS.PING);
      expect(pingTool).toBeDefined();
      expect(pingTool?.inputSchema.required).toEqual([]);
    });
  });

  describe('Tool Handlers', () => {
    beforeEach(() => {
      mockedExecuteCommand.mockClear();
      mockedExecuteCommand.mockResolvedValue({ stdout: 'Test Copilot response', stderr: '' });
    });

    test('should have handlers for all four tools', () => {
      expect(toolHandlers[TOOLS.ASK]).toBeInstanceOf(AskToolHandler);
      expect(toolHandlers[TOOLS.SUGGEST]).toBeInstanceOf(SuggestToolHandler);
      expect(toolHandlers[TOOLS.EXPLAIN]).toBeInstanceOf(ExplainToolHandler);
      expect(toolHandlers[TOOLS.PING]).toBeInstanceOf(PingToolHandler);
    });

    test('all handlers should have execute methods', () => {
      expect(typeof toolHandlers[TOOLS.ASK].execute).toBe('function');
      expect(typeof toolHandlers[TOOLS.SUGGEST].execute).toBe('function');
      expect(typeof toolHandlers[TOOLS.EXPLAIN].execute).toBe('function');
      expect(typeof toolHandlers[TOOLS.PING].execute).toBe('function');
    });

    test('ping handler should return running confirmation without calling executeCommand', async () => {
      const handler = new PingToolHandler();
      const result = await handler.execute({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Copilot MCP Server is running.');
      expect(mockedExecuteCommand).not.toHaveBeenCalled();
    });

    test('ask handler should return stdout content', async () => {
      const handler = new AskToolHandler();
      const result = await handler.execute({ prompt: 'What is TypeScript?' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Test Copilot response');
    });

    test('suggest handler with target=shell constructs prompt with shell command', async () => {
      const handler = new SuggestToolHandler();
      await handler.execute({ prompt: 'list files', target: 'shell' });

      const args = getCallArgs();
      const promptArg = args[1]; // second arg is the prompt after '-p'
      expect(promptArg).toContain('shell command');
    });

    test('suggest handler with target=git constructs prompt with git command', async () => {
      const handler = new SuggestToolHandler();
      await handler.execute({ prompt: 'create branch', target: 'git' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('git command');
    });

    test('suggest handler with target=gh constructs prompt with GitHub CLI (gh)', async () => {
      const handler = new SuggestToolHandler();
      await handler.execute({ prompt: 'list prs', target: 'gh' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('GitHub CLI (gh)');
    });

    test('explain handler wraps command in explain prompt', async () => {
      const handler = new ExplainToolHandler();
      await handler.execute({ command: 'ls -la' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('ls -la');
      expect(promptArg).toContain('Explain');
    });

    test('ask handler with non-absolute addDir throws ValidationError', async () => {
      const handler = new AskToolHandler();
      await expect(
        handler.execute({ prompt: 'test', addDir: 'relative/path' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Server Initialization', () => {
    test('should initialize server with config', () => {
      const config = { name: 'test-server', version: '1.0.0' };
      const server = new CopilotMcpServer(config);
      expect(server).toBeInstanceOf(CopilotMcpServer);
    });
  });

  describe('MCP schema compatibility', () => {
    test('tool results should validate against CallToolResultSchema', () => {
      const result = {
        content: [{ type: 'text', text: 'ok' }],
      };
      const parsed = CallToolResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    test('tool definitions should validate against ListToolsResultSchema', () => {
      const parsed = ListToolsResultSchema.safeParse({
        tools: toolDefinitions,
      });
      expect(parsed.success).toBe(true);
    });
  });
});
