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
  return error instanceof Error && (
    error.name === 'TimeoutError'
    || hasErrorCode(error, 'ETIMEDOUT')
  );
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
