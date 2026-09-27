import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeCommandLine } from './index.js';
import { splitToken } from './helpers.js';

const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal(),
  homedir: () => home.dir,
}));

let root: string;
let cwd: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'compl-tilde-'));
  home.dir = path.join(root, 'home');
  cwd = path.join(root, 'work');
  mkdirSync(home.dir);
  mkdirSync(cwd);
  writeFileSync(path.join(home.dir, 'home-alpha.txt'), '');
  mkdirSync(path.join(home.dir, 'home-bravo'));
  writeFileSync(path.join(home.dir, '.zebra.txt'), '');
  mkdirSync(path.join(root, 'home-sibling'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('splitToken — tilde', () => {
  it('lists the home directory itself for a bare ~', () => {
    expect(splitToken('~', cwd)).toEqual({ dir: home.dir, base: '', prefix: '~/' });
  });

  it('lists the home directory for ~/ with the typed prefix kept', () => {
    expect(splitToken('~/home-b', cwd)).toEqual({ dir: home.dir, base: 'home-b', prefix: '~/' });
  });
});

describe('completeCommandLine — bare ~', () => {
  it('completes into the home directory with the tilde intact', () => {
    const r = completeCommandLine('ls ~', 4, cwd);
    expect(r.newInput).toBe('ls ~/home-');
    expect(r.matches).toEqual(['home-alpha.txt', 'home-bravo']);
  });

  it('completes the same as ~/ does', () => {
    expect(completeCommandLine('ls ~/', 5, cwd).newInput).toBe('ls ~/home-');
  });

  it('appends a trailing slash when the home directory holds one visible directory', () => {
    rmSync(path.join(home.dir, 'home-alpha.txt'));
    const r = completeCommandLine('cd ~', 4, cwd);
    expect(r.newInput).toBe('cd ~/home-bravo/');
    expect(r.matches).toEqual(['home-bravo']);
    writeFileSync(path.join(home.dir, 'home-alpha.txt'), '');
  });
});
