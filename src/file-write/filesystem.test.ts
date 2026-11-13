import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicWriteFile } from '../atomic-write.js';
import type * as AtomicWrite from '../atomic-write.js';
import { contentHash, SAVE_CONFLICT_ERROR } from '../editor/save-conflict.js';
import { fileOperationReason } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { writeToolTextFile } from './filesystem.js';

vi.mock('../atomic-write.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return { atomicWriteFile: vi.fn(actual.atomicWriteFile) };
});

const PERMISSION_REASON = fileOperationReason({ code: 'EACCES' });

let root: string;
const lockedPaths: string[] = [];

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-write-text-')));
});

afterEach(() => {
  for (const locked of lockedPaths) chmodSync(locked, 0o700);
  lockedPaths.length = 0;
  rmSync(root, { recursive: true, force: true });
});

function at(relative: string): string {
  return path.join(root, relative);
}

function seed(relative: string, content: string | Buffer): string {
  const file = at(relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function lock(location: string, mode: number): void {
  chmodSync(location, mode);
  lockedPaths.push(location);
}

function reason(...args: Parameters<typeof writeToolTextFile>): string | undefined {
  const result = writeToolTextFile(...args);
  return result.ok ? undefined : result.reason;
}

describe('writeToolTextFile content', () => {
  it('creates a new file and replaces an existing one', () => {
    expect(writeToolTextFile(root, 'a.txt', 'one\n')).toEqual({ ok: true, value: undefined });
    expect(readFileSync(at('a.txt'), 'utf8')).toBe('one\n');
    expect(writeToolTextFile(root, 'a.txt', 'two\n').ok).toBe(true);
    expect(readFileSync(at('a.txt'), 'utf8')).toBe('two\n');
  });

  it.each([['LF', 'a\nb\n'], ['CRLF', 'a\r\nb\r\n'], ['mixed', 'a\r\nb\nc\r'], ['BOM', '\u{FEFF}text\n']])('writes %s text byte for byte', (_label, text) => {
    expect(writeToolTextFile(root, 'f.txt', text).ok).toBe(true);
    expect(readFileSync(at('f.txt')).equals(Buffer.from(text, 'utf8'))).toBe(true);
  });

  it('creates an empty file and empties an existing one', () => {
    expect(writeToolTextFile(root, 'new.txt', '').ok).toBe(true);
    expect(statSync(at('new.txt')).size).toBe(0);
    seed('old.txt', 'content');
    expect(writeToolTextFile(root, 'old.txt', '').ok).toBe(true);
    expect(statSync(at('old.txt')).size).toBe(0);
  });

  it('creates missing parents for a nested path', () => {
    expect(writeToolTextFile(root, 'a/b/c.txt', 'x').ok).toBe(true);
    expect(readFileSync(at('a/b/c.txt'), 'utf8')).toBe('x');
  });

  it.each([['NUL', 'a\0b'], ['lone surrogate', 'a\u{D800}b']])('refuses %s text without creating anything', (_label, text) => {
    expect(reason(root, 'n/f.txt', text)).toBe('Not a text file');
    expect(existsSync(at('n'))).toBe(false);
  });

  it('writes exactly 5 MiB and refuses one byte more, leaving the file unchanged', () => {
    expect(writeToolTextFile(root, 'big.txt', 'a'.repeat(FILE_POLICY_MAX_BYTES)).ok).toBe(true);
    expect(statSync(at('big.txt')).size).toBe(FILE_POLICY_MAX_BYTES);
    seed('keep.txt', 'keep');
    expect(reason(root, 'keep.txt', 'a'.repeat(FILE_POLICY_MAX_BYTES + 1))).toBe('File too large (>5 MB)');
    expect(readFileSync(at('keep.txt'), 'utf8')).toBe('keep');
  });

  it('passes a target refusal through unchanged with nothing created', () => {
    expect(reason(root, 'deep/.env', 'SECRET=1')).toBe('Secret file');
    expect(existsSync(at('deep'))).toBe(false);
  });
});

describe('writeToolTextFile expected hash', () => {
  it('writes when the hash matches the existing text with its BOM stripped', () => {
    seed('a.txt', '\u{FEFF}old');
    expect(writeToolTextFile(root, 'a.txt', 'new', contentHash('old')).ok).toBe(true);
    expect(readFileSync(at('a.txt'), 'utf8')).toBe('new');
  });

  it('refuses a mismatched hash, leaving content and creating no folder', () => {
    seed('a.txt', 'old');
    expect(reason(root, 'a.txt', 'new', contentHash('other'))).toBe(SAVE_CONFLICT_ERROR);
    expect(readFileSync(at('a.txt'), 'utf8')).toBe('old');
  });

  it('creates a missing target despite a hash', () => {
    expect(writeToolTextFile(root, 'p/new.txt', 'x', contentHash('anything')).ok).toBe(true);
    expect(readFileSync(at('p/new.txt'), 'utf8')).toBe('x');
  });

  it('reports the permission reason for an unreadable existing target', () => {
    const file = seed('a.txt', 'old');
    lock(file, 0o000);
    expect(reason(root, 'a.txt', 'new', contentHash('old'))).toBe(PERMISSION_REASON);
  });

  it('refuses an existing target over 5 MiB when a hash is given', () => {
    const file = seed('big.txt', '');
    truncateSync(file, FILE_POLICY_MAX_BYTES + 1);
    expect(reason(root, 'big.txt', 'small', contentHash(''))).toBe('File too large (>5 MB)');
    expect(statSync(file).size).toBe(FILE_POLICY_MAX_BYTES + 1);
  });
});

describe('writeToolTextFile filesystem failures', () => {
  it('reports the permission reason for a read-only parent folder and keeps the file', () => {
    seed('dir/a.txt', 'old');
    lock(at('dir'), 0o500);
    expect(reason(root, 'dir/a.txt', 'new')).toBe(PERMISSION_REASON);
    expect(readFileSync(at('dir/a.txt'), 'utf8')).toBe('old');
  });

  it('keeps the mode of a replaced file', () => {
    const file = seed('secret.txt', 'old');
    chmodSync(file, 0o600);
    expect(writeToolTextFile(root, 'secret.txt', 'new').ok).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('leaves created folders in place when the write fails after parent creation', () => {
    vi.mocked(atomicWriteFile).mockImplementationOnce(() => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    });
    expect(reason(root, 'made/inner/f.txt', 'text')).toBe(PERMISSION_REASON);
    expect(existsSync(at('made/inner'))).toBe(true);
    expect(existsSync(at('made/inner/f.txt'))).toBe(false);
  });
});
