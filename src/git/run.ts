import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LONG_REQUEST_DEADLINE_MS } from '../file-navigator/remote/port-requests.js';

const execFileAsync = promisify(execFile);

export type RunGitOptions = { signal?: AbortSignal; timeout?: number };

export const GIT_COMMAND_TIMEOUT_MS = LONG_REQUEST_DEADLINE_MS;

export function runGit(
  args: string[], cwd: string, options: RunGitOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    signal: options.signal,
    timeout: options.timeout ?? GIT_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });
}
