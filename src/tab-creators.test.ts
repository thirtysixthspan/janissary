import { describe, it, expect } from 'vitest';
import { makeTab, makeEditorTab } from './tab.js';
import { uniqueEditorLabel, addEditorTab } from './tab-creators.js';
import type { EditorView } from './types.js';

const view: EditorView = { name: 'notes.txt', path: '/tmp/notes.txt', size: '5 B', url: '/open/1' };

describe('makeEditorTab', () => {
  it('builds an editor view tab titled "editor" with the payload attached', () => {
    const tab = makeEditorTab('editor', '#fff', 2, 1, '#fff', view);
    expect(tab).toMatchObject({ label: 'editor', view: 'editor', title: 'editor', editor: view });
    expect(tab.log).toEqual([]);
  });
});

describe('uniqueEditorLabel', () => {
  it('suffixes the label when editors already exist', () => {
    const tabs = [makeTab('janus', '#fff'), makeEditorTab('editor', '#fff', 2, 1, '#fff', view)];
    expect(uniqueEditorLabel(tabs)).toBe('editor-2');
  });
});

describe('addEditorTab', () => {
  it('adds the tab to the creator group and focuses it', () => {
    const tabs = [makeTab('janus', '#fff')];
    const result = addEditorTab(tabs, 0, view);
    expect(result.tabs).toHaveLength(2);
    const added = result.tabs[result.activeTab];
    expect(added.label).toBe('editor');
    expect(added.group).toBe(1);
    expect(added.editor).toEqual(view);
  });
});
