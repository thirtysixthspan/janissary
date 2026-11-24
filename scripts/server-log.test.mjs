import { afterEach, describe, expect, it, vi } from 'vitest';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pointLatestLog, serverLogFilename } from '../bin/server-log.mjs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, lstatSync: vi.fn(actual.lstatSync), symlinkSync: vi.fn(actual.symlinkSync), renameSync: vi.fn(actual.renameSync) };
});

const roots = [];

function root() {
  const directory = mkdtempSync(path.join(tmpdir(), 'janus-server-log-'));
  roots.push(directory);
  return directory;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots.length = 0;
});

describe('serverLogFilename', () => {
  it('names a log localhost followed by the ISO timestamp', () => {
    expect(serverLogFilename(Date.UTC(2026, 10, 23, 15, 4, 5, 123))).toBe('localhost-2026-11-23T15-04-05-123Z.log');
  });
});

describe('pointLatestLog', () => {
  it('creates latest.log as a link with a bare target when it is absent', () => {
    const directory = root();
    const target = serverLogFilename(Date.UTC(2026, 10, 23, 15, 4, 5, 123));
    writeFileSync(path.join(directory, target), 'new log\n');

    expect(pointLatestLog(directory, target)).toBeUndefined();

    expect(readlinkSync(path.join(directory, 'latest.log'))).toBe(target);
    expect(readFileSync(path.join(directory, 'latest.log'), 'utf8')).toBe('new log\n');
  });

  it('replaces an existing link', () => {
    const directory = root();
    const oldTarget = 'localhost-old.log';
    const newTarget = 'localhost-new.log';
    writeFileSync(path.join(directory, oldTarget), 'old log\n');
    writeFileSync(path.join(directory, newTarget), 'new log\n');
    symlinkSync(oldTarget, path.join(directory, 'latest.log'));

    expect(pointLatestLog(directory, newTarget)).toBeUndefined();

    expect(readlinkSync(path.join(directory, 'latest.log'))).toBe(newTarget);
    expect(readFileSync(path.join(directory, 'latest.log'), 'utf8')).toBe('new log\n');
  });

  it('replaces a dangling link', () => {
    const directory = root();
    const newTarget = 'localhost-new.log';
    writeFileSync(path.join(directory, newTarget), 'new log\n');
    symlinkSync('localhost-gone.log', path.join(directory, 'latest.log'));

    expect(pointLatestLog(directory, newTarget)).toBeUndefined();

    expect(readlinkSync(path.join(directory, 'latest.log'))).toBe(newTarget);
    expect(readFileSync(path.join(directory, 'latest.log'), 'utf8')).toBe('new log\n');
  });

  it('refuses a regular file without changing its bytes', () => {
    const directory = root();
    const latest = path.join(directory, 'latest.log');
    const sentinel = 'sentinel bytes\n';
    writeFileSync(latest, sentinel);

    expect(pointLatestLog(directory, 'localhost-new.log')).toBe('not a symbolic link');

    expect(readFileSync(latest, 'utf8')).toBe(sentinel);
    expect(lstatSync(latest).isSymbolicLink()).toBe(false);
  });

  it('refuses a directory without changing its contents', () => {
    const directory = root();
    const latest = path.join(directory, 'latest.log');
    mkdirSync(latest);
    writeFileSync(path.join(latest, 'kept.txt'), 'kept bytes\n');

    expect(pointLatestLog(directory, 'localhost-new.log')).toBe('not a symbolic link');

    expect(readFileSync(path.join(latest, 'kept.txt'), 'utf8')).toBe('kept bytes\n');
    expect(lstatSync(latest).isDirectory()).toBe(true);
  });

  it('returns an lstat error message and leaves an existing link alone', () => {
    const directory = root();
    const latest = path.join(directory, 'latest.log');
    symlinkSync('localhost-earlier.log', latest);
    vi.mocked(lstatSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced lstat failure'), { code: 'EIO' });
    });

    expect(pointLatestLog(directory, 'localhost-new.log')).toBe('forced lstat failure');

    expect(readlinkSync(latest)).toBe('localhost-earlier.log');
  });

  it('returns a symlink error message and leaves no temporary link', () => {
    const directory = root();
    const latest = path.join(directory, 'latest.log');
    symlinkSync('localhost-earlier.log', latest);
    vi.mocked(symlinkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced symlink failure'), { code: 'EIO' });
    });

    expect(pointLatestLog(directory, 'localhost-new.log')).toBe('forced symlink failure');

    expect(readlinkSync(latest)).toBe('localhost-earlier.log');
    expect(readdirSync(directory)).toEqual(['latest.log']);
  });

  it('returns a rename error message and leaves no temporary link', () => {
    const directory = root();
    const latest = path.join(directory, 'latest.log');
    symlinkSync('localhost-earlier.log', latest);
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced replacement failure'), { code: 'EIO' });
    });

    expect(pointLatestLog(directory, 'localhost-new.log')).toBe('forced replacement failure');

    expect(readlinkSync(latest)).toBe('localhost-earlier.log');
    expect(readdirSync(directory)).toEqual(['latest.log']);
  });
});
