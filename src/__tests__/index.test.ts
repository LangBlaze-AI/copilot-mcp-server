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
import {
  getToolDefinitions,
  toolExists,
} from '../tools/index.js';
import { askTool } from '../tools/ask.tool.js';
import { suggestTool } from '../tools/suggest.tool.js';
import { explainTool } from '../tools/explain.tool.js';
import { pingTool } from '../tools/simple-tools.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
    test('should have exactly 5 tools defined', () => {
      const defs = getToolDefinitions();
      expect(defs).toHaveLength(5);
      const toolNames = defs.map((tool) => tool.name);
      expect(toolNames).toContain(TOOLS.ASK);
      expect(toolNames).toContain(TOOLS.SUGGEST);
      expect(toolNames).toContain(TOOLS.EXPLAIN);
      expect(toolNames).toContain(TOOLS.PING);
      expect(toolNames).toContain(TOOLS.IDENTITY);
    });

    test('ask tool should have required prompt parameter', () => {
      const def = getToolDefinitions().find((tool) => tool.name === TOOLS.ASK);
      expect(def).toBeDefined();
      expect(def?.inputSchema.required).toContain('prompt');
    });

    test('suggest tool should have required prompt parameter', () => {
      const def = getToolDefinitions().find((tool) => tool.name === TOOLS.SUGGEST);
      expect(def).toBeDefined();
      expect(def?.inputSchema.required).toContain('prompt');
    });

    test('explain tool should have required command parameter', () => {
      const def = getToolDefinitions().find((tool) => tool.name === TOOLS.EXPLAIN);
      expect(def).toBeDefined();
      expect(def?.inputSchema.required).toContain('command');
    });

    test('ping tool should have no required parameters', () => {
      const def = getToolDefinitions().find((tool) => tool.name === TOOLS.PING);
      expect(def).toBeDefined();
      expect(def?.inputSchema.required).toEqual([]);
    });
  });

  describe('Tool Registry', () => {
    beforeEach(() => {
      mockedExecuteCommand.mockClear();
      mockedExecuteCommand.mockResolvedValue({ stdout: 'Test Copilot response', stderr: '' });
    });

    test('should have all four tools registered', () => {
      expect(toolExists(TOOLS.ASK)).toBe(true);
      expect(toolExists(TOOLS.SUGGEST)).toBe(true);
      expect(toolExists(TOOLS.EXPLAIN)).toBe(true);
      expect(toolExists(TOOLS.PING)).toBe(true);
    });

    test('all tools should have execute methods', () => {
      expect(typeof askTool.execute).toBe('function');
      expect(typeof suggestTool.execute).toBe('function');
      expect(typeof explainTool.execute).toBe('function');
      expect(typeof pingTool.execute).toBe('function');
    });

    test('ping tool should return running confirmation without calling executeCommand', async () => {
      const result = await pingTool.execute({});

      expect(result).toBe('Copilot MCP Server is running.');
      expect(mockedExecuteCommand).not.toHaveBeenCalled();
    });

    test('ask tool should return stdout content', async () => {
      const result = await askTool.execute({ prompt: 'What is TypeScript?' });

      expect(result).toBe('Test Copilot response');
    });

    test('suggest tool with target=shell constructs prompt with shell command', async () => {
      await suggestTool.execute({ prompt: 'list files', target: 'shell' });

      const args = getCallArgs();
      const promptArg = args[1]; // second arg is the prompt after '-p'
      expect(promptArg).toContain('shell command');
    });

    test('suggest tool with target=git constructs prompt with git command', async () => {
      await suggestTool.execute({ prompt: 'create branch', target: 'git' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('git command');
    });

    test('suggest tool with target=gh constructs prompt with GitHub CLI (gh)', async () => {
      await suggestTool.execute({ prompt: 'list prs', target: 'gh' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('GitHub CLI (gh)');
    });

    test('explain tool wraps command in explain prompt', async () => {
      await explainTool.execute({ command: 'ls -la' });

      const args = getCallArgs();
      const promptArg = args[1];
      expect(promptArg).toContain('ls -la');
      expect(promptArg).toContain('Explain');
    });

    test('ask tool with non-absolute addDir throws ValidationError', async () => {
      await expect(
        askTool.execute({ prompt: 'test', addDir: 'relative/path' })
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
        tools: getToolDefinitions(),
      });
      expect(parsed.success).toBe(true);
    });
  });
});
