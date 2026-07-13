import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { editorFeedEntries } from './editor-feed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'janus-editor-feed-'));
let counter = 0;

afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

function tempFile(content: string): { id: string; file: string } {
  const id = String(++counter);
  const file = path.join(dir, `f${id}.txt`);
  writeFileSync(file, content);
  return { id, file };
}

function makeManagers(tabs: Tab[], files: Record<string, string>): Managers {
  return {
    tab: { tabs, openFilePath: (id: string) => files[id] },
  } as unknown as Managers;
}

function editorTab(label: string, id: string, name = 'notes.txt', group = 1): Tab {
  return { label, view: 'editor', group, editor: { name, url: `/open/${id}`, path: '', size: '' } } as unknown as Tab;
}

describe('editorFeedEntries', () => {
  it('emits the full current content on first sight', () => {
    const { id, file } = tempFile('line one\nline two\n');
    const managers = makeManagers([editorTab('notes', id)], { [id]: file });
    const entries = editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].tabLabel).toBe('notes');
    expect(entries[0].entry.output).toBe('line one\nline two\n');
  });

  it('emits nothing when the file is unchanged since the last feed', () => {
    const { id, file } = tempFile('same');
    const managers = makeManagers([editorTab('notes', id)], { [id]: file });
    const seen = new Map<string, string>();
    expect(editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen)).toHaveLength(1);
    expect(editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen)).toHaveLength(0);
  });

  it('emits a unified diff once the file changes', () => {
    const { id, file } = tempFile('original\n');
    const managers = makeManagers([editorTab('notes', id)], { [id]: file });
    const seen = new Map<string, string>();
    editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen);
    writeFileSync(file, 'changed\n');
    const entries = editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toContain('-original');
    expect(entries[0].entry.output).toContain('+changed');
  });

  it('truncates an oversized entry with a trailing note', () => {
    const { id, file } = tempFile('x'.repeat(30_000));
    const managers = makeManagers([editorTab('notes', id)], { [id]: file });
    const entries = editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toMatch(/… diff truncated \(\d+ bytes total\)$/);
  });

  it('emits nothing for a never-saved missing file', () => {
    const id = 'missing';
    const managers = makeManagers([editorTab('new', id)], { [id]: path.join(dir, 'does-not-exist.txt') });
    expect(editorFeedEntries(managers, [{ kind: 'tab', label: 'new' }], new Map())).toHaveLength(0);
  });

  it('emits a diff removing every line when a seen file is deleted', () => {
    const { id, file } = tempFile('content line\n');
    const managers = makeManagers([editorTab('notes', id)], { [id]: file });
    const seen = new Map<string, string>();
    editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen);
    rmSync(file);
    const entries = editorFeedEntries(managers, [{ kind: 'tab', label: 'notes' }], seen);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.output).toContain('-content line');
  });

  it('ignores a non-editor target', () => {
    const managers = makeManagers([{ label: 'claude', view: 'harness', group: 1 } as unknown as Tab], {});
    expect(editorFeedEntries(managers, [{ kind: 'tab', label: 'claude' }], new Map())).toEqual([]);
  });
});
