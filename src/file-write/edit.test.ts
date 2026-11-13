import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileOperationReason } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { editToolTextFile } from './edit.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

const PERMISSION_REASON = fileOperationReason({ code: 'EACCES' });
const NUL = String.fromCodePoint(0);
const BOM = String.fromCodePoint(0xfe_ff);
const LONE_SURROGATE = String.fromCodePoint(0xd8_00);

let root: string;
let outside: string;
const lockedPaths: string[] = [];

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-edit-text-')));
  outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-edit-text-outside-')));
});

afterEach(() => {
  for (const locked of lockedPaths) chmodSync(locked, 0o700);
  lockedPaths.length = 0;
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
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

function reason(...args: Parameters<typeof editToolTextFile>): string | undefined {
  const result = editToolTextFile(...args);
  return result.ok ? undefined : result.reason;
}

function expectUnchanged(file: string, before: string | Buffer): void {
  expect(readFileSync(file).equals(Buffer.from(before))).toBe(true);
}

describe('editToolTextFile replacement', () => {
  it('replaces one match on disk', () => {
    const file = seed('a.txt', 'alpha beta\n');
    expect(editToolTextFile(root, 'a.txt', 'beta', 'gamma', false)).toEqual({ ok: true, value: { replacements: 1 } });
    expect(readFileSync(file, 'utf8')).toBe('alpha gamma\n');
  });

  it('replaces every match with replaceAll', () => {
    const file = seed('a.txt', 'x y x\n');
    expect(editToolTextFile(root, 'a.txt', 'x', 'z', true)).toEqual({ ok: true, value: { replacements: 2 } });
    expect(readFileSync(file, 'utf8')).toBe('z y z\n');
  });

  it.each([
    ['missing', false, NO_MATCHING_TEXT_REASON],
    ['x', false, MULTIPLE_MATCHES_REASON],
    ['', false, NO_MATCHING_TEXT_REASON],
    [LONE_SURROGATE, true, NO_MATCHING_TEXT_REASON],
  ])('refuses oldString %j and leaves the file unchanged', (oldString, replaceAll, expected) => {
    const file = seed('a.txt', 'x y x\n');
    expect(reason(root, 'a.txt', oldString, 'z', replaceAll)).toBe(expected);
    expectUnchanged(file, 'x y x\n');
  });

  it('preserves untouched CRLF and mixed line endings byte for byte', () => {
    const file = seed('a.txt', 'one\r\ntwo\nthree\r\n');
    expect(editToolTextFile(root, 'a.txt', 'two', 'TWO', false).ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('one\r\nTWO\nthree\r\n');
  });

  it('keeps a BOM on disk', () => {
    const file = seed('a.txt', `${BOM}hello\n`);
    expect(editToolTextFile(root, 'a.txt', 'hello', 'bye', false).ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(`${BOM}bye\n`);
  });

  it.each([NUL, LONE_SURROGATE])('refuses a newString containing %j', (bad) => {
    const file = seed('a.txt', 'abc');
    expect(reason(root, 'a.txt', 'b', `x${bad}`, false)).toBe('Not a text file');
    expectUnchanged(file, 'abc');
  });
});

describe('editToolTextFile size', () => {
  it('refuses an existing file over 5 MiB', () => {
    const content = 'a'.repeat(FILE_POLICY_MAX_BYTES + 1);
    const file = seed('big.txt', content);
    expect(reason(root, 'big.txt', 'a', 'b', true)).toBe('File too large (>5 MB)');
    expectUnchanged(file, content);
  });

  it('refuses a result that grows past 5 MiB', () => {
    const content = `${'a'.repeat(FILE_POLICY_MAX_BYTES - 1)}b`;
    const file = seed('big.txt', content);
    expect(reason(root, 'big.txt', 'b', 'cc', false)).toBe('File too large (>5 MB)');
    expectUnchanged(file, content);
  });

  it('writes a result of exactly 5 MiB', () => {
    const file = seed('big.txt', `${'a'.repeat(FILE_POLICY_MAX_BYTES - 2)}b`);
    expect(editToolTextFile(root, 'big.txt', 'b', 'cc', false).ok).toBe(true);
    expect(readFileSync(file).byteLength).toBe(FILE_POLICY_MAX_BYTES);
  });
});

describe('editToolTextFile targets', () => {
  it('refuses a missing file and a missing parent without creating anything', () => {
    expect(reason(root, 'none.txt', 'a', 'b', false)).toBe('File not found');
    expect(reason(root, 'sub/none.txt', 'a', 'b', false)).toBe('File not found');
    expect(existsSync(at('none.txt'))).toBe(false);
    expect(existsSync(at('sub'))).toBe(false);
  });

  it('refuses a directory', () => {
    mkdirSync(at('dir'));
    expect(reason(root, 'dir', 'a', 'b', false)).toBe('Is a directory');
  });

  it('refuses a named pipe without opening it', () => {
    execFileSync('mkfifo', [at('pipe')]);
    expect(reason(root, 'pipe', 'a', 'b', false)).toBe('Not a text file');
  });

  it.each([
    ['invalid UTF-8', Buffer.from([0x61, 0xff, 0x62])],
    ['NUL content', Buffer.from(`a${NUL}b`)],
  ])('refuses %s without change', (_label, content) => {
    const file = seed('a.txt', content);
    expect(reason(root, 'a.txt', 'a', 'z', false)).toBe('Not a text file');
    expectUnchanged(file, content);
  });

  it('refuses an empty file as no match', () => {
    const file = seed('empty.txt', '');
    expect(reason(root, 'empty.txt', 'a', 'b', false)).toBe(NO_MATCHING_TEXT_REASON);
    expectUnchanged(file, '');
  });

  it('refuses an escaping path and a secret path', () => {
    seed('.env', 'SECRET=1');
    expect(reason(root, '../escape.txt', 'a', 'b', false)).toBe('Outside the workspace');
    expect(reason(root, '.env', 'SECRET', 'X', false)).toBe('Secret file');
    expectUnchanged(at('.env'), 'SECRET=1');
  });

  it('refuses an escaping symlink and leaves the outside file unchanged', () => {
    const outsideFile = path.join(outside, 'a.txt');
    writeFileSync(outsideFile, 'abc');
    symlinkSync(outsideFile, at('link.txt'));
    expect(reason(root, 'link.txt', 'b', 'x', false)).toBe('Outside the workspace');
    expectUnchanged(outsideFile, 'abc');
  });

  it('reports the permission reason for a read-only file', () => {
    const file = seed('ro.txt', 'abc');
    chmodSync(file, 0o400);
    lockedPaths.push(file);
    chmodSync(root, 0o500);
    lockedPaths.push(root);
    expect(reason(root, 'ro.txt', 'b', 'x', false)).toBe(PERMISSION_REASON);
    expectUnchanged(file, 'abc');
  });
});
