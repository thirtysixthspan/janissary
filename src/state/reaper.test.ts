import { chmodSync, existsSync, lutimesSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import type * as FileSystemPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reapFilesOlderThan } from './reaper.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystemPromises>();
  return { ...actual, stat: vi.fn(actual.stat), unlink: vi.fn(actual.unlink) };
});

const STAMP = Date.parse('2026-01-01T00:00:00Z') / 1000;
const OLD = STAMP - 86_400;
const NEW = STAMP + 86_400;
const CUTOFF_MS = STAMP * 1000;

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-reaper-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeFile(relative: string, seconds: number = OLD): string {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'x');
  utimesSync(target, seconds, seconds);
  return target;
}

function present(relative: string): boolean {
  return existsSync(path.join(root, relative));
}

describe('reapFilesOlderThan', () => {
  it('deletes a file whose mtime is before the cutoff', async () => {
    makeFile('old.txt');
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    expect(present('old.txt')).toBe(false);
  });

  it('keeps files whose mtime is at or after the cutoff', async () => {
    makeFile('equal.txt', STAMP);
    makeFile('new.txt', NEW);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    expect(present('equal.txt')).toBe(true);
    expect(present('new.txt')).toBe(true);
  });

  it('leaves subdirectories and their contents untouched', async () => {
    makeFile('sub.txt/deep.txt');
    const sub = path.join(root, 'sub.txt');
    utimesSync(sub, OLD, OLD);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    expect(present('sub.txt')).toBe(true);
    expect(present('sub.txt/deep.txt')).toBe(true);
  });

  it('keeps files whose names do not end with the extension', async () => {
    for (const name of ['old.cast', 'old.txt.bak', 'old.TXT']) makeFile(name);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    for (const name of ['old.cast', 'old.txt.bak', 'old.TXT']) expect(present(name)).toBe(true);
  });

  it('keeps symbolic links and their targets', async () => {
    const target = makeFile('target.dat');
    const link = path.join(root, 'link.txt');
    symlinkSync(target, link);
    lutimesSync(link, OLD, OLD);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    expect(existsSync(link)).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it('resolves for a directory that does not exist', async () => {
    await expect(reapFilesOlderThan(path.join(root, 'missing'), '.txt', CUTOFF_MS)).resolves.toBeUndefined();
  });

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('resolves for an unreadable directory', async () => {
    makeFile('locked/old.txt');
    const locked = path.join(root, 'locked');
    chmodSync(locked, 0o000);
    try {
      await expect(reapFilesOlderThan(locked, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    } finally {
      chmodSync(locked, 0o755);
    }
    expect(present('locked/old.txt')).toBe(true);
  });

  it('skips a file whose stat fails and continues with the rest', async () => {
    makeFile('a.txt');
    makeFile('b.txt');
    vi.mocked(stat).mockClear();
    vi.mocked(stat).mockImplementationOnce((() => Promise.reject(new Error('stat failed'))) as unknown as typeof stat);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    const rejected = vi.mocked(stat).mock.calls[0][0];
    const other = ['a.txt', 'b.txt'].map((name) => path.join(root, name)).find((file) => file !== rejected);
    expect(existsSync(rejected)).toBe(true);
    expect(existsSync(other as string)).toBe(false);
  });

  it('skips a file whose delete fails and continues with the rest', async () => {
    makeFile('a.txt');
    makeFile('b.txt');
    vi.mocked(unlink).mockClear();
    vi.mocked(unlink).mockImplementationOnce((() => Promise.reject(new Error('unlink failed'))) as unknown as typeof unlink);
    await expect(reapFilesOlderThan(root, '.txt', CUTOFF_MS)).resolves.toBeUndefined();
    const rejected = vi.mocked(unlink).mock.calls[0][0];
    const other = ['a.txt', 'b.txt'].map((name) => path.join(root, name)).find((file) => file !== rejected);
    expect(existsSync(rejected)).toBe(true);
    expect(existsSync(other as string)).toBe(false);
  });
});
