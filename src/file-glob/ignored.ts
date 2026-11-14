import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function normalize(entry: string): string {
  return entry.endsWith('/') ? entry.slice(0, -1) : entry;
}

function wasKilled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;
}

export async function loadIgnoredPaths(root: string, deadline: number, signal?: AbortSignal): Promise<ReadonlySet<string> | undefined> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return undefined;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      { cwd: root, maxBuffer: 1024 * 1024 * 64, timeout: remaining, killSignal: 'SIGKILL', signal },
    );
    const entries = stdout.split('\0').filter(Boolean).map((entry) => normalize(entry));
    return new Set(entries.filter((entry) => entry !== '.'));
  } catch (error) {
    if (wasKilled(error) || signal?.aborted === true || Date.now() >= deadline) return undefined;
    return new Set();
  }
}
