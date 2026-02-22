import { UnifiedTool, ToolArguments } from './registry.js';
import { TOOLS, ExplainToolSchema } from '../types.js';
import { ToolExecutionError, ValidationError } from '../errors.js';
import { executeCommand } from '../utils/command.js';
import {
  buildCopilotArgs,
  buildExplainPrompt,
  buildTimeBudgetPrefix,
  classifyCommandError,
  extractResponse,
  getCopilotBinary,
} from '../utils/copilotExecutor.js';

export const explainTool: UnifiedTool = {
  name: TOOLS.EXPLAIN,
  description: 'Ask GitHub Copilot to explain what a shell command does in plain language.',
  zodSchema: ExplainToolSchema,
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
  category: 'copilot',
  execute: async (args: ToolArguments): Promise<string> => {
    const { command, model, addDir, softTimeoutMs } = ExplainToolSchema.parse(args);
    const basePrompt = buildExplainPrompt(command);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + basePrompt : basePrompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return extractResponse(result.stdout, result.stderr, TOOLS.EXPLAIN);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.EXPLAIN, classifyCommandError(error), error);
    }
  },
};
