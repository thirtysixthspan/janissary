import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listTasks } from './tasks.js';

let root: string;
let janissary: string;

function writeTask(base: string, name: string, content = 'x'): void {
  mkdirSync(path.join(base, 'ai', 'tasks', path.dirname(name)), { recursive: true });
  writeFileSync(path.join(base, 'ai', 'tasks', name), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tasks-'));
  janissary = mkdtempSync(path.join(tmpdir(), 'tasks-janissary-'));
  mkdirSync(path.join(root, 'ai', 'tasks'), { recursive: true });
  mkdirSync(path.join(janissary, 'ai', 'tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(janissary, { recursive: true, force: true });
});

describe('listTasks', () => {
  it('lists top-level .md files sorted, keeping the extension, tagged as project', () => {
    writeTask(root, 'fix-a-small-issue.md');
    writeTask(root, 'build-a-feature.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'build-a-feature.md', name: 'build-a-feature.md', depth: 0, dir: false, source: 'project' },
      { path: 'fix-a-small-issue.md', name: 'fix-a-small-issue.md', depth: 0, dir: false, source: 'project' },
    ]);
  });

  it('ignores non-.md files', () => {
    writeTask(root, 'build-a-feature.md');
    writeTask(root, 'notes.txt');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'build-a-feature.md', name: 'build-a-feature.md', depth: 0, dir: false, source: 'project' },
    ]);
  });

  it('recurses into a non-special subdirectory, listing it as a dir row followed by its children', () => {
    writeTask(root, 'top.md');
    writeTask(root, 'extra/nested.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'extra', name: 'extra', depth: 0, dir: true, source: 'project' },
      { path: 'extra/nested.md', name: 'nested.md', depth: 1, dir: false, source: 'project' },
      { path: 'top.md', name: 'top.md', depth: 0, dir: false, source: 'project' },
    ]);
  });

  it('recurses more than one level deep, tracking depth and path', () => {
    writeTask(root, 'extra/inner/deep.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'extra', name: 'extra', depth: 0, dir: true, source: 'project' },
      { path: 'extra/inner', name: 'inner', depth: 1, dir: true, source: 'project' },
      { path: 'extra/inner/deep.md', name: 'deep.md', depth: 2, dir: false, source: 'project' },
    ]);
  });

  it('returns an empty list when neither ai directory exists', () => {
    expect(listTasks(path.join(root, 'missing'), path.join(janissary, 'missing'))).toEqual([]);
  });

  it('returns an empty list when the ai directory has no markdown files', () => {
    writeTask(root, 'notes.txt');
    expect(listTasks(root, janissary)).toEqual([]);
  });

  it('tags Janissary-only tasks as janissary and lists them after project tasks', () => {
    writeTask(root, 'project-only.md');
    writeTask(janissary, 'built-in.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'project-only.md', name: 'project-only.md', depth: 0, dir: false, source: 'project' },
      { path: 'built-in.md', name: 'built-in.md', depth: 0, dir: false, source: 'janissary' },
    ]);
  });

  it('drops a Janissary task whose path is shadowed by the project copy', () => {
    writeTask(root, 'build-a-feature.md');
    writeTask(janissary, 'build-a-feature.md');
    writeTask(janissary, 'fix-a-bug.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'build-a-feature.md', name: 'build-a-feature.md', depth: 0, dir: false, source: 'project' },
      { path: 'fix-a-bug.md', name: 'fix-a-bug.md', depth: 0, dir: false, source: 'janissary' },
    ]);
  });

  it('lists only the Janissary section when the project has no tasks', () => {
    writeTask(janissary, 'built-in.md');
    expect(listTasks(root, janissary)).toEqual([
      { path: 'built-in.md', name: 'built-in.md', depth: 0, dir: false, source: 'janissary' },
    ]);
  });
});
