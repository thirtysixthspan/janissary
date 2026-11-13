import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkLexicalPath, checkRealTarget, classifyStats, FILE_POLICY_MAX_BYTES } from './policy.js';

let root: string;
let outside: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-file-policy-')));
  outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-file-policy-outside-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function writeAt(base: string, relative: string, content = 'text\n'): string {
  const target = path.join(base, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

describe('checkLexicalPath', () => {
  it('refuses an absolute path as outside the workspace', () => {
    expect(checkLexicalPath(root, path.join(root, 'a.txt'))).toBe('Outside the workspace');
  });

  it('refuses a parent escape as outside the workspace', () => {
    expect(checkLexicalPath(root, '../outside.txt')).toBe('Outside the workspace');
  });

  it.each(['.env', 'nested/.env.local', '.ENV'])('refuses %s as a secret file', (requested) => {
    expect(checkLexicalPath(root, requested)).toBe('Secret file');
  });

  it('refuses a secret table run inside the root', () => {
    expect(checkLexicalPath(root, '.ssh/id_rsa')).toBe('Secret file');
  });

  it('accepts an ordinary relative path', () => {
    expect(checkLexicalPath(root, 'src/a.ts')).toBeUndefined();
  });
});

describe('checkRealTarget', () => {
  it('refuses a real target outside the real root', () => {
    expect(checkRealTarget(root, writeAt(outside, 'a.txt'))).toBe('Outside the workspace');
  });

  it('refuses a real target that is a secret relative to the root', () => {
    expect(checkRealTarget(root, writeAt(root, 'nested/.env'))).toBe('Secret file');
  });

  it('accepts an ordinary contained file', () => {
    expect(checkRealTarget(root, writeAt(root, 'a.txt'))).toBeUndefined();
  });

  it('refuses the resolved target of a file reached through a symlinked directory leaving the root', () => {
    writeAt(outside, 'a.txt');
    symlinkSync(outside, path.join(root, 'link'));
    expect(checkRealTarget(root, realpathSync(path.join(root, 'link', 'a.txt')))).toBe('Outside the workspace');
  });
});

describe('checkRealTarget under the home directory', () => {
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-file-policy-home-')));
    vi.stubEnv('HOME', home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it('refuses a target under the home .ssh directory', () => {
    const target = writeAt(home, '.ssh/id_rsa');
    expect(checkRealTarget(path.join(home, '.ssh'), target)).toBe('Secret file');
  });
});

describe('classifyStats', () => {
  it('refuses a directory', () => {
    mkdirSync(path.join(root, 'dir'));
    expect(classifyStats(statSync(path.join(root, 'dir')))).toBe('Is a directory');
  });

  it('refuses a named pipe without opening it', () => {
    const pipe = path.join(root, 'pipe');
    execFileSync('mkfifo', [pipe]);
    expect(classifyStats(statSync(pipe))).toBe('Not a text file');
  });

  it('accepts a file of exactly the size cap', () => {
    const target = writeAt(root, 'max.txt', '');
    truncateSync(target, FILE_POLICY_MAX_BYTES);
    expect(classifyStats(statSync(target))).toBeUndefined();
  });

  it('refuses a file one byte over the size cap', () => {
    const target = writeAt(root, 'big.txt', '');
    truncateSync(target, FILE_POLICY_MAX_BYTES + 1);
    expect(classifyStats(statSync(target))).toBe('File too large (>5 MB)');
  });
});
