import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { allocateBrowserScratch } from './e2e-scratch.js';

// A real directory tree, not a `node:fs` stub: what this module promises is that two allocations
// never name the same directory and that removing one cannot reach another's files, and a stub of
// the very calls that enforce that would assert nothing.

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'e2e-scratch-'));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function container(): string {
  return workspacePath('browsers');
}

describe('allocateBrowserScratch layout', () => {
  it('creates an empty directory and an empty temp sibling inside the container', () => {
    const scratch = allocateBrowserScratch('bot');
    expect(path.dirname(scratch.dir)).toBe(container());
    expect(scratch.tempDir).toBe(`${scratch.dir}.tmp`);
    expect(readdirSync(scratch.dir)).toEqual([]);
    expect(readdirSync(scratch.tempDir)).toEqual([]);
  });

  it('names the directory after the tab so a listing says which tab owns it', () => {
    const scratch = allocateBrowserScratch('bot');
    expect(path.basename(scratch.dir).startsWith('bot-')).toBe(true);
  });

  // The container is a direct child of the workspace root, so `clearWorkspaceDir`'s startup sweep
  // still reaches it; the browser directories under it are grandchildren, which is what puts them
  // out of reach of `workspacePath(label)`.
  it('keeps the container a direct child of the workspace root', () => {
    allocateBrowserScratch('bot');
    expect(path.dirname(container())).toBe(path.join(root, '.janissary', 'workspace'));
  });
});

describe('allocateBrowserScratch exclusivity', () => {
  it('gives two launches of the same label two different directories', () => {
    const first = allocateBrowserScratch('bot');
    const second = allocateBrowserScratch('bot');
    expect(second.dir).not.toBe(first.dir);
    expect(second.tempDir).not.toBe(first.tempDir);
  });

  // The two-live-session case: one remote channel spawns both, so both are handed the same label.
  it('leaves the other launch untouched when one of them closes', () => {
    const first = allocateBrowserScratch('bot');
    const second = allocateBrowserScratch('bot');
    writeFileSync(path.join(second.dir, 'profile'), 'live');
    writeFileSync(path.join(second.tempDir, 'scratch'), 'live');
    first.remove();
    expect(existsSync(first.dir)).toBe(false);
    expect(readFileSync(path.join(second.dir, 'profile'), 'utf8')).toBe('live');
    expect(readFileSync(path.join(second.tempDir, 'scratch'), 'utf8')).toBe('live');
  });

  // A directory it did not create is never adopted, whatever put it there.
  it('never adopts a directory that already exists', () => {
    const scratch = allocateBrowserScratch('bot');
    writeFileSync(path.join(scratch.dir, 'clone'), 'not the browser\'s');
    const next = allocateBrowserScratch('bot');
    expect(next.dir).not.toBe(scratch.dir);
    expect(readFileSync(path.join(scratch.dir, 'clone'), 'utf8')).toBe('not the browser\'s');
  });

  // The old name. A tab launched as `bot.browser` owns this path; nothing here may reach it.
  it('leaves a tab workspace in the root alone', () => {
    const tabDir = workspacePath('bot.browser');
    mkdirSync(tabDir, { recursive: true });
    writeFileSync(path.join(tabDir, 'uncommitted.ts'), 'work');
    const scratch = allocateBrowserScratch('bot');
    scratch.remove();
    expect(readFileSync(path.join(tabDir, 'uncommitted.ts'), 'utf8')).toBe('work');
  });
});

describe('allocateBrowserScratch label handling', () => {
  it.each([
    ['../../thing', 'traversal'],
    ['..', 'a bare parent reference'],
    ['a/b', 'a separator'],
    ['../', 'a trailing separator'],
    ['...', 'nothing but dots'],
  ])('keeps %s (%s) inside the container', (label) => {
    const scratch = allocateBrowserScratch(label);
    expect(path.dirname(scratch.dir)).toBe(container());
    expect(readdirSync(scratch.dir)).toEqual([]);
  });

  it('falls back to a usable name when the label reduces to nothing', () => {
    const scratch = allocateBrowserScratch('///');
    expect(path.basename(scratch.dir).startsWith('browser-')).toBe(true);
  });
});

describe('BrowserScratch.remove', () => {
  it('deletes both allocated paths', () => {
    const scratch = allocateBrowserScratch('bot');
    writeFileSync(path.join(scratch.dir, 'downloads'), 'x');
    scratch.remove();
    expect(existsSync(scratch.dir)).toBe(false);
    expect(existsSync(scratch.tempDir)).toBe(false);
  });

  it('is safe to call twice, and when the paths are already gone', () => {
    const scratch = allocateBrowserScratch('bot');
    rmSync(scratch.dir, { recursive: true, force: true });
    expect(() => { scratch.remove(); scratch.remove(); }).not.toThrow();
  });
});
