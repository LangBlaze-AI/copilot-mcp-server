import { spawn } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

const JSONRPC_VERSION = '2.0';
const TEST_TIMEOUT_MS = 15000;

async function ensureBuild(distPath: string): Promise<void> {
  if (existsSync(distPath)) return;
  await execAsync('npm run build');
}

function createCopilotStub(captureArgs = false): { stubDir: string; argsFile?: string } {
  const stubDir = mkdtempSync(path.join(tmpdir(), 'copilot-mcp-test-'));
  const stubPath = path.join(stubDir, 'copilot');
  const argsFile = captureArgs ? path.join(stubDir, 'captured-args.json') : undefined;

  const stubScript = captureArgs
    ? `#!/bin/sh\nprintf '%s\\n' "$@" > ${argsFile}\nprintf "stub response from Copilot\\n"\nexit 0\n`
    : `#!/bin/sh\nprintf "stub response from Copilot\\n"\nexit 0\n`;

  writeFileSync(stubPath, stubScript);
  chmodSync(stubPath, 0o755);
  return { stubDir, argsFile };
}

function spawnServer(distPath: string, stubDir: string): ReturnType<typeof spawn> {
  return spawn(process.execPath, [distPath], {
    env: {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function makeRequestSender(server: ReturnType<typeof spawn>) {
  let buffer = '';
  const pending = new Map<number, (payload: unknown) => void>();

  server.stdout?.setEncoding('utf8');
  server.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const payload = JSON.parse(line) as { id?: number; result?: unknown };
          if (typeof payload.id === 'number') {
            const resolver = pending.get(payload.id);
            if (resolver) {
              resolver(payload.result ?? payload);
              pending.delete(payload.id);
            }
          }
        } catch {
          // Ignore non-JSON output
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });

  return (request: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      if (!server?.stdin) {
        reject(new Error('Server stdin not available'));
        return;
      }
      const id = request.id as number;
      const timer = globalThis.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response ${id}`));
      }, TEST_TIMEOUT_MS);
      pending.set(id, (payload) => {
        globalThis.clearTimeout(timer);
        resolve(payload);
      });
      server.stdin.write(`${JSON.stringify(request)}\n`);
    });
}

describe('MCP stdio integration', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);

  let distPath: string;

  beforeAll(async () => {
    distPath = path.join(process.cwd(), 'dist', 'index.js');
    await ensureBuild(distPath);
  });

  describe('Tool list and basic responses', () => {
    let server: ReturnType<typeof spawn> | null = null;
    let stubDir: string | null = null;
    let sendRequest: (request: Record<string, unknown>) => Promise<unknown>;

    beforeAll(async () => {
      const stub = createCopilotStub();
      stubDir = stub.stubDir;
      server = spawnServer(distPath, stubDir);
      sendRequest = makeRequestSender(server);
      // Give server time to start
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    });

    afterAll(async () => {
      if (server) {
        server.kill();
        await new Promise((resolve) => server?.once('exit', resolve));
      }
      if (stubDir) {
        rmSync(stubDir, { recursive: true, force: true });
      }
    });

    test('tool list contains exactly 4 tools: ask, suggest, explain, ping', async () => {
      const listResponse = (await sendRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'tools/list',
        params: {},
      })) as { tools: Array<{ name: string }> };

      const listParse = ListToolsResultSchema.safeParse(listResponse);
      expect(listParse.success).toBe(true);

      const toolNames = listResponse.tools.map((t) => t.name);
      expect(toolNames).toHaveLength(4);
      expect(toolNames).toContain('ask');
      expect(toolNames).toContain('suggest');
      expect(toolNames).toContain('explain');
      expect(toolNames).toContain('ping');
    });

    test('stdout response test: ask tool returns stub stdout content (CLI-04)', async () => {
      const callResponse = (await sendRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        method: 'tools/call',
        params: { name: 'ask', arguments: { prompt: 'Test prompt' } },
      })) as { content: Array<{ type: string; text: string }> };

      const callParse = CallToolResultSchema.safeParse(callResponse);
      expect(callParse.success).toBe(true);
      expect(callResponse.content[0].text).toBe('stub response from Copilot');
    });

    test('ping tool returns running confirmation without invoking copilot (TOOL-05)', async () => {
      const callResponse = (await sendRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 3,
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
      })) as { content: Array<{ type: string; text: string }> };

      const callParse = CallToolResultSchema.safeParse(callResponse);
      expect(callParse.success).toBe(true);
      expect(callResponse.content[0].text).toBe('Copilot MCP Server is running.');
    });
  });

  describe('CLI flag verification via arg-capturing stub (CLI-02, CLI-03)', () => {
    let server: ReturnType<typeof spawn> | null = null;
    let stubDir: string | null = null;
    let argsFile: string | undefined;
    let sendRequest: (request: Record<string, unknown>) => Promise<unknown>;

    beforeAll(async () => {
      const stub = createCopilotStub(true);
      stubDir = stub.stubDir;
      argsFile = stub.argsFile;
      server = spawnServer(distPath, stubDir);
      sendRequest = makeRequestSender(server);
      // Give server time to start
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    });

    afterAll(async () => {
      if (server) {
        server.kill();
        await new Promise((resolve) => server?.once('exit', resolve));
      }
      if (stubDir) {
        rmSync(stubDir, { recursive: true, force: true });
      }
    });

    async function callAskAndGetArgs(): Promise<string[]> {
      await sendRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 10,
        method: 'tools/call',
        params: { name: 'ask', arguments: { prompt: 'Test prompt for flag check' } },
      });
      // Give stub time to write the file
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
      if (!argsFile) throw new Error('argsFile not set');
      const content = readFileSync(argsFile, 'utf8');
      return content.trim().split('\n').filter(Boolean);
    }

    test('flag verification: all 5 base flags are in copilot args (CLI-03)', async () => {
      const args = await callAskAndGetArgs();
      expect(args).toContain('--allow-all-tools');
      expect(args).toContain('--no-ask-user');
      expect(args).toContain('--silent');
      expect(args).toContain('--no-color');
      expect(args).toContain('--no-auto-update');
    });

    test('-p flag is present; -i and --interactive are NOT present (CLI-02)', async () => {
      const args = await callAskAndGetArgs();
      expect(args).toContain('-p');
      expect(args).not.toContain('-i');
      expect(args).not.toContain('--interactive');
    });

    test('copilot binary name test: stub named copilot is found and called (CLI-01)', async () => {
      // The stub dir contains a binary named 'copilot' (not 'gh' or 'gh copilot')
      // The test passes if the ask tool invocation succeeds, proving 'copilot' was found
      const callResponse = (await sendRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 11,
        method: 'tools/call',
        params: { name: 'ask', arguments: { prompt: 'Binary name test' } },
      })) as { content: Array<{ type: string; text: string }> };

      expect(callResponse.content[0].text).toBe('stub response from Copilot');
    });
  });
});
