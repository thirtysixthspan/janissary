import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
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

const LONG_S = '\u{17F}';

function caseInsensitiveVolume(): boolean {
  writeFileSync(path.join(root, 'case-probe'), '');
  const insensitive = existsSync(path.join(root, 'CASE-PROBE'));
  rmSync(path.join(root, 'case-probe'));
  return insensitive;
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
  it('refuses a path ending in a separator for an existing file', () => {
    writeAt(root, 'a.txt');
    expect(refusal('a.txt/')).toBe('Is a directory');
  });

  it('refuses a path ending in a separator for a missing file and creates nothing', () => {
    expect(refusal('missing.txt/')).toBe('Is a directory');
    expect(existsSync(path.join(root, 'missing.txt'))).toBe(false);
  });

  it('refuses a path whose last segment is a dot for an existing file', () => {
    writeAt(root, 'a.txt');
    expect(refusal('a.txt/.')).toBe('Is a directory');
  });

  it.each(['notes/.', 'a/b/..'])('refuses a dot-segment path for a missing file and creates nothing: %s', (requested) => {
    expect(refusal(requested)).toBe('Is a directory');
    expect(existsSync(path.join(root, 'notes'))).toBe(false);
    expect(existsSync(path.join(root, 'a'))).toBe(false);
  });

  it('still resolves a leading dot segment and a dot-prefixed name', () => {
    expect(resolved('./a.txt')).toMatchObject({ realPath: path.join(root, 'a.txt') });
    expect(resolved('.x')).toMatchObject({ realPath: path.join(root, '.x') });
  });

  it.each(['..', '../..'])('still refuses an escaping dot-segment path as outside the workspace: %s', (requested) => {
    expect(refusal(requested)).toBe('Outside the workspace');
  });

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

  it.each(['link/a.txt', 'link/sub/a.txt'])('refuses %s under a dangling ancestor symlink escaping the root', (requested) => {
    symlinkSync(path.join(outside, 'new'), path.join(root, 'link'));
    expect(refusal(requested)).toBe('Outside the workspace');
    expect(existsSync(path.join(outside, 'new'))).toBe(false);
  });

  it('refuses a dangling ancestor symlink inside the root as not a text file', () => {
    symlinkSync(path.join(root, 'missing'), path.join(root, 'link'));
    expect(refusal('link/a.txt')).toBe('Not a text file');
    expect(existsSync(path.join(root, 'missing'))).toBe(false);
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

describe('resolveMutationTarget protected directories', () => {
  it.each([
    '.janissary/roles.json',
    '.janissary/commands.json',
    '.git/config',
    '.git/hooks/pre-commit',
    '.GIT/config',
    'vendor/lib/.git/hooks/pre-commit',
  ])('refuses %s as protected', (requested) => {
    expect(refusal(requested)).toBe('Protected file');
  });

  it.each(['.github/workflows/ci.yml', '.gitignore', 'docs/janissary.md'])('still resolves %s', (requested) => {
    expect(resolved(requested)).toMatchObject({ exists: false });
  });

  it.each([
    ['.git/hooks', 'hooks', 'hooks/pre-commit'],
    ['.janissary', 'settings', 'settings/roles.json'],
  ])('refuses a directory symlink aliasing %s', (directory, alias, requested) => {
    mkdirSync(path.join(root, directory), { recursive: true });
    symlinkSync(path.join(root, directory), path.join(root, alias));
    expect(refusal(requested)).toBe('Protected file');
  });

  it('refuses a file symlink aliasing .git/config', () => {
    symlinkSync(writeAt(root, '.git/config'), path.join(root, 'config'));
    expect(refusal('config')).toBe('Protected file');
  });

  it('refuses a dangling ancestor symlink pointing into .git and creates nothing', () => {
    mkdirSync(path.join(root, '.git'));
    symlinkSync(path.join(root, '.git', 'hooks'), path.join(root, 'hooks'));
    expect(refusal('hooks/pre-commit')).toBe('Protected file');
    expect(existsSync(path.join(root, '.git', 'hooks'))).toBe(false);
  });

  it('resolves an existing ancestor to its on-disk spelling on a case-insensitive volume', (context) => {
    if (!caseInsensitiveVolume()) context.skip();
    mkdirSync(path.join(root, 'Docs'));
    expect(resolved('docs/a.txt')).toMatchObject({ realPath: path.join(root, 'Docs', 'a.txt'), exists: false });
  });

  it('refuses a long-s alias of an existing .janissary and creates no folder', () => {
    writeAt(root, '.janissary/roles.json', '{"roles":[]}');
    expect(refusal(`.jani${LONG_S}${LONG_S}ary/roles.json`)).toBe('Protected file');
    expect(refusal(`.jani${LONG_S}${LONG_S}ary/scripts/run.sh`)).toBe('Protected file');
    expect(readdirSync(root)).toEqual(['.janissary']);
    expect(readdirSync(path.join(root, '.janissary'))).toEqual(['roles.json']);
  });

  it('creates no folder for a nested path under .git or a symlink alias to it', () => {
    mkdirSync(path.join(root, '.git'));
    symlinkSync(path.join(root, '.git'), path.join(root, 'repo'));
    expect(refusal('.git/hooks/new/a.txt')).toBe('Protected file');
    expect(refusal('repo/hooks/new/a.txt')).toBe('Protected file');
    expect(existsSync(path.join(root, '.git', 'hooks'))).toBe(false);
  });
});
