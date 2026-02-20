const TOKEN_ENV_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

export function scrubTokens(message: string): string {
  let scrubbed = message;
  for (const varName of TOKEN_ENV_VARS) {
    const value = process.env[varName];
    if (value && value.length > 4) {
      scrubbed = scrubbed.replaceAll(value, '[REDACTED]');
    }
  }
  return scrubbed;
}

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`Failed to execute tool "${toolName}": ${message}`);
    this.name = 'ToolExecutionError';
  }
}

export class CommandExecutionError extends Error {
  constructor(
    public readonly command: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`Command execution failed for "${command}": ${message}`);
    this.name = 'CommandExecutionError';
  }
}

export class ValidationError extends Error {
  constructor(
    public readonly toolName: string,
    message: string
  ) {
    super(`Validation failed for tool "${toolName}": ${message}`);
    this.name = 'ValidationError';
  }
}

export function handleError(error: unknown, context: string): string {
  if (error instanceof Error) {
    return scrubTokens(`Error in ${context}: ${error.message}`);
  }
  return scrubTokens(`Error in ${context}: ${String(error)}`);
}
