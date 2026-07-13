import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncEditorBuffer } from './sync.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

function setup(content = 'original') {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-sync-'));
  const file = path.join(dir, 'notes.txt');
  writeFileSync(file, content);
  const url = managers.tab.registerFile(file);
  managers.tab.openEditorTab({ name: 'notes.txt', path: file, size: '8 B', url });
  return { managers, file, url };
}

describe('syncEditorBuffer', () => {
  it('caches the buffer as a draft with a fresh timestamp', () => {
    const { managers, url } = setup();
    const before = Date.now();
    syncEditorBuffer(managers, url, 'work in progress');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editorDraft?.content).toBe('work in progress');
    expect(tab?.editorDraft?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('no-ops for an unknown url', () => {
    const { managers } = setup();
    expect(() => syncEditorBuffer(managers, '/open/999', 'x')).not.toThrow();
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editorDraft).toBeUndefined();
  });

  it('does not write to the file on disk', () => {
    const { managers, file, url } = setup();
    syncEditorBuffer(managers, url, 'not on disk');
    expect(readFileSync(file, 'utf8')).toBe('original');
  });
});
