import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
 * toward a lock nobody can clear. That admitted second writer is deliberate and accounted for
 * downstream: the remote-sessions store keys its record file per account (`remote-sessions.<hash>.json`),
 * so each writer names its own file and a load merges the directory's files into one list, with
 * nothing left that can be renamed out from under the other.
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

// The pid a lock file's contents record, or undefined unless it could name one real process.
// `process.kill` gives 0 and negative numbers a process-group meaning — and an empty or truncated
// file parses to 0 — so probing or signalling anything but a positive integer would reach the
// caller's own process group, or every process the user owns.
function parseLockPid(content: string): number | undefined {
  const pid = Number(content.trim());
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

// The lock file's contents, or undefined when there is no lock file.
function readLockContent(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

// The PID recorded in a directory's lock file, or undefined when no lock file exists (or its
// contents are not a valid pid). Used by `janus stop` to find the instance to signal.
export function readLockPid(projectDir: string): number | undefined {
  const content = readLockContent(lockPath(projectDir));
  return content === undefined ? undefined : parseLockPid(content);
}

// Create the lock file holding this process's pid, in one exclusive step: false when one already
// exists, so two starters racing for a free lock cannot both win.
function createLockFile(file: string): boolean {
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function alreadyRunning(file: string, pid: number | undefined): Error {
  const holder = pid === undefined ? '' : ` (pid ${pid})`;
  return new Error(
    `another janus instance is already running in this directory${holder}. Run janus <other-directory> to start a second instance elsewhere. If you're sure no other instance is running, delete ${file} to clear the lock.`,
  );
}

// Take the directory's lock, refusing while a live instance of ours holds it. A lock naming no live
// instance — a dead or foreign pid, or contents that are not a pid at all — is stale and taken over
// once. It is removed only if unchanged since it was judged stale, so a lock another starter took
// over in the meantime survives, and the retry then refuses rather than admitting both.
export function acquireLock(projectDir: string): void {
  const file = lockPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  if (createLockFile(file)) return;
  const content = readLockContent(file);
  const pid = content === undefined ? undefined : parseLockPid(content);
  if (pid !== undefined && isOwnInstanceAlive(pid)) throw alreadyRunning(file, pid);
  if (content !== undefined && readLockContent(file) === content) rmSync(file, { force: true });
  if (!createLockFile(file)) throw alreadyRunning(file, readLockPid(projectDir));
}

export function releaseLock(projectDir: string): void {
  if (readLockPid(projectDir) === process.pid) {
    rmSync(lockPath(projectDir), { force: true });
  }
}
