import path from 'path';
import { stripVTControlCharacters } from 'node:util';
import {
  TOOLS,
  DEFAULT_COPILOT_MODEL,
  COPILOT_DEFAULT_MODEL_ENV_VAR,
  AskToolSchema,
  SuggestToolSchema,
  ExplainToolSchema,
  PingToolSchema,
  type ToolResult,
  type ToolHandlerContext,
} from '../types.js';
import { executeCommand } from '../utils/command.js';
import { ToolExecutionError, ValidationError, scrubTokens } from '../errors.js';

// Default no-op context for handlers that don't need progress
const defaultContext: ToolHandlerContext = {
  sendProgress: async () => {},
};

// Hardcoded safety flags for all copilot invocations (CLI-03)
const COPILOT_BASE_ARGS = [
  '--allow-all-tools',
  '--no-ask-user',
  '--silent',
  '--no-color',
  '--no-auto-update',
] as const;

// Resolve binary path per call to support test env overrides (SEC-03)
function getCopilotBinary(): string {
  return process.env['COPILOT_BINARY_PATH'] ?? 'copilot';
}

// Validate addDir parameter (SEC-02)
function validateAddDir(addDir: string): void {
  if (addDir.includes('\0')) {
    throw new ValidationError('addDir', 'addDir contains null bytes');
  }
  if (addDir.split('/').includes('..')) {
    throw new ValidationError('addDir', 'addDir must not contain path traversal segments');
  }
  if (!path.isAbsolute(addDir)) {
    throw new ValidationError('addDir', 'addDir must be an absolute path');
  }
}

// Build copilot CLI args (CLI-01, CLI-02, CLI-03, TOOL-06, TOOL-07)
function buildCopilotArgs(prompt: string, model?: string, addDir?: string): string[] {
  const resolvedModel =
    model ?? process.env[COPILOT_DEFAULT_MODEL_ENV_VAR] ?? DEFAULT_COPILOT_MODEL;
  const args: string[] = ['-p', prompt, ...COPILOT_BASE_ARGS, '--model', resolvedModel];
  if (addDir) {
    validateAddDir(addDir);
    args.push('--add-dir', addDir);
  }
  return args;
}

// Prompt builders for suggest and explain tools (TOOL-02, TOOL-03, TOOL-04)
function buildSuggestPrompt(prompt: string, target?: 'shell' | 'git' | 'gh'): string {
  if (!target) return `Suggest a command to accomplish: ${prompt}`;
  const labels: Record<string, string> = {
    shell: 'shell',
    git: 'git',
    gh: 'GitHub CLI (gh)',
  };
  return `Suggest a ${labels[target]} command to accomplish: ${prompt}`;
}

function buildExplainPrompt(command: string): string {
  return `Explain what this command does: ${command}`;
}

// Classify non-zero exit errors into actionable messages (ERR-02, ERR-03, CLI-05)
function classifyCommandError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error executing copilot';
  const msg = error.message.toLowerCase();
  if (msg.includes('quota') || msg.includes('402') || msg.includes('rate limit')) {
    return 'Copilot quota exceeded. Your GitHub Copilot quota has been exhausted. Please wait before retrying.';
  }
  if (
    msg.includes('auth') || msg.includes('401') || msg.includes('unauthorized') ||
    msg.includes('unauthenticated') || msg.includes('token')
  ) {
    return 'Copilot authentication failed. Ensure COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN is set with a valid GitHub token.';
  }
  if (msg.includes('enoent') || msg.includes('not found') || msg.includes('not installed')) {
    return error.message; // Already user-friendly from command.ts ENOENT detection
  }
  if (msg.includes('timed out')) {
    return error.message; // Already user-friendly from command.ts timeout detection
  }
  return scrubTokens(error.message); // Generic: scrub tokens, pass through
}

// Extract response from copilot output — stdout is primary (CLI-04)
function extractResponse(stdout: string, stderr: string, toolName: string): string {
  const cleanStdout = stripVTControlCharacters(stdout).trim();
  if (!cleanStdout && stderr) {
    throw new ToolExecutionError(toolName, `Copilot error: ${scrubTokens(stderr)}`);
  }
  return cleanStdout || 'No response from Copilot';
}

// Build time budget prefix for soft timeout prompt injection
function buildTimeBudgetPrefix(softTimeoutMs: number): string {
  const minutes = Math.round(softTimeoutMs / 60000);
  return `[Time budget: ${minutes}m. Summarize what you have if running long — complete answer over exhaustive research.]\n\n`;
}

// Ask tool handler (TOOL-01, CLI-01, CLI-02, CLI-03, CLI-04)
export class AskToolHandler {
  async execute(args: unknown, context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    const { prompt, model, addDir, softTimeoutMs } = AskToolSchema.parse(args);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + prompt : prompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return {
        content: [{ type: 'text', text: extractResponse(result.stdout, result.stderr, TOOLS.ASK) }],
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.ASK, classifyCommandError(error), error);
    }
  }
}

// Suggest tool handler (TOOL-02, TOOL-03)
export class SuggestToolHandler {
  async execute(args: unknown, context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    const { prompt, target, model, addDir, softTimeoutMs } = SuggestToolSchema.parse(args);
    const basePrompt = buildSuggestPrompt(prompt, target);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + basePrompt : basePrompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return {
        content: [{ type: 'text', text: extractResponse(result.stdout, result.stderr, TOOLS.SUGGEST) }],
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.SUGGEST, classifyCommandError(error), error);
    }
  }
}

// Explain tool handler (TOOL-04)
export class ExplainToolHandler {
  async execute(args: unknown, context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    const { command, model, addDir, softTimeoutMs } = ExplainToolSchema.parse(args);
    const basePrompt = buildExplainPrompt(command);
    const finalPrompt = softTimeoutMs ? buildTimeBudgetPrefix(softTimeoutMs) + basePrompt : basePrompt;
    const cmdArgs = buildCopilotArgs(finalPrompt, model, addDir);
    try {
      const result = await executeCommand(getCopilotBinary(), cmdArgs, undefined, { strictExitCode: true, softTimeoutMs });
      return {
        content: [{ type: 'text', text: extractResponse(result.stdout, result.stderr, TOOLS.EXPLAIN) }],
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ToolExecutionError(TOOLS.EXPLAIN, classifyCommandError(error), error);
    }
  }
}

// Ping tool handler — no copilot binary invocation (TOOL-05)
export class PingToolHandler {
  async execute(_args: unknown, _context: ToolHandlerContext = defaultContext): Promise<ToolResult> {
    return {
      content: [{ type: 'text', text: 'Copilot MCP Server is running.' }],
    };
  }
}

// Handler registry
export const toolHandlers = {
  [TOOLS.ASK]: new AskToolHandler(),
  [TOOLS.SUGGEST]: new SuggestToolHandler(),
  [TOOLS.EXPLAIN]: new ExplainToolHandler(),
  [TOOLS.PING]: new PingToolHandler(),
} as const;
