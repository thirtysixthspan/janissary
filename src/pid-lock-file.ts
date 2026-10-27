import { readFileSync, rmSync, writeFileSync } from 'node:fs';

// `process.kill` gives 0 and negative numbers a process-group meaning, and an empty or truncated
// file parses to 0, so probing anything but a positive integer would reach the caller's process group.
export function parseLockPid(content: string): number | undefined {
  const pid = Number(content.trim());
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

export function createPidFile(file: string, mode?: number): boolean {
  try {
    if (mode === undefined) writeFileSync(file, String(process.pid), { flag: 'wx' });
    else writeFileSync(file, String(process.pid), { flag: 'wx', mode });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

export function readPidFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function clearIfStale(file: string, content: string): void {
  if (readPidFile(file) === content) rmSync(file, { force: true });
}
