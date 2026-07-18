import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveFile } from './save.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

function setup(content = 'original') {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-'));
  const file = path.join(dir, 'notes.txt');
  writeFileSync(file, content);
  const url = managers.tab.registerFile(file);
  managers.tab.openEditorTab({ name: 'notes.txt', path: file, size: '8 B', url });
  return { managers, file, url };
}

describe('saveFile', () => {
  it('writes through the open-file allow-list', () => {
    const { managers, file, url } = setup();
    saveFile(managers, url, 'updated content');
    expect(readFileSync(file, 'utf8')).toBe('updated content');
  });

  it('updates the owning tab displayed size after a save', () => {
    const { managers, url } = setup();
    saveFile(managers, url, 'x'.repeat(2048));
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.size).not.toBe('8 B');
    expect(tab?.editor?.size).toContain('2');
  });

  it('clears a pre-existing draft on a successful save', () => {
    const { managers, url } = setup();
    const tab = managers.tab.tabs.find((t) => t.editor);
    tab!.editorDraft = { content: 'draft', updatedAt: Date.now() };
    saveFile(managers, url, 'updated content');
    expect(tab?.editorDraft).toBeUndefined();
  });

  it('leaves a draft intact when the save fails', () => {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
    const url = managers.tab.registerFile('/no/such/dir/notes.txt');
    managers.tab.openEditorTab({ name: 'notes.txt', path: '/no/such/dir/notes.txt', size: '0 B', url });
    const tab = managers.tab.tabs.find((t) => t.editor);
    tab!.editorDraft = { content: 'draft', updatedAt: Date.now() };
    expect(() => saveFile(managers, url, 'x')).toThrow();
    expect(tab?.editorDraft?.content).toBe('draft');
  });

  it('rejects an unknown file ref', () => {
    const { managers } = setup();
    expect(() => saveFile(managers, '/open/999', 'x')).toThrow(/unknown file ref/);
    expect(() => saveFile(managers, '/etc/passwd', 'x')).toThrow(/unknown file ref/);
  });

  it('surfaces write errors', () => {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    const url = managers.tab.registerFile('/no/such/dir/notes.txt');
    expect(() => saveFile(managers, url, 'x')).toThrow();
  });
});

describe('saveFile new-file auto-suffix', () => {
  function setupNewFile(dir: string, name = 'untitled.md') {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
    const file = path.join(dir, name);
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name, path: file, size: 'unknown', url, newFile: true });
    return { managers, file, url };
  }

  it('writes untitled.md when there is no clash', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    const { managers, file, url } = setupNewFile(dir);
    saveFile(managers, url, 'hello');
    expect(readFileSync(file, 'utf8')).toBe('hello');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.path).toBe(file);
    expect(tab?.editor?.newFile).toBe(false);
  });

  it('auto-suffixes to untitled-2.md when untitled.md already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing');
    const { managers, url } = setupNewFile(dir);
    saveFile(managers, url, 'hello');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.path).toBe(path.join(dir, 'untitled-2.md'));
    expect(tab?.editor?.name).toBe('untitled-2.md');
    expect(readFileSync(path.join(dir, 'untitled-2.md'), 'utf8')).toBe('hello');
    expect(readFileSync(path.join(dir, 'untitled.md'), 'utf8')).toBe('existing');
    expect(tab?.editor?.newFile).toBe(false);
  });

  it('a non-new-file editor still overwrites as before, even if the target already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    const file = path.join(dir, 'existing.txt');
    writeFileSync(file, 'original');
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name: 'existing.txt', path: file, size: '8 B', url });
    saveFile(managers, url, 'updated');
    expect(readFileSync(file, 'utf8')).toBe('updated');
  });
});
