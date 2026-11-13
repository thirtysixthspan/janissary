import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalFileSystemPort } from './filesystem-port.js';
import { contentHash, SAVE_CONFLICT_ERROR } from '../editor/save-conflict.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from '../file-write/types.js';

let roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-port-policy-'));
  roots.push(dir);
  return dir;
}

function tree(): string {
  const root = tempDir();
  writeFileSync(path.join(root, 'notes.txt'), 'notes');
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const port = new LocalFileSystemPort();

function toolWrite(root: string, relPath: string, content: Uint8Array, expectedHash?: string) {
  return port.writeFile(root, relPath, content, expectedHash, 'tool-text');
}

describe('LocalFileSystemPort tool-text write policy', () => {
  it('refuses a secret path and an escaping symlink', () => {
    const root = tree();
    writeFileSync(path.join(root, '.env'), 'SECRET=1');
    expect(toolWrite(root, '.env', Buffer.from('X'))).toEqual({ ok: false, reason: 'Secret file' });
    const outsideFile = path.join(tempDir(), 'a.txt');
    writeFileSync(outsideFile, 'abc');
    symlinkSync(outsideFile, path.join(root, 'link.txt'));
    expect(toolWrite(root, 'link.txt', Buffer.from('new')).ok).toBe(false);
    expect(readFileSync(outsideFile, 'utf8')).toBe('abc');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('SECRET=1');
  });

  it('refuses invalid UTF-8 and an oversized buffer', () => {
    const root = tree();
    expect(toolWrite(root, 'notes.txt', Uint8Array.from([0xff, 0xfe, 0x41]))).toEqual({ ok: false, reason: 'Not a text file' });
    expect(toolWrite(root, 'notes.txt', new Uint8Array(FILE_POLICY_MAX_BYTES + 1)))
      .toEqual({ ok: false, reason: 'File too large (>5 MB)' });
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('notes');
  });

  it('refuses a stale expected hash', () => {
    const root = tree();
    expect(toolWrite(root, 'notes.txt', Buffer.from('draft'), contentHash('other')))
      .toEqual({ ok: false, reason: SAVE_CONFLICT_ERROR });
  });

  it('creates parents for a nested path', () => {
    const root = tree();
    expect(toolWrite(root, 'deep/er/new.txt', Buffer.from('hi'))).toEqual({ ok: true });
    expect(readFileSync(path.join(root, 'deep', 'er', 'new.txt'), 'utf8')).toBe('hi');
  });

  it('writes a BOM-prefixed buffer byte for byte', () => {
    const root = tree();
    const bytes = Buffer.from('\u{FEFF}text', 'utf8');
    expect(toolWrite(root, 'bom.txt', bytes)).toEqual({ ok: true });
    expect(readFileSync(path.join(root, 'bom.txt'))).toEqual(bytes);
  });
});

describe('LocalFileSystemPort writes without a policy', () => {
  it('writes a binary buffer with NUL bytes as before', () => {
    const root = tree();
    const bytes = Uint8Array.from([0, 1, 0, 255]);
    expect(port.writeFile(root, 'bin.dat', bytes)).toEqual({ ok: true });
    expect(Uint8Array.from(readFileSync(path.join(root, 'bin.dat')))).toEqual(bytes);
  });

  it('keeps the hash-checked save behavior', () => {
    const root = tree();
    expect(port.writeFile(root, 'notes.txt', Buffer.from('saved'), contentHash('notes'))).toEqual({ ok: true });
    expect(port.writeFile(root, 'notes.txt', Buffer.from('again'), contentHash('notes')))
      .toEqual({ ok: false, reason: SAVE_CONFLICT_ERROR });
  });
});

describe('LocalFileSystemPort.editFile', () => {
  it('replaces a single match and reports one replacement', () => {
    const root = tree();
    expect(port.editFile(root, 'notes.txt', 'not', 'NOT', false)).toEqual({ ok: true, value: { replacements: 1 } });
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('NOTes');
  });

  it('replaces every match under replaceAll and reports the count', () => {
    const root = tree();
    writeFileSync(path.join(root, 'many.txt'), 'a-a-a');
    expect(port.editFile(root, 'many.txt', 'a', 'b', true)).toEqual({ ok: true, value: { replacements: 3 } });
    expect(readFileSync(path.join(root, 'many.txt'), 'utf8')).toBe('b-b-b');
  });

  it('refuses zero and multiple matches and leaves the file unchanged', () => {
    const root = tree();
    writeFileSync(path.join(root, 'many.txt'), 'a-a');
    expect(port.editFile(root, 'many.txt', 'zzz', 'y', false)).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
    expect(port.editFile(root, 'many.txt', 'a', 'y', false)).toEqual({ ok: false, reason: MULTIPLE_MATCHES_REASON });
    expect(readFileSync(path.join(root, 'many.txt'), 'utf8')).toBe('a-a');
  });

  it('refuses an absolute path as outside the workspace', () => {
    const root = tree();
    expect(port.editFile(root, path.join(root, 'notes.txt'), 'notes', 'x', false))
      .toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('notes');
  });

  it('refuses a relative path that climbs out of the root', () => {
    const root = tree();
    const sub = path.join(root, 'sub');
    mkdirSync(sub);
    expect(port.editFile(sub, '../notes.txt', 'notes', 'x', false)).toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(toolWrite(sub, '../notes.txt', Buffer.from('x'))).toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('notes');
  });
});
