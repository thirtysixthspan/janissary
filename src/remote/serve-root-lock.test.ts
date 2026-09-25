import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireRootLock, rootLockPath } from './serve-root-lock.js';

let home: string;
const target = '/srv/project';

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'root-lock-test-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// A pid no live process holds: far above any real pid range.
const DEAD_PID = 2_147_483_000;

describe('acquireRootLock', () => {
  it('takes a free lock exclusively, writing this process\'s pid under the home directory', async () => {
    const release = await acquireRootLock(target, { home });
    const file = rootLockPath(target, home);
    expect(file.startsWith(path.join(home, '.janissary', 'remote-root-locks'))).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(String(process.pid));
    release();
    expect(existsSync(file)).toBe(false);
  });

  it('waits while a live holder has it, and takes it once released', async () => {
    const first = await acquireRootLock(target, { home });
    let second: (() => void) | undefined;
    const waiting = (async () => { second = await acquireRootLock(target, { home, pollMs: 10 }); })();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(second).toBeUndefined();
    first();
    await waiting;
    expect(second).toBeDefined();
    second?.();
  });

  it('takes over a lock whose holder is dead', async () => {
    const file = rootLockPath(target, home);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, String(DEAD_PID));
    const release = await acquireRootLock(target, { home, pollMs: 10 });
    expect(readFileSync(file, 'utf8')).toBe(String(process.pid));
    release();
  });

  it('keeps separate targets independent', async () => {
    const one = await acquireRootLock('/srv/one', { home });
    const two = await acquireRootLock('/srv/two', { home });
    one();
    two();
  });

  it('rejects a wait that is cancelled', async () => {
    const release = await acquireRootLock(target, { home });
    const abort = new AbortController();
    const waiting = acquireRootLock(target, { home, pollMs: 10, signal: abort.signal });
    abort.abort();
    await expect(waiting).rejects.toThrow('cancelled');
    release();
  });

  it('releases only once, and never a lock that is no longer its own', async () => {
    const release = await acquireRootLock(target, { home });
    const file = rootLockPath(target, home);
    writeFileSync(file, String(DEAD_PID));
    release();
    expect(readFileSync(file, 'utf8')).toBe(String(DEAD_PID));
  });
});
