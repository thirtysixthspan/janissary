import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockPath(projectDir: string): string {
  return path.join(projectDir, '.janissary', 'lock');
}

// The PID recorded in a directory's lock file, or undefined when no lock file exists (or its
// contents don't parse as a number). Used by `janus stop` to find the instance to signal.
export function readLockPid(projectDir: string): number | undefined {
  const file = lockPath(projectDir);
  if (!existsSync(file)) return undefined;
  const pid = Number(readFileSync(file, 'utf8').trim());
  return Number.isNaN(pid) ? undefined : pid;
}

export function acquireLock(projectDir: string): void {
  const file = lockPath(projectDir);
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim());
    if (isPidAlive(pid)) {
      throw new Error(
        `another janus instance is already running in this directory (pid ${pid}). Run janus <other-directory> to start a second instance elsewhere. If you're sure no other instance is running, delete ${file} to clear the lock.`,
      );
    }
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, String(process.pid));
}

export function releaseLock(projectDir: string): void {
  const file = lockPath(projectDir);
  if (!existsSync(file)) return;
  const pid = Number(readFileSync(file, 'utf8').trim());
  if (pid === process.pid) {
    rmSync(file, { force: true });
  }
}
