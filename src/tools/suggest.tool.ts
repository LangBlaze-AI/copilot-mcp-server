import { UnifiedTool, ToolArguments } from './registry.js';
import { TOOLS, SuggestToolSchema } from '../types.js';
import { ToolExecutionError, ValidationError } from '../errors.js';
import { executeCommand } from '../utils/command.js';
import {
  buildCopilotArgs,
  buildSuggestPrompt,
  buildTimeBudgetPrefix,
  classifyCommandError,
  extractResponse,
  getCopilotBinary,
} from '../utils/copilotExecutor.js';

export const suggestTool: UnifiedTool = {
  name: TOOLS.SUGGEST,
  description:
    'Ask GitHub Copilot to suggest a shell, git, or gh CLI command for a given task. ' +
    'Use the optional target parameter to scope the suggestion type.',
  zodSchema: SuggestToolSchema,
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
  category: 'copilot',
  execute: async (args: ToolArguments): Promise<string> => {
    const { prompt, target, model, addDir, softTimeoutMs } = SuggestToolSchema.parse(args);
    const basePrompt = buildSuggestPrompt(prompt, target);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + basePrompt : basePrompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return extractResponse(result.stdout, result.stderr, TOOLS.SUGGEST);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.SUGGEST, classifyCommandError(error), error);
    }
  },
};
