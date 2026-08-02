import { describe, it, expect } from 'vitest';
import { makeTab, makeEditorTab, makeMarkdownTab, makeVideoTab } from './index.js';
import { uniqueEditorLabel, addEditorTab, uniqueMarkdownLabel, addMarkdownTab, addImageTab, uniqueVideoLabel, addVideoTab } from './creators.js';
import type { EditorView, MarkdownView, ImageView, VideoView } from './types.js';

const view: EditorView = { name: 'notes.txt', path: '/tmp/notes.txt', size: '5 B', url: '/open/1' };
const markdownView: MarkdownView = { name: 'readme.md', path: '/tmp/readme.md', size: '5 B', url: '/open/1' };
const videoView: VideoView = { name: 'clip.mp4', path: '/tmp/clip.mp4', size: '5 B', url: '/open/1', player: 'QuickTime Player' };

describe('addImageTab', () => {
  it('retains a long image filename as the complete tab title', () => {
    const image: ImageView = { name: 'very-long-reference-image-name.png', path: '/tmp/image.png', size: '1 kB', url: '/open/2' };
    const result = addImageTab([makeTab('janus', '#fff')], 0, image);
    expect(result.tabs[result.activeTab].title).toBe(image.name);
  });
});

describe('uniqueVideoLabel', () => {
  it('suffixes the label when video tabs already exist', () => {
    const tabs = [makeTab('janus', '#fff'), makeVideoTab('video', '#fff', 2, 1, '#fff', videoView)];
    expect(uniqueVideoLabel(tabs)).toBe('video-2');
  });
});

describe('addVideoTab', () => {
  it('adds the tab to the creator group with a distinct dot color and the file name as title', () => {
    const tabs = [makeTab('janus', '#fff')];
    const result = addVideoTab(tabs, 0, videoView);
    expect(result.tabs).toHaveLength(2);
    const added = result.tabs[result.activeTab];
    expect(added.label).toBe('video');
    expect(added.group).toBe(1);
    expect(added.groupColor).toBe('#fff');
    expect(added.dotColor).not.toBe('#fff');
    expect(added.video).toEqual(videoView);
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
