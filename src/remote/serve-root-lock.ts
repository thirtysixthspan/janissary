import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { isOwnInstanceAlive } from '../instance-lock.js';

// One lock per clone target, so two launches reaching the same missing root at once — two tabs from
// one profile, say — show one prompt and make one clone. It lives in the remote user's own home
// rather than beside the target, because the target's parent may not exist yet.
//
// The file holds a bare pid, the format `acquireLock` in `src/instance-lock.ts` writes, but it is
// created with the exclusive `wx` flag so two launches racing for a free lock cannot both win.
// Liveness is `isOwnInstanceAlive`: the lock lives in this user's home, so a recycled pid owned by
// another account cannot be its holder.

// How often a waiter looks again. There is no timeout: the holder is either waiting on a prompt or
// cloning, and closing either tab ends the wait.
export const ROOT_LOCK_POLL_MS = 500;

export type RootLockOptions = {
  home?: string;
  signal?: AbortSignal;
  pollMs?: number;
};

export function rootLockPath(target: string, home: string = homedir()): string {
  const digest = createHash('sha256').update(target).digest('hex');
  return path.join(home, '.janissary', 'remote-root-locks', `${digest}.lock`);
}

function holder(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function tryCreate(file: string): boolean {
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

// A holder whose pid is not a live process of this user's is gone; its lock is removed so the next
// attempt can take it. The file is read again first, so a lock another waiter took over a moment ago
// is not removed out from under it.
function clearIfDead(file: string, content: string): void {
  const pid = Number(content.trim());
  if (Number.isSafeInteger(pid) && pid > 0 && isOwnInstanceAlive(pid)) return;
  if (holder(file) === content) rmSync(file, { force: true });
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
    const aborted = (): void => { clearTimeout(timer); reject(new Error('Root lock wait cancelled.')); };
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

/**
 * Resolves to a release function once this process holds the lock on `target`, waiting while a live
 * process holds it and taking over one whose holder is dead. Rejects if `signal` aborts first.
 * Release is idempotent and removes the file only while it still names this process.
 */
export async function acquireRootLock(target: string, options: RootLockOptions = {}): Promise<() => void> {
  const file = rootLockPath(target, options.home);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  while (!tryCreate(file)) {
    if (options.signal?.aborted) throw new Error('Root lock wait cancelled.');
    const content = holder(file);
    if (content !== undefined) clearIfDead(file, content);
    if (holder(file) !== undefined) await wait(options.pollMs ?? ROOT_LOCK_POLL_MS, options.signal);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (holder(file) === String(process.pid)) rmSync(file, { force: true });
  };
}
