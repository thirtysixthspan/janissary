import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rootForRelay } from './serve-root-settle.js';

const ORIGIN = 'git@github.com:owner/repo.git';

let tmpDir: string;
let home: string;

function repository(directory: string, origin: string): string {
  mkdirSync(directory, { recursive: true });
  execSync('git init', { cwd: directory, stdio: 'pipe' });
  execSync(`git remote add origin "${origin}"`, { cwd: directory, stdio: 'pipe' });
  return directory;
}

beforeEach(() => {
  tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-root-settle-test-')));
  home = path.join(tmpDir, 'home');
  mkdirSync(home);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('rootForRelay with the attaching project\'s origin', () => {
  it('finds the clone a home-directory launch made at <home>/<repo-name>', () => {
    const root = repository(path.join(home, 'repo'), 'https://github.com/owner/repo.git');
    expect(rootForRelay('~', ORIGIN, home)).toBe(root);
  });

  it('uses an explicit path holding a clone of this project', () => {
    const root = repository(path.join(tmpDir, 'proj'), ORIGIN);
    expect(rootForRelay(root, ORIGIN, home)).toBe(root);
  });

  it('finds no root where a launch would offer a clone, rather than offering one', () => {
    expect(rootForRelay('~', ORIGIN, home)).toBeUndefined();
    expect(rootForRelay(path.join(tmpDir, 'missing'), ORIGIN, home)).toBeUndefined();
  });

  it('finds no root at an explicit path whose repository has another origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(rootForRelay(root, ORIGIN, home)).toBeUndefined();
  });
});

describe('rootForRelay without an origin', () => {
  it('keeps today\'s rules: the home directory is not a repository', () => {
    repository(path.join(home, 'repo'), ORIGIN);
    expect(rootForRelay('~', undefined, home)).toBeUndefined();
  });

  it('uses an explicit path whatever its origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(rootForRelay(root, undefined, home)).toBe(root);
  });
});
