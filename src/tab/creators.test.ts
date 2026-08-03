import { describe, it, expect } from 'vitest';
import { makeEditorTab, makeMarkdownTab, makePluginTab, makeTab } from './index.js';
import {
  addEditorTab, addImageTab, addMarkdownTab, addPluginTab,
  uniqueEditorLabel, uniqueMarkdownLabel, uniquePluginLabel,
} from './creators.js';
import type { EditorView, ImageView, MarkdownView, PluginTabRecord } from './types.js';

const view: EditorView = { name: 'notes.txt', path: '/tmp/notes.txt', size: '5 B', url: '/open/1' };
const markdownView: MarkdownView = { name: 'readme.md', path: '/tmp/readme.md', size: '5 B', url: '/open/1' };
const plugin: PluginTabRecord = {
  id: 'video', instanceKey: '/tmp/clip.mp4', schemaVersion: 1,
  payload: { name: 'clip.mp4', url: '/open/1' }, fileRefs: ['1'], sourceLabel: 'janus',
};

describe('addImageTab', () => {
  it('retains a long image filename as the complete tab title', () => {
    const image: ImageView = { name: 'very-long-reference-image-name.png', path: '/tmp/image.png', size: '1 kB', url: '/open/2' };
    const result = addImageTab([makeTab('janus', '#fff')], 0, image);
    expect(result.tabs[result.activeTab].title).toBe(image.name);
  });
});

describe('uniquePluginLabel', () => {
  it('suffixes the declaration prefix when plugin tabs already exist', () => {
    const tabs = [makeTab('janus', '#fff'), makePluginTab('video', '#123', 2, 1, '#fff', 'clip.mp4', plugin)];
    expect(uniquePluginLabel(tabs, 'video')).toBe('video-2');
  });
});

describe('addPluginTab', () => {
  it('inherits the creator group and uses the plugin title and envelope', () => {
    const tabs = [makeTab('janus', '#fff')];
    const result = addPluginTab(tabs, 0, 'video', 'clip.mp4', plugin);
    expect(result.tabs).toHaveLength(2);
    const added = result.tabs[result.activeTab];
    expect(added.label).toBe('video');
    expect(added.group).toBe(1);
    expect(added.groupColor).toBe('#fff');
    expect(added.dotColor).not.toBe('#fff');
    expect(added.plugin).toEqual(plugin);
    expect(added.view).toBe('plugin');
    expect(added.title).toBe('clip.mp4');
  });
});

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

  it('retains a long filename as the complete tab title', () => {
    const long: EditorView = { name: 'very-long-config-file-name-that-is-too-long.json', path: '/tmp/long.json', size: '1 kB', url: '/open/2' };
    const tabs = [makeTab('janus', '#fff')];
    const result = addEditorTab(tabs, 0, long);
    const added = result.tabs[result.activeTab];
    expect(added.title).toBe(long.name);
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

  it('retains a long filename as the complete tab title', () => {
    const long: MarkdownView = { name: 'very-long-config-file-name-that-is-too-long.md', path: '/tmp/long.md', size: '1 kB', url: '/open/2' };
    const tabs = [makeTab('janus', '#fff')];
    const result = addMarkdownTab(tabs, 0, long);
    const added = result.tabs[result.activeTab];
    expect(added.title).toBe(long.name);
  });
});
