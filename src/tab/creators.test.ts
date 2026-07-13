import { describe, it, expect } from 'vitest';
import { makeTab, makeEditorTab, makeMarkdownTab } from './index.js';
import { uniqueEditorLabel, addEditorTab, uniqueMarkdownLabel, addMarkdownTab } from './creators.js';
import type { EditorView, MarkdownView } from '../types.js';

const view: EditorView = { name: 'notes.txt', path: '/tmp/notes.txt', size: '5 B', url: '/open/1' };
const markdownView: MarkdownView = { name: 'readme.md', path: '/tmp/readme.md', size: '5 B', url: '/open/1' };

describe('makeEditorTab', () => {
  it('builds an editor view tab with the filename as title and the payload attached', () => {
    const tab = makeEditorTab('editor', '#fff', 2, 1, '#fff', view);
    expect(tab).toMatchObject({ label: 'editor', view: 'editor', title: 'notes.txt', editor: view });
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
    expect(added.title).toBe('notes.txt');
  });

  it('truncates a long filename to the configured max tab name length', () => {
    const long: EditorView = { name: 'very-long-config-file-name-that-is-too-long.json', path: '/tmp/long.json', size: '1 kB', url: '/open/2' };
    const tabs = [makeTab('janus', '#fff')];
    const result = addEditorTab(tabs, 0, long);
    const added = result.tabs[result.activeTab];
    expect(added.title.length).toBeLessThanOrEqual(16);
    expect(added.title).toBe('very-long-config');
  });
});

describe('uniqueMarkdownLabel', () => {
  it('suffixes the label when markdown tabs already exist', () => {
    const tabs = [makeTab('janus', '#fff'), makeMarkdownTab('markdown', '#fff', 2, 1, '#fff', markdownView)];
    expect(uniqueMarkdownLabel(tabs)).toBe('markdown-2');
  });
});

describe('addMarkdownTab', () => {
  it('adds the tab to the creator group and focuses it', () => {
    const tabs = [makeTab('janus', '#fff')];
    const result = addMarkdownTab(tabs, 0, markdownView);
    expect(result.tabs).toHaveLength(2);
    const added = result.tabs[result.activeTab];
    expect(added.label).toBe('markdown');
    expect(added.group).toBe(1);
    expect(added.markdown).toEqual(markdownView);
    expect(added.title).toBe('readme.md');
  });

  it('truncates a long filename to the configured max tab name length', () => {
    const long: MarkdownView = { name: 'very-long-config-file-name-that-is-too-long.md', path: '/tmp/long.md', size: '1 kB', url: '/open/2' };
    const tabs = [makeTab('janus', '#fff')];
    const result = addMarkdownTab(tabs, 0, long);
    const added = result.tabs[result.activeTab];
    expect(added.title.length).toBeLessThanOrEqual(16);
    expect(added.title).toBe('very-long-config');
  });
});
