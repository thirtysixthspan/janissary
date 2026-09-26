import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renameEditorFile } from './rename.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

const notify = vi.fn();
vi.mock('../notifications/index.js', () => ({ notify: (...args: unknown[]) => notify(...args) }));

function setup({ content = 'content', newFile = false } = {}) {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  const watched: Array<{ label: string; filePath: string }> = [];
  managers.editorWatch = { watch: (label: string, filePath: string) => { watched.push({ label, filePath }); } } as unknown as Managers['editorWatch'];
  managers.schedule = { get: vi.fn() } as unknown as Managers['schedule'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-rename-editor-'));
  if (!newFile) writeFileSync(path.join(dir, 'untitled.md'), content);
  const url = managers.tab.registerFile(path.join(dir, 'untitled.md'));
  managers.tab.openEditorTab({
    name: 'untitled.md', path: path.join(dir, 'untitled.md'),
    size: `${content.length} B`, url, newFile,
  });
  return { managers, dir, url, watched, tab: () => managers.tab.tabs.find((item) => item.editor)! };
}

describe('renameEditorFile', () => {
  it('renames a not-yet-saved new file in place on the tab without touching disk', () => {
    const { managers, dir, url, tab } = setup({ newFile: true });

    renameEditorFile(managers, url, 'plan.md');

    expect(existsSync(path.join(dir, 'plan.md'))).toBe(false);
    expect(existsSync(path.join(dir, 'untitled.md'))).toBe(false);
    expect(tab().editor?.name).toBe('plan.md');
    expect(tab().editor?.path).toBe(path.join(dir, 'plan.md'));
    expect(tab().title).toBe('plan.md');
  });

  it('renames a saved file on disk and retargets the ref', () => {
    const { managers, dir, url, tab } = setup();
    const oldUrl = url.slice('/open/'.length);

    renameEditorFile(managers, url, 'final.md');

    expect(existsSync(path.join(dir, 'final.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'untitled.md'))).toBe(false);
    expect(readFileSync(path.join(dir, 'final.md'), 'utf8')).toBe('content');
    expect(tab().editor?.name).toBe('final.md');
    expect(managers.tab.openFilePath(oldUrl)).toBeUndefined();
    expect(managers.tab.openFilePath(tab().editor!.url.slice('/open/'.length))).toBe(path.join(dir, 'final.md'));
  });

  it('starts a watcher on the renamed path', () => {
    const { managers, dir, url, watched } = setup();

    renameEditorFile(managers, url, 'final.md');

    expect(watched.at(-1)?.filePath).toBe(path.join(dir, 'final.md'));
  });

  it('caps the name to the 50-character rename limit', () => {
    const { managers, url, tab } = setup();

    renameEditorFile(managers, url, 'a'.repeat(60));

    expect(tab().editor?.name).toBe('a'.repeat(50));
  });

  it('refuses a rename onto an existing sibling and posts a file-operation notification', () => {
    const { managers, dir, url, tab } = setup();
    writeFileSync(path.join(dir, 'README.md'), 'readme');

    renameEditorFile(managers, url, 'README.md');

    expect(notify).toHaveBeenCalledWith(
      managers, 'file-operation', tab().label,
      'Could not rename untitled.md to README.md. The destination already exists; choose another name.',
    );
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('readme');
    expect(readFileSync(path.join(dir, 'untitled.md'), 'utf8')).toBe('content');
    expect(tab().editor?.name).toBe('untitled.md');
  });

  it('is a no-op for an unknown file ref', () => {
    const { managers, dir, tab } = setup();

    renameEditorFile(managers, '/open/999', 'elsewhere.md');

    expect(existsSync(path.join(dir, 'untitled.md'))).toBe(true);
    expect(tab().editor?.name).toBe('untitled.md');
  });
});
