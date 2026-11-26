import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import {
  lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readSshConfigFile, writeSshConfigFile } from './ssh-config-file.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync), writeFileSync: vi.fn(actual.writeFileSync) };
});

const roots: string[] = [];

function scratch(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'janus-ssh-config-file-'));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  const actual = await vi.importActual<typeof FileSystem>('node:fs');
  vi.mocked(readFileSync).mockReset().mockImplementation(actual.readFileSync);
  vi.mocked(writeFileSync).mockReset().mockImplementation(actual.writeFileSync);
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('readSshConfigFile', () => {
  it('returns the file text on a successful read', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');
    writeFileSync(file, 'Host lab\n  HostName lab.local\n');

    expect(readSshConfigFile(file)).toEqual({ text: 'Host lab\n  HostName lab.local\n' });
  });

  it('reports file is too large for a file over 1 MiB', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');
    writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));

    expect(readSshConfigFile(file)).toEqual({ text: '', problem: 'file is too large' });
  });

  it('reports no such file with empty text for a missing file', () => {
    const directory = scratch();

    expect(readSshConfigFile(path.join(directory, 'missing'))).toEqual({ text: '', problem: 'no such file' });
  });

  it('reports is a directory for a directory source', () => {
    const directory = scratch();

    expect(readSshConfigFile(directory)).toEqual({ text: '', problem: 'is a directory' });
  });

  it('reports permission denied when the open fails with EACCES', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');
    writeFileSync(file, 'secret');
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced read failure'), { code: 'EACCES' });
    });

    expect(readSshConfigFile(file)).toEqual({ text: '', problem: 'permission denied' });
  });

  it('reports could not be read for any other read error', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');
    writeFileSync(file, 'content');
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced read failure'), { code: 'EIO' });
    });

    expect(readSshConfigFile(file)).toEqual({ text: '', problem: 'could not be read' });
  });
});

describe('writeSshConfigFile', () => {
  it('creates a missing file with mode 0600', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');

    expect(writeSshConfigFile(file, 'Host lab')).toEqual({});
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toBe('Host lab');
  });

  it('creates a missing parent directory with mode 0700', () => {
    const directory = scratch();
    const parent = path.join(directory, 'nested', 'config-dir');
    const file = path.join(parent, 'config');

    expect(writeSshConfigFile(file, 'Host lab')).toEqual({});
    expect(statSync(parent).mode & 0o777).toBe(0o700);
    expect(readFileSync(file, 'utf8')).toBe('Host lab');
  });

  it('writes through an existing symlink and leaves the link pointing at the same target', () => {
    const directory = scratch();
    const target = path.join(directory, 'real');
    const link = path.join(directory, 'link');
    writeFileSync(target, 'before');
    symlinkSync(target, link);
    const linkTarget = readlinkSync(link);

    expect(writeSshConfigFile(link, 'after')).toEqual({});
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(linkTarget);
    expect(readFileSync(target, 'utf8')).toBe('after');
    expect(readFileSync(link, 'utf8')).toBe('after');
  });

  it('writes through a dangling symlink and creates the file it points at with mode 0600', () => {
    const directory = scratch();
    const target = path.join(directory, 'missing-parent', 'nested', 'config');
    const link = path.join(directory, 'link');
    symlinkSync(target, link);
    const linkTarget = readlinkSync(link);

    expect(writeSshConfigFile(link, 'Host lab')).toEqual({});
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(linkTarget);
    expect(readFileSync(target, 'utf8')).toBe('Host lab');
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(target)).mode & 0o777).toBe(0o700);
  });

  it('reports the mapped problem word and leaves the original bytes in place on a write error', () => {
    const directory = scratch();
    const file = path.join(directory, 'config');
    writeFileSync(file, 'before');
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced write failure'), { code: 'EACCES' });
    });

    expect(writeSshConfigFile(file, 'after')).toEqual({ problem: 'permission denied' });
    expect(readFileSync(file, 'utf8')).toBe('before');
  });
});
