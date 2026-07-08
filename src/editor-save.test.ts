import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveFile } from './editor-save.js';
import { TabManager } from './tab-manager.js';
import type { Managers } from './managers.js';

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
