import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Does some process hold this pid, whoever owns it?
 *
 * A probe that comes back `EPERM` says the pid exists but belongs to another account — that is a
 * live process and is reported as one. A probe failing any other way, `ESRCH` above all, is reported
 * dead.
 *
 * This is the question the detached-peer rendezvous in `src/remote/serve-detach.ts` asks: it wants
 * to know whether the peer it holds a record for is still there before dialling its socket, and a
 * peer running under another account is still there. It is *not* the question the instance lock and
 * `janus stop` ask — see `isOwnInstanceAlive`.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Is this pid a process *this user* could signal — the only way a recorded pid can still be the
 * janus instance that recorded it?
 *
 * `acquireLock` writes `process.pid` and reads it back, so the lock never asks "does some process
 * hold this pid" but "is my earlier janus still running". Pids get recycled, and a recycled pid
 * owned by another account is by construction not that instance: answering `alive` there would leave
 * `janus` refusing to start in the directory with nothing to offer but a lock file to delete by
 * hand. `janus stop` asks the same question for the same reason, and would additionally throw on the
 * SIGTERM it has no permission to deliver.
 *
 * The permission probe is the whole test, which keeps this portable and leaves the lock file a bare
 * pid. What it costs is a project directory shared between two accounts, where one user's janus no
 * longer blocks the other's — rarer than a recycled pid, and it fails toward starting rather than
 * toward a lock nobody can clear.
 */
export function isOwnInstanceAlive(pid: number): boolean {
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
    if (isOwnInstanceAlive(pid)) {
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
