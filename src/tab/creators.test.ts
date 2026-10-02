import { describe, it, expect } from 'vitest';
import { makeEditorTab, makeMultiAgentTab, makePluginTab, makeTab } from './index.js';
import { addEditorTab, addMultiAgentTab, addPluginTab } from './creators.js';
import { uniqueEditorLabel, uniqueMultiAgentLabel, uniquePluginLabel } from './unique-labels.js';
import type { EditorView, PluginTabRecord } from './types.js';
import type { MultiAgentRun } from '../multiagent/types.js';

const view: EditorView = { name: 'notes.txt', path: '/tmp/notes.txt', size: '5 B', url: '/open/1' };
const plugin: PluginTabRecord = {
  id: 'video', instanceKey: '/tmp/clip.mp4', schemaVersion: 1,
  payload: { name: 'clip.mp4', url: '/open/1' }, fileRefs: ['1'], sourceLabel: 'janus',
};

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

const run: MultiAgentRun = {
  prompt: 'what does this repository do?',
  members: [{ index: 0, model: 'opencode/a', state: 'running', dir: '/ws/a' }],
};

describe('uniqueMultiAgentLabel', () => {
  it('suffixes the label when a comparison is already open', () => {
    const tabs = [makeTab('janus', '#fff'), makeMultiAgentTab('multi-agent', '#123', 2, 1, '#fff', run, false)];
    expect(uniqueMultiAgentLabel(tabs)).toBe('multi-agent-2');
  });
});

describe('makeMultiAgentTab', () => {
  it('builds a multi-agent tab titled with the prompt and carrying the run', () => {
    const tab = makeMultiAgentTab('multi-agent', '#fff', 2, 1, '#fff', run, false);
    expect(tab).toMatchObject({ label: 'multi-agent', view: 'multiagent', title: run.prompt, multiagent: run });
    // The clones live in the manager, so the tab's own single workspace field stays empty.
    expect(tab.workspaceDir).toBeUndefined();
    expect(tab.offline).toBeUndefined();
  });

  it('marks the tab offline only when the issuing tab was', () => {
    expect(makeMultiAgentTab('multi-agent', '#fff', 2, 1, '#fff', run, true).offline).toBe(true);
  });
});

describe('addMultiAgentTab', () => {
  it('joins the creator group and focuses the new tab', () => {
    const tabs = [makeTab('janus', '#fff')];
    const result = addMultiAgentTab(tabs, 0, run, false);
    const added = result.tabs[result.activeTab];
    expect(added.label).toBe('multi-agent');
    expect(added.group).toBe(1);
    expect(added.groupColor).toBe('#fff');
    expect(added.dotColor).not.toBe('#fff');
    expect(added.title).toBe(run.prompt);
  });
});
