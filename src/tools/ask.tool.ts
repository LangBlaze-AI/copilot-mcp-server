import { UnifiedTool, ToolArguments } from './registry.js';
import { TOOLS, AskToolSchema } from '../types.js';
import { ToolExecutionError, ValidationError } from '../errors.js';
import { executeCommand } from '../utils/command.js';
import {
  buildCopilotArgs,
  buildTimeBudgetPrefix,
  classifyCommandError,
  extractResponse,
  getCopilotBinary,
} from '../utils/copilotExecutor.js';

export const askTool: UnifiedTool = {
  name: TOOLS.ASK,
  description:
    'Ask GitHub Copilot a question or give it a task using natural language. ' +
    'Copilot runs in agent mode with --allow-all-tools enabled, meaning it can execute ' +
    'shell commands and read files on your behalf. Use this for open-ended coding questions, ' +
    'code generation, refactoring guidance, or any task requiring Copilot\'s full capabilities.',
  zodSchema: AskToolSchema,
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
  category: 'copilot',
  execute: async (args: ToolArguments): Promise<string> => {
    const { prompt, model, addDir, softTimeoutMs } = AskToolSchema.parse(args);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + prompt : prompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return extractResponse(result.stdout, result.stderr, TOOLS.ASK);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.ASK, classifyCommandError(error), error);
    }
  },
};
