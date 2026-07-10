import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listTasks } from './tasks.js';

let root: string;

function writeTask(name: string, content = 'x'): void {
  mkdirSync(path.join(root, 'ai', 'tasks', path.dirname(name)), { recursive: true });
  writeFileSync(path.join(root, 'ai', 'tasks', name), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tasks-'));
  mkdirSync(path.join(root, 'ai', 'tasks'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('listTasks', () => {
  it('lists top-level .md files sorted, keeping the extension', () => {
    writeTask('fix-a-small-issue.md');
    writeTask('build-a-feature.md');
    expect(listTasks(root)).toEqual([
      { path: 'build-a-feature.md', name: 'build-a-feature.md', depth: 0, dir: false },
      { path: 'fix-a-small-issue.md', name: 'fix-a-small-issue.md', depth: 0, dir: false },
    ]);
  });

  it('ignores non-.md files', () => {
    writeTask('build-a-feature.md');
    writeTask('notes.txt');
    expect(listTasks(root)).toEqual([
      { path: 'build-a-feature.md', name: 'build-a-feature.md', depth: 0, dir: false },
    ]);
  });

  it('recurses into a non-special subdirectory, listing it as a dir row followed by its children', () => {
    writeTask('top.md');
    writeTask('extra/nested.md');
    expect(listTasks(root)).toEqual([
      { path: 'extra', name: 'extra', depth: 0, dir: true },
      { path: 'extra/nested.md', name: 'nested.md', depth: 1, dir: false },
      { path: 'top.md', name: 'top.md', depth: 0, dir: false },
    ]);
  });

  it('recurses more than one level deep, tracking depth and path', () => {
    writeTask('extra/inner/deep.md');
    expect(listTasks(root)).toEqual([
      { path: 'extra', name: 'extra', depth: 0, dir: true },
      { path: 'extra/inner', name: 'inner', depth: 1, dir: true },
      { path: 'extra/inner/deep.md', name: 'deep.md', depth: 2, dir: false },
    ]);
  });

  it('returns an empty list when the ai directory is missing', () => {
    expect(listTasks(path.join(root, 'missing'))).toEqual([]);
  });

  it('returns an empty list when the ai directory has no markdown files', () => {
    writeTask('notes.txt');
    expect(listTasks(root)).toEqual([]);
  });
});
