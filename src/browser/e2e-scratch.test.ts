import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { allocateBrowserScratch } from './e2e-scratch.js';
import type * as security from '../security.js';

// The token is the only randomness in the allocation, and the collision paths are exactly the ones
// that need it pinned: what a second launch hitting an already-claimed directory does, and what a
// launch whose temp sibling is already gone after a half-claim does.
vi.mock('../security.js', async (importOriginal) => ({
  ...await importOriginal<typeof security>(),
  makeToken: () => 'pinned-token',
}));

const TOKEN = 'pinned-token';
const CONTAINER = 'browsers';

let projectDir: string;

function container(): string {
  return workspacePath(CONTAINER);
}

function claimedPath(slug: string): string {
  return path.join(container(), `${slug}-${TOKEN}`);
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'e2e-scratch-'));
  initWorkspaceDir(projectDir);
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('allocateBrowserScratch', () => {
  it('hands back an empty directory and its temp sibling', () => {
    const scratch = allocateBrowserScratch('tab');

    expect(scratch.dir).toBe(claimedPath('tab'));
    expect(scratch.tempDir).toBe(`${scratch.dir}.tmp`);
    expect(existsSync(scratch.dir)).toBe(true);
    expect(existsSync(scratch.tempDir)).toBe(true);
  });

  it('removes exactly the two paths it allocated, and is idempotent', () => {
    const scratch = allocateBrowserScratch('tab');

    scratch.remove();
    expect(existsSync(scratch.dir)).toBe(false);
    expect(existsSync(scratch.tempDir)).toBe(false);

    expect(() => scratch.remove()).not.toThrow();
  });

  it('leaves the container itself in place for the startup sweep', () => {
    const scratch = allocateBrowserScratch('tab');

    scratch.remove();

    expect(existsSync(container())).toBe(true);
  });

  // The label rides along for `ls` only, so a hostile one must not be able to steer the path out of
  // the container: no separator and no `..` component survives the reduction.
  it('keeps a traversal label inside the container', () => {
    const scratch = allocateBrowserScratch('as ../../escape');

    expect(path.dirname(scratch.dir)).toBe(container());
    expect(scratch.dir).toBe(claimedPath('as-..-..-escape'));
  });

  it('falls back to a plain name when the label reduces to nothing', () => {
    const scratch = allocateBrowserScratch('%%%');

    expect(scratch.dir).toBe(claimedPath('browser'));
  });

  it('truncates a long label rather than growing the directory name without bound', () => {
    const scratch = allocateBrowserScratch('a'.repeat(80));

    expect(path.dirname(scratch.dir)).toBe(container());
    expect(scratch.dir).toBe(claimedPath('a'.repeat(32)));
  });

  // Someone else's directory is never taken over: the attempt is refused and the loop tries again
  // under a fresh token. With the token pinned, every attempt loses the same race and the bounded
  // retry gives up loudly instead of spinning.
  it('retries an already-claimed directory and gives up when attempts run out', () => {
    mkdirSync(container(), { recursive: true });
    mkdirSync(claimedPath('tab'));

    expect(() => allocateBrowserScratch('tab')).toThrow('could not allocate a scratch directory');
    expect(existsSync(claimedPath('tab'))).toBe(true);
  });

  // A pair that only half-claimed is rolled back, so the next attempt starts from a clean container
  // rather than inheriting the directory the failed attempt left behind.
  it('rolls back the directory when the temp sibling is already taken', () => {
    mkdirSync(container(), { recursive: true });
    mkdirSync(`${claimedPath('tab')}.tmp`);

    expect(() => allocateBrowserScratch('tab')).toThrow('could not allocate a scratch directory');
    expect(existsSync(claimedPath('tab'))).toBe(false);
    expect(existsSync(`${claimedPath('tab')}.tmp`)).toBe(true);
  });

  // Only `EEXIST` means "someone else owns it, try again". Any other failure is a real fault —
  // an unwritable container, say — and is rethrown rather than swallowed into a silent retry.
  it('rethrows a failure that is not a collision', () => {
    mkdirSync(container(), { recursive: true });
    chmodSync(container(), 0o500);

    try {
      expect(() => allocateBrowserScratch('tab')).toThrow(/EACCES|EPERM/iu);
    } finally {
      chmodSync(container(), 0o700);
    }
  });
});