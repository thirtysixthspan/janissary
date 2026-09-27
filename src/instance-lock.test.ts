import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLock, releaseLock, readLockPid, isPidAlive, isOwnInstanceAlive } from './instance-lock.js';

let projectDir: string;

it.each([['EPERM', true], ['ESRCH', false]] as const)('treats PID probe %s as alive=%s', (code, alive) => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error(code), { code }); });
  try { expect(isPidAlive(123)).toBe(alive); } finally { kill.mockRestore(); }
});

// The narrow question: a pid this user cannot signal is somebody else's process, so it can never be
// the janus instance that wrote its own pid into the lock.
it.each([['EPERM'], ['ESRCH']] as const)('treats PID probe %s as not our own instance', (code) => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error(code), { code }); });
  try { expect(isOwnInstanceAlive(123)).toBe(false); } finally { kill.mockRestore(); }
});

it('treats a pid it can signal as our own instance', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  try { expect(isOwnInstanceAlive(123)).toBe(true); } finally { kill.mockRestore(); }
});

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'instance-lock-test-'));
});

describe('acquireLock', () => {
  it('succeeds and writes process.pid when no lock file exists', () => {
    acquireLock(projectDir);
    const file = path.join(projectDir, '.janissary', 'lock');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trim()).toBe(String(process.pid));
  });

  it('throws when a second call targets a directory already locked by a live pid', () => {
    acquireLock(projectDir);
    expect(() => acquireLock(projectDir)).toThrow(/already running/);
  });

  it('throws with guidance on how to remove the lock file', () => {
    acquireLock(projectDir);
    const file = path.join(projectDir, '.janissary', 'lock');
    expect(() => acquireLock(projectDir)).toThrow(`delete ${file} to clear the lock`);
  });

  // A pid recycled by a process belonging to another account: live, but not the janus this lock
  // names, so the lock is stale and taking it must not need the user to delete the file by hand.
  it('takes a stale lock over a recycled pid owned by another account', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    const kill = vi.spyOn(process, 'kill')
      .mockImplementation(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    try { acquireLock(projectDir); } finally { kill.mockRestore(); }
    expect(readFileSync(path.join(dir, 'lock'), 'utf8').trim()).toBe(String(process.pid));
  });

  // An empty file (a crash between truncate and write), 0, and negative numbers all have a
  // process-group meaning to `process.kill`; none is a pid, so each is stale and never probed.
  it.each([[''], ['0'], ['-1'], ['not-a-pid']])('takes over a lock file holding %j without probing it', (content) => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), content);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try { acquireLock(projectDir); } finally { kill.mockRestore(); }
    expect(kill).not.toHaveBeenCalled();
    expect(readFileSync(path.join(dir, 'lock'), 'utf8')).toBe(String(process.pid));
  });

  // Another starter replaces the stale lock while this one is judging it: the fresh lock is left in
  // place and this start is refused, rather than both running.
  it('refuses when another instance takes over a stale lock first', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'lock');
    writeFileSync(file, '999999');
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      writeFileSync(file, '424242');
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });
    try {
      expect(() => acquireLock(projectDir)).toThrow(/already running in this directory \(pid 424242\)/);
    } finally { kill.mockRestore(); }
    expect(readFileSync(file, 'utf8')).toBe('424242');
  });

  it('succeeds when the lock file contains a pid that is not alive', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    acquireLock(projectDir);
    const file = path.join(dir, 'lock');
    expect(readFileSync(file, 'utf8').trim()).toBe(String(process.pid));
  });
});

describe('readLockPid', () => {
  it('returns undefined when no lock file exists', () => {
    expect(readLockPid(projectDir)).toBeUndefined();
  });

  it('returns the pid recorded in an existing lock file', () => {
    acquireLock(projectDir);
    expect(readLockPid(projectDir)).toBe(process.pid);
  });

  it('returns a stale (dead) pid unchanged — liveness is the caller\'s concern', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    expect(readLockPid(projectDir)).toBe(999_999);
  });

  it.each([[''], ['0'], ['-1'], ['1.5'], ['not-a-pid']])('returns undefined for a lock file holding %j', (content) => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), content);
    expect(readLockPid(projectDir)).toBeUndefined();
  });
});

describe('releaseLock', () => {
  it('removes a lock file whose pid matches process.pid', () => {
    acquireLock(projectDir);
    releaseLock(projectDir);
    expect(existsSync(path.join(projectDir, '.janissary', 'lock'))).toBe(false);
  });

  it('leaves a lock file untouched when its pid does not match process.pid', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'lock');
    writeFileSync(file, '999999');
    releaseLock(projectDir);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trim()).toBe('999999');
  });

  it('leaves a lock file that holds no valid pid untouched', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'lock');
    writeFileSync(file, '');
    releaseLock(projectDir);
    expect(existsSync(file)).toBe(true);
  });
});
