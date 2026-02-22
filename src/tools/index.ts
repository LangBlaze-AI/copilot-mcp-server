import { toolRegistry } from './registry.js';
import { askTool } from './ask.tool.js';
import { suggestTool } from './suggest.tool.js';
import { explainTool } from './explain.tool.js';
import { pingTool, identityTool } from './simple-tools.js';

toolRegistry.push(askTool, suggestTool, explainTool, pingTool, identityTool);

export * from './registry.js';
