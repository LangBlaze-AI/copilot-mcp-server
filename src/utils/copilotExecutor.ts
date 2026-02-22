import path from 'path';
import { stripVTControlCharacters } from 'node:util';
import { DEFAULT_COPILOT_MODEL, COPILOT_DEFAULT_MODEL_ENV_VAR } from '../types.js';
import { ToolExecutionError, ValidationError, scrubTokens } from '../errors.js';

// Hardcoded safety flags for all copilot invocations (CLI-03)
export const COPILOT_BASE_ARGS = [
  '--allow-all-tools',
  '--no-ask-user',
  '--silent',
  '--no-color',
  '--no-auto-update',
] as const;

// Resolve binary path per call to support test env overrides (SEC-03)
export function getCopilotBinary(): string {
  return process.env['COPILOT_BINARY_PATH'] ?? 'copilot';
}

// Validate addDir parameter (SEC-02)
export function validateAddDir(addDir: string): void {
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
export function buildCopilotArgs(prompt: string, model?: string, addDir?: string): string[] {
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
export function buildSuggestPrompt(prompt: string, target?: 'shell' | 'git' | 'gh'): string {
  if (!target) return `Suggest a command to accomplish: ${prompt}`;
  const labels: Record<string, string> = {
    shell: 'shell',
    git: 'git',
    gh: 'GitHub CLI (gh)',
  };
  return `Suggest a ${labels[target]} command to accomplish: ${prompt}`;
}

export function buildExplainPrompt(command: string): string {
  return `Explain what this command does: ${command}`;
}

// Classify non-zero exit errors into actionable messages (ERR-02, ERR-03, CLI-05)
export function classifyCommandError(error: unknown): string {
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
    return error.message;
  }
  if (msg.includes('timed out')) {
    return error.message;
  }
  return scrubTokens(error.message);
}

// Extract response from copilot output — stdout is primary (CLI-04)
export function extractResponse(stdout: string, stderr: string, toolName: string): string {
  const cleanStdout = stripVTControlCharacters(stdout).trim();
  if (!cleanStdout && stderr) {
    throw new ToolExecutionError(toolName, `Copilot error: ${scrubTokens(stderr)}`);
  }
  return cleanStdout || 'No response from Copilot';
}

// Build time budget prefix for soft timeout prompt injection
export function buildTimeBudgetPrefix(softTimeoutMs: number): string {
  const minutes = Math.round(softTimeoutMs / 60000);
  return `[Time budget: ${minutes}m. Summarize what you have if running long — complete answer over exhaustive research.]\n\n`;
}
