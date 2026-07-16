import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLock, releaseLock } from './instance-lock.js';

let projectDir: string;

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

  it('succeeds when the lock file contains a pid that is not alive', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    acquireLock(projectDir);
    const file = path.join(dir, 'lock');
    expect(readFileSync(file, 'utf8').trim()).toBe(String(process.pid));
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
});
