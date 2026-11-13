import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { createTargetParents, resolveMutationTarget, type WriteTarget } from './target.js';

let root: string;
let outside: string;
const lockedDirectories: string[] = [];

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-write-target-')));
  outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-write-target-outside-')));
});

afterEach(() => {
  for (const directory of lockedDirectories) chmodSync(directory, 0o700);
  lockedDirectories.length = 0;
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function writeAt(base: string, relative: string, content = 'text\n'): string {
  const target = path.join(base, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function resolved(requested: string): WriteTarget {
  const result = resolveMutationTarget(root, requested);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function refusal(requested: string): string | undefined {
  const result = resolveMutationTarget(root, requested);
  return result.ok ? undefined : result.reason;
}

describe('resolveMutationTarget destinations', () => {
  it('resolves a new file at the root with no missing segments', () => {
    expect(resolved('new.txt')).toEqual({ realRoot: root, realPath: path.join(root, 'new.txt'), exists: false, missingSegments: [] });
  });

  it('resolves a new nested path with its missing parent segments', () => {
    expect(resolved('a/b/c.txt')).toEqual({ realRoot: root, realPath: path.join(root, 'a/b/c.txt'), exists: false, missingSegments: ['a', 'b'] });
  });

  it('resolves an existing regular file to itself', () => {
    const file = writeAt(root, 'src/a.ts');
    expect(resolved('src/a.ts')).toEqual({ realRoot: root, realPath: file, exists: true, missingSegments: [] });
  });

  it('accepts an existing file over the read size cap', () => {
    const file = writeAt(root, 'big.txt', '');
    truncateSync(file, FILE_POLICY_MAX_BYTES + 1);
    expect(resolved('big.txt')).toMatchObject({ realPath: file, exists: true });
  });
});

describe('resolveMutationTarget policy refusals', () => {
  it.each([
    [path.join('/', 'tmp', 'a.txt'), 'Outside the workspace'],
    ['../escape.txt', 'Outside the workspace'],
    ['.env', 'Secret file'],
    ['nested/.env.local', 'Secret file'],
    ['.claude/.credentials.json', 'Secret file'],
  ])('refuses %s with %s', (requested, reason) => {
    expect(refusal(requested)).toBe(reason);
  });

  it('refuses a symlink inside the root that aliases a secret path', () => {
    mkdirSync(path.join(root, '.claude'));
    symlinkSync(path.join(root, '.claude'), path.join(root, 'alias'));
    expect(refusal('alias/.credentials.json')).toBe('Secret file');
  });

  describe('under the home directory', () => {
    beforeEach(() => {
      vi.stubEnv('HOME', root);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('refuses a home-anchored secret', () => {
      mkdirSync(path.join(root, '.ssh'));
      expect(resolveMutationTarget(path.join(root, '.ssh'), 'id_rsa')).toEqual({ ok: false, reason: 'Secret file' });
    });
  });
});

describe('resolveMutationTarget ancestors', () => {
  it('refuses an ancestor symlink escaping the root and creates nothing', () => {
    symlinkSync(outside, path.join(root, 'link'));
    expect(refusal('link/sub/a.txt')).toBe('Outside the workspace');
    expect(existsSync(path.join(outside, 'sub'))).toBe(false);
  });

  it('refuses an ancestor that is a regular file with the ENOTDIR reason', () => {
    writeAt(root, 'file.txt');
    expect(refusal('file.txt/sub/a.txt')).toBe('Filesystem error ENOTDIR; check the item and destination, then try again');
    expect(refusal('file.txt/a.txt')).toBe('Filesystem error ENOTDIR; check the item and destination, then try again');
  });
});

describe('resolveMutationTarget existing targets', () => {
  it('follows a target symlink to a file inside the root', () => {
    const file = writeAt(root, 'real.txt');
    symlinkSync(file, path.join(root, 'link.txt'));
    expect(resolved('link.txt')).toMatchObject({ realPath: file, exists: true });
  });

  it('refuses a target symlink escaping the root', () => {
    symlinkSync(writeAt(outside, 'a.txt'), path.join(root, 'link.txt'));
    expect(refusal('link.txt')).toBe('Outside the workspace');
  });

  it('refuses a dangling target symlink as not a text file', () => {
    symlinkSync(path.join(root, 'missing.txt'), path.join(root, 'dangling.txt'));
    expect(refusal('dangling.txt')).toBe('Not a text file');
  });

  it.each(['dir', '', '.'])('refuses directory target %j', (requested) => {
    mkdirSync(path.join(root, 'dir'));
    expect(refusal(requested)).toBe('Is a directory');
  });

  it('refuses a named pipe without opening it', () => {
    execFileSync('mkfifo', [path.join(root, 'pipe')]);
    expect(refusal('pipe')).toBe('Not a text file');
  });
});

describe('createTargetParents', () => {
  it('creates every missing segment and returns the real destination', () => {
    const target = resolved('a/b/c.txt');
    expect(createTargetParents(target)).toEqual({ ok: true, value: path.join(root, 'a/b/c.txt') });
    expect(existsSync(path.join(root, 'a/b'))).toBe(true);
  });

  it('creates nothing when the parent already exists', () => {
    mkdirSync(path.join(root, 'a'));
    const target = resolved('a/c.txt');
    expect(createTargetParents(target)).toEqual({ ok: true, value: path.join(root, 'a/c.txt') });
    expect(existsSync(path.join(root, 'a/c.txt'))).toBe(false);
  });

  it('returns the permission reason when the parent is not writable', () => {
    const locked = path.join(root, 'locked');
    mkdirSync(locked);
    const target = resolved('locked/sub/a.txt');
    chmodSync(locked, 0o500);
    lockedDirectories.push(locked);
    expect(createTargetParents(target)).toEqual({ ok: false, reason: 'Permission denied; check file and folder permissions, then try again' });
  });

  it('refuses when a missing segment becomes an escaping symlink before creation', () => {
    const target = resolved('a/b/c.txt');
    symlinkSync(outside, path.join(root, 'a'));
    expect(createTargetParents(target)).toEqual({ ok: false, reason: 'Outside the workspace' });
  });
});
