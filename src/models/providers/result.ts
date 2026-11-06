import { execFile } from 'node:child_process';

export const PROVIDER_TIMEOUT_MS = 30_000;

export type ProviderRecord = { id: string; name?: string };
export type ProviderOutcome =
  | { status: 'ok'; records: ProviderRecord[] }
  | { status: 'skipped' | 'failed'; reason: string };

export type ProviderCommandOptions = { signal: AbortSignal; timeout: number };
export type ProviderCommand = (
  command: string,
  args: readonly string[],
  options: ProviderCommandOptions,
) => Promise<string>;

export function runProviderCommand(
  command: string,
  args: readonly string[],
  options: ProviderCommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], {
      signal: options.signal,
      timeout: options.timeout,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export function commandFailure(error: unknown, binary: string): ProviderOutcome {
  if (hasErrorCode(error, 'ENOENT')) return { status: 'skipped', reason: `${binary} is not installed` };
  if (isTimeout(error)) return { status: 'failed', reason: 'timed out after 30 s' };
  return { status: 'failed', reason: firstLine(error) };
}

export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const first = message.split(/\r?\n/u, 1)[0]?.trim().replace(/[.!?]+$/u, '');
  return first || 'provider request failed';
}

export function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error) || isAbortError(error)) return false;
  return error.name === 'TimeoutError'
    || hasErrorCode(error, 'ETIMEDOUT')
    || isKilledChildProcess(error);
}

function isAbortError(error: Error): boolean {
  return error.name === 'AbortError' || hasErrorCode(error, 'ABORT_ERR');
}

function isKilledChildProcess(error: Error): boolean {
  return 'killed' in error && error.killed === true;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
