import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

function isPidAlive(pid: number): boolean {
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

export function acquireLock(projectDir: string): void {
  const file = lockPath(projectDir);
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim());
    if (isPidAlive(pid)) {
      throw new Error(
        `another janus instance is already running in this directory (pid ${pid}). Use --here=<other-directory> to run a second instance elsewhere.`,
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
