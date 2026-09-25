import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as Workspace from '../workspace/index.js';

// The temp directory can itself sit inside a repository (a workspace clone's scratch space does), so
// the walk-up is stopped at the suite's own directory, the way a login directory with no repository
// above it would stop.
const ceiling = vi.hoisted(() => ({ dir: '' }));
vi.mock('../workspace/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (from: string) => {
      const found = actual.findRepoRoot(from);
      return found?.startsWith(ceiling.dir) ? found : undefined;
    },
  };
});

const { resolveRemoteRoot } = await import('./serve-root.js');

const ORIGIN = 'git@github.com:owner/repo.git';
const HTTPS = 'https://github.com/owner/repo.git';

let tmpDir: string;
let home: string;
let outside: string;

function repository(directory: string, origin?: string): string {
  mkdirSync(directory, { recursive: true });
  execSync('git init', { cwd: directory, stdio: 'pipe' });
  if (origin !== undefined) execSync(`git remote add origin "${origin}"`, { cwd: directory, stdio: 'pipe' });
  return directory;
}

beforeEach(() => {
  tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-root-test-')));
  ceiling.dir = tmpDir;
  home = path.join(tmpDir, 'home');
  mkdirSync(home);
  outside = path.join(tmpDir, 'login');
  mkdirSync(outside);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveRemoteRoot with the launching project\'s origin', () => {
  it('uses an explicit path holding a clone of this project, over any transport', () => {
    const root = repository(path.join(tmpDir, 'proj'), HTTPS);
    expect(resolveRemoteRoot(root, ORIGIN, { home })).toEqual({ root });
  });

  it('offers a clone at an explicit path that does not exist', () => {
    const target = path.join(tmpDir, 'srv', 'proj');
    expect(resolveRemoteRoot(target, ORIGIN, { home })).toEqual({ offer: { target, url: ORIGIN } });
  });

  it('offers <home>/<repo-name> when no path is given and nothing is found above the login directory', () => {
    expect(resolveRemoteRoot(undefined, ORIGIN, { home, cwd: outside })).toEqual({
      offer: { target: path.join(home, 'repo'), url: ORIGIN, home },
    });
  });

  it('treats an explicit ~ like no path at all', () => {
    expect(resolveRemoteRoot('~', ORIGIN, { home, cwd: outside })).toEqual({
      offer: { target: path.join(home, 'repo'), url: ORIGIN, home },
    });
    expect(resolveRemoteRoot(home, ORIGIN, { home, cwd: outside })).toEqual({
      offer: { target: path.join(home, 'repo'), url: ORIGIN, home },
    });
  });

  it('uses an earlier clone at <home>/<repo-name> without offering', () => {
    const root = repository(path.join(home, 'repo'), ORIGIN);
    expect(resolveRemoteRoot(undefined, ORIGIN, { home, cwd: outside })).toEqual({ root });
  });

  it('offers into an empty <home>/<repo-name>', () => {
    mkdirSync(path.join(home, 'repo'));
    expect(resolveRemoteRoot(undefined, ORIGIN, { home, cwd: outside })).toEqual({
      offer: { target: path.join(home, 'repo'), url: ORIGIN, home },
    });
  });

  it('refuses an occupied <home>/<repo-name>', () => {
    mkdirSync(path.join(home, 'repo'));
    writeFileSync(path.join(home, 'repo', 'notes.txt'), 'mine');
    expect(resolveRemoteRoot(undefined, ORIGIN, { home, cwd: outside })).toEqual({
      refusal: { kind: 'occupied', path: path.join(home, 'repo') },
    });
    repository(path.join(home, 'other'), 'git@github.com:owner/other.git');
    expect(resolveRemoteRoot(undefined, 'git@github.com:someone/other.git', { home, cwd: outside })).toEqual({
      refusal: { kind: 'occupied', path: path.join(home, 'other') },
    });
  });

  it('falls through to the home flow when the walk-up lands on another repository', () => {
    repository(home, 'git@github.com:owner/dotfiles.git');
    const login = path.join(home, 'work');
    mkdirSync(login);
    expect(resolveRemoteRoot(undefined, ORIGIN, { home, cwd: login })).toEqual({
      offer: { target: path.join(home, 'repo'), url: ORIGIN, home },
    });
  });

  it('refuses a home target when no folder can be named for the origin', () => {
    expect(resolveRemoteRoot(undefined, 'https://github.com/', { home, cwd: outside })).toEqual({
      refusal: { kind: 'no-repo-name', path: home, url: 'https://github.com/' },
    });
  });

  it('refuses an explicit path whose repository has a different origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(resolveRemoteRoot(root, ORIGIN, { home })).toEqual({
      refusal: { kind: 'different-origin', path: root, other: 'git@github.com:owner/other.git', url: ORIGIN },
    });
  });

  it('reports another repository\'s origin without its embedded credential', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'https://user:ghp_token@github.com/owner/other.git');
    expect(resolveRemoteRoot(root, ORIGIN, { home })).toEqual({
      refusal: { kind: 'different-origin', path: root, other: 'https://github.com/owner/other.git', url: ORIGIN },
    });
  });

  it('refuses an explicit path that exists but is not a repository', () => {
    const plain = path.join(tmpDir, 'plain');
    mkdirSync(plain);
    expect(resolveRemoteRoot(plain, ORIGIN, { home })).toEqual({ refusal: { kind: 'not-repository', path: plain } });
  });

  it('refuses a repository with no origin remote', () => {
    const root = repository(path.join(tmpDir, 'proj'));
    expect(resolveRemoteRoot(root, ORIGIN, { home })).toEqual({ refusal: { kind: 'no-origin', path: root } });
  });

  it('offers the HTTPS form when a GitHub token was forwarded, and the origin as it is otherwise', () => {
    const target = path.join(tmpDir, 'proj');
    expect(resolveRemoteRoot(target, ORIGIN, { home, githubToken: true })).toEqual({ offer: { target, url: HTTPS } });
    const gitlab = 'git@gitlab.com:owner/repo.git';
    expect(resolveRemoteRoot(target, gitlab, { home, githubToken: true })).toEqual({ offer: { target, url: gitlab } });
  });
});

describe('resolveRemoteRoot without an origin', () => {
  it('roots the server exactly at a path argument', () => {
    const root = repository(path.join(tmpDir, 'proj'), ORIGIN);
    expect(resolveRemoteRoot(root)).toEqual({ root });
  });

  it('walks up from the login directory when given no argument', () => {
    const root = repository(path.join(tmpDir, 'proj'), ORIGIN);
    const nested = path.join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(resolveRemoteRoot(undefined, undefined, { home, cwd: nested })).toEqual({ root });
  });

  it('keeps today\'s refusals, never an offer', () => {
    const missing = path.join(tmpDir, 'nope');
    const plain = path.join(tmpDir, 'plain');
    mkdirSync(plain);
    const originless = repository(path.join(tmpDir, 'originless'));
    expect(resolveRemoteRoot(missing, undefined, { home })).toEqual({ refusal: { kind: 'not-found', path: missing } });
    expect(resolveRemoteRoot(undefined, undefined, { home, cwd: outside })).toEqual({
      refusal: { kind: 'no-repository-found', path: outside },
    });
    expect(resolveRemoteRoot(plain, undefined, { home })).toEqual({ refusal: { kind: 'not-repository', path: plain } });
    expect(resolveRemoteRoot('~', undefined, { home })).toEqual({ refusal: { kind: 'not-repository', path: home } });
    expect(resolveRemoteRoot(originless, undefined, { home })).toEqual({ refusal: { kind: 'no-origin', path: originless } });
  });

  it('uses a repository whatever its origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(resolveRemoteRoot(root, undefined, { home })).toEqual({ root });
  });
});
