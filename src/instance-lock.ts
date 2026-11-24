import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { clearIfStale, createPidFile, parseLockPid, readPidFile } from './pid-lock-file.js';
import { pidBelongsToCurrentUser } from './process-owner.js';

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
 * Is this pid still the janus instance this account recorded in the lock?
 *
 * A successful signal probe says yes. ESRCH and every other failure say no, so a dead pid stays
 * stale. EPERM alone no longer says no: a sandbox that permits signalling only descendants denies
 * the probe for the detached janus this account started as well as for a foreign process. When the
 * probe is denied, the process table's owner decides. A pid owned by this account is live; one owned
 * by another account is not the instance the lock names and stays stale, so the lock can still be
 * taken over without deleting the file by hand. A process table this sandbox also denies cannot
 * name another owner, so the lock stays held and `janus stop` can still signal the pid.
 *
 * Asking the owner rather than recording an account marker beside the pid keeps the lock file a bare
 * pid and keeps the lock's deliberate cross-account behavior. A project directory shared between two
 * accounts still lets one user's janus run alongside the other's, which fails toward starting rather
 * than toward a lock nobody can clear; the remote-sessions store keys its record file per account
 * (`remote-sessions.<hash>.json`), so each writer names its own file and a load merges the directory's
 * files into one list. `janus stop` asks the same question, so it finds an owned instance whose probe
 * is denied instead of reporting that nothing is running.
 */
export function isOwnInstanceAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Only a positive foreign-owner answer makes a denied probe stale. An unreadable owner fails
    // closed: the lock is held and `janus stop` still signals the pid it names.
    return (error as NodeJS.ErrnoException).code === 'EPERM' && pidBelongsToCurrentUser(pid) !== false;
  }
}

function lockPath(projectDir: string): string {
  return path.join(projectDir, '.janissary', 'lock');
}

// The PID recorded in a directory's lock file, or undefined when no lock file exists (or its
// contents are not a valid pid). Used by `janus stop` to find the instance to signal.
export function readLockPid(projectDir: string): number | undefined {
  const content = readPidFile(lockPath(projectDir));
  return content === undefined ? undefined : parseLockPid(content);
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
  if (createPidFile(file)) return;
  const content = readPidFile(file);
  const pid = content === undefined ? undefined : parseLockPid(content);
  if (pid !== undefined && isOwnInstanceAlive(pid)) throw alreadyRunning(file, pid);
  if (content !== undefined) clearIfStale(file, content);
  if (!createPidFile(file)) throw alreadyRunning(file, readLockPid(projectDir));
}

export function releaseLock(projectDir: string): void {
  const file = lockPath(projectDir);
  const content = readPidFile(file);
  if (content !== undefined && parseLockPid(content) === process.pid) {
    clearIfStale(file, content);
  }
}
