type ProcessEnv = Record<string, string | undefined>;
import { spawn } from 'child_process';
import { Buffer } from 'node:buffer';
import chalk from 'chalk';
import { CommandExecutionError, scrubTokens } from '../errors.js';
import { type CommandResult } from '../types.js';

/**
 * Escape argument for Windows shell (cmd.exe)
 */
function escapeArgForWindows(arg: string): string {
  // Escape percent signs to prevent environment variable expansion
  let escaped = arg.replace(/%/g, '%%');
  // If arg contains spaces or special chars, wrap in double quotes
  if (/[\s"&|<>^%]/.test(arg)) {
    // Escape internal double quotes using CMD-style doubling
    escaped = `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

const isWindows = process.platform === 'win32';

// Maximum buffer size (10MB) to prevent memory exhaustion from noisy processes
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

const EXECUTE_TIMEOUT_MS = 60_000; // 60 seconds (ERR-04)

export type ProgressCallback = (message: string) => void;

export interface StreamingCommandOptions {
  onProgress?: ProgressCallback;
  envOverride?: ProcessEnv;
}

export interface ExecuteCommandOptions {
  /**
   * When true, only exit code 0 resolves the promise. Non-zero exit codes
   * will reject with a CommandExecutionError regardless of stdout/stderr output.
   * When false (default), the existing lenient behavior applies: resolves if
   * exit code is 0 OR if any stdout/stderr output was produced.
   */
  strictExitCode?: boolean;
  /**
   * Soft timeout in milliseconds. When set (and less than the hard timeout),
   * fires SIGTERM → 5s → SIGKILL and resolves early with whatever stdout was
   * accumulated, prefixed with '[Soft timeout - partial output]\n', instead of
   * blocking until the hard timeout and rejecting. The LLM is also informed of
   * the time budget via a prompt prefix so it can self-regulate.
   */
  softTimeoutMs?: number;
}

/**
 * Execute a command and return its output.
 *
 * @param file - The executable to run
 * @param args - Arguments to pass to the executable
 * @param envOverride - Optional environment variable overrides
 * @param options - Optional execution options (e.g. strictExitCode)
 */
export async function executeCommand(
  file: string,
  args: string[] = [],
  envOverride?: ProcessEnv,
  options: ExecuteCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Escape args for Windows shell
    const escapedArgs = isWindows ? args.map(escapeArgForWindows) : args;

    console.error(chalk.blue('Executing:'), file, escapedArgs.join(' '));

    const child = spawn(file, escapedArgs, {
      shell: isWindows,
      env: envOverride ? { ...process.env, ...envOverride } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let isResolved = false;

    // Kill with SIGTERM first, then escalate to SIGKILL after 5s if still running
    function killProcess(): void {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }

    // Soft timeout: resolves early with whatever output was accumulated
    let softTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let hardTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (options.softTimeoutMs !== undefined && options.softTimeoutMs < EXECUTE_TIMEOUT_MS) {
      softTimeoutHandle = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(hardTimeoutHandle);
          killProcess();
          resolve({ stdout: '[Soft timeout - partial output]\n' + stdout, stderr });
        }
      }, options.softTimeoutMs);
    }

    // Hard timeout: rejects (manual, replacing native spawn timeout option)
    hardTimeoutHandle = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(softTimeoutHandle);
        killProcess();
        reject(
          new CommandExecutionError(
            [file, ...args].join(' '),
            `Command timed out after ${EXECUTE_TIMEOUT_MS}ms`,
            new Error('Timeout')
          )
        );
      }
    }, EXECUTE_TIMEOUT_MS);

    child.stdout.on('data', (data: Buffer) => {
      if (!stdoutTruncated) {
        const chunk = data.toString();
        if (stdout.length + chunk.length > MAX_BUFFER_SIZE) {
          stdout += chunk.slice(0, MAX_BUFFER_SIZE - stdout.length);
          stdoutTruncated = true;
          console.error(chalk.yellow('Warning: stdout truncated at 10MB'));
        } else {
          stdout += chunk;
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      if (!stderrTruncated) {
        const chunk = data.toString();
        if (stderr.length + chunk.length > MAX_BUFFER_SIZE) {
          stderr += chunk.slice(0, MAX_BUFFER_SIZE - stderr.length);
          stderrTruncated = true;
          console.error(chalk.yellow('Warning: stderr truncated at 10MB'));
        } else {
          stderr += chunk;
        }
      }
    });

    child.on('close', (code, signal) => {
      if (isResolved) return; // already handled by soft or hard timeout
      isResolved = true;
      clearTimeout(hardTimeoutHandle);
      clearTimeout(softTimeoutHandle);

      if (stderr) {
        console.error(chalk.yellow('Command stderr:'), scrubTokens(stderr));
      }

      // Detect unexpected external SIGTERM (not from our own killProcess)
      if (code === null && signal === 'SIGTERM') {
        reject(
          new CommandExecutionError(
            [file, ...args].join(' '),
            `Command timed out after ${EXECUTE_TIMEOUT_MS}ms`,
            new Error('Timeout')
          )
        );
        return;
      }

      if (options.strictExitCode) {
        // Strict mode: only exit code 0 resolves
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new CommandExecutionError(
              [file, ...args].join(' '),
              `Command failed with exit code ${code}: ${stderr || 'no error message'}`,
              new Error(stderr || 'Unknown error')
            )
          );
        }
      } else {
        // Lenient mode (default): accept exit code 0 or if we got stdout/stderr output
        if (code === 0 || stdout || stderr) {
          if (code !== 0 && (stdout || stderr)) {
            console.error(
              chalk.yellow('Command failed but produced output, using output')
            );
          }
          resolve({ stdout, stderr });
        } else {
          reject(
            new CommandExecutionError(
              [file, ...args].join(' '),
              `Command failed with exit code ${code}`,
              new Error(stderr || 'Unknown error')
            )
          );
        }
      }
    });

    child.on('error', (error) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(hardTimeoutHandle);
      clearTimeout(softTimeoutHandle);
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        reject(
          new CommandExecutionError(
            file,
            `Binary not found: "${file}". ` +
              `If using the default copilot binary, install it from: https://github.com/github/gh-copilot. ` +
              `If using COPILOT_BINARY_PATH, verify the path is correct.`,
            error
          )
        );
      } else {
        reject(
          new CommandExecutionError(
            [file, ...args].join(' '),
            'Command execution failed',
            error
          )
        );
      }
    });
  });
}

/**
 * Execute a command with streaming output support.
 * Calls onProgress callback with each chunk of output for real-time feedback.
 *
 * Note: Unlike executeCommand, this function treats stderr output as success
 * because tools like codex write their primary output to stderr. This is
 * intentional for streaming use cases where we want to capture all output.
 */
export async function executeCommandStreaming(
  file: string,
  args: string[] = [],
  options: StreamingCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Escape args for Windows shell
    const escapedArgs = isWindows ? args.map(escapeArgForWindows) : args;

    console.error(
      chalk.blue('Executing (streaming):'),
      file,
      escapedArgs.join(' ')
    );

    const child = spawn(file, escapedArgs, {
      shell: isWindows, // Use shell on Windows to inherit PATH correctly
      env: options.envOverride
        ? { ...process.env, ...options.envOverride }
        : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let lastProgressTime = 0;
    const PROGRESS_DEBOUNCE_MS = 100; // Debounce progress updates

    const sendProgress = (message: string) => {
      if (!options.onProgress) return;

      const now = Date.now();
      // Debounce to avoid flooding with progress updates
      if (now - lastProgressTime >= PROGRESS_DEBOUNCE_MS) {
        options.onProgress(message);
        lastProgressTime = now;
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (!stdoutTruncated) {
        if (stdout.length + chunk.length > MAX_BUFFER_SIZE) {
          stdout += chunk.slice(0, MAX_BUFFER_SIZE - stdout.length);
          stdoutTruncated = true;
          console.error(chalk.yellow('Warning: stdout truncated at 10MB'));
        } else {
          stdout += chunk;
        }
      }
      sendProgress(chunk.trim());
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (!stderrTruncated) {
        if (stderr.length + chunk.length > MAX_BUFFER_SIZE) {
          stderr += chunk.slice(0, MAX_BUFFER_SIZE - stderr.length);
          stderrTruncated = true;
          console.error(chalk.yellow('Warning: stderr truncated at 10MB'));
        } else {
          stderr += chunk;
        }
      }
      // Also send stderr as progress - codex outputs to stderr
      sendProgress(chunk.trim());
    });

    child.on('close', (code) => {
      // Send final progress if there's any remaining output
      if (options.onProgress && (stdout || stderr)) {
        const finalOutput = stdout || stderr;
        const lastChunk = finalOutput.slice(-500); // Last 500 chars
        if (lastChunk.trim()) {
          options.onProgress(
            `[Completed] ${lastChunk.trim().slice(0, 200)}...`
          );
        }
      }

      if (code === 0 || stdout || stderr) {
        // Success or we have output (treat as success like the original)
        if (code !== 0 && (stdout || stderr)) {
          console.error(
            chalk.yellow('Command failed but produced output, using output')
          );
        }
        resolve({ stdout, stderr });
      } else {
        reject(
          new CommandExecutionError(
            [file, ...args].join(' '),
            `Command exited with code ${code}`,
            new Error(`Exit code: ${code}`)
          )
        );
      }
    });

    child.on('error', (error) => {
      reject(
        new CommandExecutionError(
          [file, ...args].join(' '),
          'Command execution failed',
          error
        )
      );
    });
  });
}
