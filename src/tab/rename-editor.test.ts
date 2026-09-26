import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renameEditorTab } from './rename-editor.js';
import { TabManager } from './manager.js';
import type { Managers } from '../managers.js';

const notify = vi.fn();
vi.mock('../notifications/index.js', () => ({ notify: (...args: unknown[]) => notify(...args) }));

const TAKEN = 'The destination already exists; choose another name';
const SEPARATOR = 'The name contains a path separator; enter a name without folders';

function setup({ newFile = false } = {}) {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: vi.fn() } as unknown as Managers['editorWatch'];
  managers.schedule = { get: vi.fn() } as unknown as Managers['schedule'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-rename-guard-'));
  const filePath = path.join(dir, 'notes.md');
  if (!newFile) writeFileSync(filePath, 'notes');
  writeFileSync(path.join(dir, 'README.md'), 'readme');
  const url = managers.tab.registerFile(filePath);
  managers.tab.openEditorTab({ name: 'notes.md', path: filePath, size: '5 B', url, newFile });
  const index = managers.tab.activeTab;
  const tab = () => managers.tab.tabs[index];
  const rename = (title: string) => renameEditorTab(
    tab(), title, 50,
    (reference, absPath) => managers.tab.replaceFile(reference, absPath),
    vi.fn(),
  );
  return { managers, dir, filePath, index, tab, rename };
}

describe('renameEditorTab refusals', () => {
  beforeEach(() => { notify.mockReset(); });

  it('refuses to rename a saved file onto an existing sibling and leaves both files untouched', () => {
    const { dir, filePath, tab, rename } = setup();

    const refusal = rename('README.md');

    expect(refusal).toBe(`Could not rename notes.md to README.md. ${TAKEN}.`);
    expect(readFileSync(filePath, 'utf8')).toBe('notes');
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('readme');
    expect(tab().editor?.path).toBe(filePath);
    expect(tab().editor?.name).toBe('notes.md');
    expect(tab().title).toBe('notes.md');
  });

  it('refuses to point a not-yet-saved new file at an existing sibling', () => {
    const { dir, filePath, tab, rename } = setup({ newFile: true });

    const refusal = rename('README.md');

    expect(refusal).toBe(`Could not rename notes.md to README.md. ${TAKEN}.`);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('readme');
    expect(tab().editor?.path).toBe(filePath);
  });

  it('refuses a name containing a path separator and keeps the file in its folder', () => {
    const { dir, filePath, tab, rename } = setup();
    mkdirSync(path.join(dir, 'sub'));

    const refusal = rename('sub/notes.md');

    expect(refusal).toBe(`Could not rename notes.md to sub/notes.md. ${SEPARATOR}.`);
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(path.join(dir, 'sub', 'notes.md'))).toBe(false);
    expect(tab().editor?.path).toBe(filePath);
  });

  it('refuses a dot-dot name', () => {
    const { filePath, tab, rename } = setup();

    expect(rename('..')).toBe(`Could not rename notes.md to ... ${SEPARATOR}.`);
    expect(existsSync(filePath)).toBe(true);
    expect(tab().editor?.path).toBe(filePath);
  });

  it('allows a case-only rename of the file onto itself', () => {
    const { dir, tab, rename } = setup();

    expect(rename('Notes.md')).toBeUndefined();

    expect(tab().editor?.path).toBe(path.join(dir, 'Notes.md'));
    expect(readFileSync(path.join(dir, 'Notes.md'), 'utf8')).toBe('notes');
  });

  it('renames onto a free name as before and returns nothing', () => {
    const { dir, filePath, tab, rename } = setup();

    expect(rename('plan.md')).toBeUndefined();

    expect(existsSync(filePath)).toBe(false);
    expect(readFileSync(path.join(dir, 'plan.md'), 'utf8')).toBe('notes');
    expect(tab().editor?.path).toBe(path.join(dir, 'plan.md'));
    expect(tab().title).toBe('plan.md');
  });

  it('posts the refusal as a file-operation notification from a tab-strip rename', () => {
    const { managers, filePath, index, tab } = setup();

    managers.tab.renameTab(index, 'README.md');

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      managers, 'file-operation', tab().label, `Could not rename notes.md to README.md. ${TAKEN}.`,
    );
    expect(tab().editor?.path).toBe(filePath);
  });
});
