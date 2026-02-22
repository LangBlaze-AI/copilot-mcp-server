import { z } from 'zod';
import { UnifiedTool, ToolArguments } from './registry.js';
import { TOOLS, PingToolSchema, DEFAULT_COPILOT_MODEL, COPILOT_DEFAULT_MODEL_ENV_VAR, AVAILABLE_COPILOT_MODELS } from '../types.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load package version using process.cwd() — compatible with both ESM runtime and ts-jest
function loadPackageVersion(): string {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const data = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return data.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function detectInstallMethod(): string {
  const argv1 = process.argv[1] ?? '';
  if (argv1.includes('node_modules')) return 'npm';
  if (argv1.includes('homebrew') || argv1.includes('/opt/homebrew')) return 'brew';
  if (process.env['npm_config_prefix']) return 'npm';
  return 'unknown';
}

const pkgVersion = loadPackageVersion();

export const pingTool: UnifiedTool = {
  name: TOOLS.PING,
  description: 'Verify that the Copilot MCP server is running and responsive.',
  zodSchema: PingToolSchema,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  category: 'simple',
  execute: async (_args: ToolArguments): Promise<string> => {
    return 'Copilot MCP Server is running.';
  },
};

const identityArgsSchema = z.object({});

export const identityTool: UnifiedTool = {
  name: TOOLS.IDENTITY,
  description: 'Get server identity: name, version, active LLM model, and MCP server name. Used by QGSD to fingerprint the active quorum team.',
  zodSchema: identityArgsSchema,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  annotations: {
    title: 'Server Identity',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  category: 'simple',
  execute: async (_args: ToolArguments): Promise<string> => {
    return JSON.stringify({
      name: 'copilot-mcp-server',
      version: loadPackageVersion(),
      model: process.env[COPILOT_DEFAULT_MODEL_ENV_VAR] ?? DEFAULT_COPILOT_MODEL,
      available_models: AVAILABLE_COPILOT_MODELS,
      install_method: detectInstallMethod(),
    }, null, 2);
  },
};
