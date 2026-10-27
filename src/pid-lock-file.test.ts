import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearIfStale, createPidFile, parseLockPid, readPidFile } from './pid-lock-file.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'pid-lock-file-test-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('parseLockPid', () => {
  it('accepts positive safe integers and rejects invalid pids', () => {
    expect(parseLockPid(' 123 ')).toBe(123);
    for (const content of ['', '0', '-1', '1.5', 'not-a-pid', '9007199254740992']) {
      expect(parseLockPid(content)).toBeUndefined();
    }
  });
});

describe('createPidFile', () => {
  it('creates an exclusive file containing this process pid', () => {
    const file = path.join(directory, 'instance.lock');
    expect(createPidFile(file)).toBe(true);
    expect(createPidFile(file)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(String(process.pid));
  });

  it('applies an optional file mode', () => {
    const file = path.join(directory, 'root.lock');
    expect(createPidFile(file, 0o600)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe('readPidFile', () => {
  it('returns undefined only for a missing file', () => {
    const file = path.join(directory, 'lock');
    expect(readPidFile(file)).toBeUndefined();
    writeFileSync(file, '123');
    expect(readPidFile(file)).toBe('123');
  });

  it('rethrows errors other than a missing file', () => {
    const file = path.join(directory, 'lock-directory');
    mkdirSync(file);
    expect(() => readPidFile(file)).toThrow();
  });
});

describe('clearIfStale', () => {
  it('removes only the content that was judged stale', () => {
    const file = path.join(directory, 'lock');
    writeFileSync(file, 'stale');
    clearIfStale(file, 'stale');
    expect(existsSync(file)).toBe(false);

    writeFileSync(file, 'current');
    clearIfStale(file, 'stale');
    expect(readFileSync(file, 'utf8')).toBe('current');
  });
});
