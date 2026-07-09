import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listTasks } from './tasks.js';

let root: string;

function writeTask(name: string, content = 'x'): void {
  writeFileSync(path.join(root, 'ai', name), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tasks-'));
  mkdirSync(path.join(root, 'ai'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('listTasks', () => {
  it('lists top-level .md files sorted, keeping the extension', () => {
    writeTask('fix-a-small-issue.md');
    writeTask('build-a-feature.md');
    expect(listTasks(root)).toEqual(['build-a-feature.md', 'fix-a-small-issue.md']);
  });

  it('ignores non-.md files', () => {
    writeTask('build-a-feature.md');
    writeTask('notes.txt');
    expect(listTasks(root)).toEqual(['build-a-feature.md']);
  });

  it('excludes subdirectories such as guidelines and personas', () => {
    writeTask('build-a-feature.md');
    mkdirSync(path.join(root, 'ai', 'guidelines'), { recursive: true });
    writeFileSync(path.join(root, 'ai', 'guidelines', 'code-guidelines.md'), 'x');
    mkdirSync(path.join(root, 'ai', 'personas'), { recursive: true });
    expect(listTasks(root)).toEqual(['build-a-feature.md']);
  });

  it('returns an empty list when the ai directory is missing', () => {
    expect(listTasks(path.join(root, 'missing'))).toEqual([]);
  });

  it('returns an empty list when the ai directory has no markdown files', () => {
    writeTask('notes.txt');
    expect(listTasks(root)).toEqual([]);
  });
});
