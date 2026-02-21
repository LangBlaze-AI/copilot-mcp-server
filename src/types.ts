import { z } from 'zod';

// Tool constants
export const TOOLS = {
  ASK: 'ask',
  SUGGEST: 'suggest',
  EXPLAIN: 'explain',
  PING: 'ping',
} as const;

export type ToolName = (typeof TOOLS)[keyof typeof TOOLS];

// Copilot model constants
export const DEFAULT_COPILOT_MODEL = 'gpt-4.1' as const;
export const COPILOT_DEFAULT_MODEL_ENV_VAR = 'COPILOT_DEFAULT_MODEL' as const;

// Tool annotations for MCP 2025-11-25 spec
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// Tool definition interface
export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
}

// Tool result interface matching MCP SDK expectations
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
    _meta?: Record<string, unknown>;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

// Server configuration
export interface ServerConfig {
  name: string;
  version: string;
}

// Zod schemas for tool arguments
export const AskToolSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
  addDir: z.string().optional(),
  softTimeoutMs: z.number().int().positive().optional(),
});
export type AskToolArgs = z.infer<typeof AskToolSchema>;

export const SuggestToolSchema = z.object({
  prompt: z.string(),
  target: z.enum(['shell', 'git', 'gh']).optional(),
  model: z.string().optional(),
  addDir: z.string().optional(),
  softTimeoutMs: z.number().int().positive().optional(),
});
export type SuggestToolArgs = z.infer<typeof SuggestToolSchema>;

export const ExplainToolSchema = z.object({
  command: z.string(),
  model: z.string().optional(),
  addDir: z.string().optional(),
  softTimeoutMs: z.number().int().positive().optional(),
});
export type ExplainToolArgs = z.infer<typeof ExplainToolSchema>;

export const PingToolSchema = z.object({});
export type PingToolArgs = z.infer<typeof PingToolSchema>;

// Command execution result
export interface CommandResult {
  stdout: string;
  stderr: string;
}

// Progress token from MCP request metadata
export type ProgressToken = string | number;

// Context passed to tool handlers for sending progress notifications
export interface ToolHandlerContext {
  progressToken?: ProgressToken;
  sendProgress: (message: string, progress?: number, total?: number) => Promise<void>;
  done?: () => void;
}
