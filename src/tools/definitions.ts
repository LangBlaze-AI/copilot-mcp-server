import { TOOLS, type ToolDefinition } from '../types.js';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: TOOLS.ASK,
    description:
      'Ask GitHub Copilot a question or give it a task using natural language. ' +
      'Copilot runs in agent mode with --allow-all-tools enabled, meaning it can execute ' +
      'shell commands and read files on your behalf. Use this for open-ended coding questions, ' +
      'code generation, refactoring guidance, or any task requiring Copilot\'s full capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The natural language prompt or question for Copilot' },
        model: { type: 'string', description: 'AI model to use (default: gpt-4.1). Example: gpt-4o, claude-sonnet-4-5' },
        addDir: { type: 'string', description: 'Absolute path to an additional directory to expose to the Copilot agent' },
        softTimeoutMs: { type: 'number', description: 'Soft timeout in milliseconds. Resolves early with partial output instead of blocking until the 60s hard timeout. Copilot is also told the time budget so it can self-regulate.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: TOOLS.SUGGEST,
    description:
      'Ask GitHub Copilot to suggest a shell, git, or gh CLI command for a given task. ' +
      'Use the optional target parameter to scope the suggestion type.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Describe what you want to accomplish' },
        target: {
          type: 'string',
          enum: ['shell', 'git', 'gh'],
          description: 'Scope the command suggestion: shell (default), git, or gh (GitHub CLI)',
        },
        model: { type: 'string', description: 'AI model to use (default: gpt-4.1)' },
        addDir: { type: 'string', description: 'Absolute path to an additional directory to expose to the Copilot agent' },
        softTimeoutMs: { type: 'number', description: 'Soft timeout in milliseconds. Resolves early with partial output instead of blocking until the 60s hard timeout. Copilot is also told the time budget so it can self-regulate.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: TOOLS.EXPLAIN,
    description:
      'Ask GitHub Copilot to explain what a shell command does in plain language.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command string to explain' },
        model: { type: 'string', description: 'AI model to use (default: gpt-4.1)' },
        addDir: { type: 'string', description: 'Absolute path to an additional directory to expose to the Copilot agent' },
        softTimeoutMs: { type: 'number', description: 'Soft timeout in milliseconds. Resolves early with partial output instead of blocking until the 60s hard timeout. Copilot is also told the time budget so it can self-regulate.' },
      },
      required: ['command'],
    },
  },
  {
    name: TOOLS.PING,
    description: 'Verify that the Copilot MCP server is running and responsive.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
