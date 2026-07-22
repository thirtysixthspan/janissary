import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { OpenFileManager } from './open-file-manager.js';
import type { Managers } from './managers.js';

describe('OpenFileManager.edit', () => {
  it('opens the editor for a new file that does not exist on disk', () => {
    const appended: string[] = [];
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: (_label: string, _entry: unknown) => { appended.push(JSON.stringify(_entry)); },
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit newfile.txt', 'newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(path.resolve('/working', 'newfile.txt'));
    expect(appended).toHaveLength(0);
  });

  it('opens the editor for an absolute new file path', () => {
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit /tmp/newfile.txt', '/tmp/newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe('/tmp/newfile.txt');
  });

  it('forwards a target line through to the opened editor view', () => {
    const opened: { path: string; line?: number }[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string; line?: number }) => { opened.push(view); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit foo.txt:42', 'foo.txt', 'janus', 42);

    expect(opened).toHaveLength(1);
    expect(opened[0].line).toBe(42);
  });
});

describe('OpenFileManager.newFile', () => {
  const makeManagers = (dir: string, opened: string[]): Managers => ({
    tab: {
      cwdOf: () => dir,
      append: () => {},
      openEditorTab: (view: { path: string }) => { opened.push(view.path); },
      registerFile: (p: string) => `/open/test-${p.length}`,
    },
  } as unknown as Managers);

  it('opens the literal target when it does not exist yet', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled.md')]);
  });

  it('opens untitled-2.md when untitled.md already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-2.md')]);
  });

  it('opens untitled-3.md when both untitled.md and untitled-2.md already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    writeFileSync(path.join(dir, 'untitled-2.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-3.md')]);
  });
});

describe('OpenFileManager.newDirectory', () => {
  const makeManager = (dir: string) => new OpenFileManager({
    tab: { cwdOf: () => dir },
  } as unknown as Managers);

  it('creates the requested directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled'))).toBe(true);
  });

  it('creates inside a nested target directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'src'));
    const manager = makeManager(dir);

    manager.newDirectory('src/untitled', 'janus');

    expect(existsSync(path.join(dir, 'src', 'untitled'))).toBe(true);
  });

  it('uses the next free suffix when directories already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'untitled'));
    mkdirSync(path.join(dir, 'untitled-2'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled-3'))).toBe(true);
  });
});
