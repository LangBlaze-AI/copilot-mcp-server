#!/usr/bin/env node

import chalk from 'chalk';
import { CopilotMcpServer } from './server.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const SERVER_CONFIG = {
  name: 'Copilot MCP Server',
  version: pkg.version,
} as const;

async function main(): Promise<void> {
  try {
    const server = new CopilotMcpServer(SERVER_CONFIG);
    await server.start();
  } catch (error) {
    console.error(chalk.red('Failed to start server:'), error);
    process.exit(1);
  }
}

main();
