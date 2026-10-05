import { describe, it, expect } from 'vitest';
import { makeEditorTab, makePluginTab, makeTab } from './index.js';
import { addEditorTab, addPluginTab } from './creators.js';
import { uniqueEditorLabel, uniquePluginLabel } from './unique-labels.js';
import type { EditorView, PluginTabRecord } from './types.js';
import { agentNames } from '../agent/names.js';
import type { LaunchNameRow } from '../launch-name/check.js';

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

describe('addPluginTab with agent names', () => {
  const shell: PluginTabRecord = {
    id: 'shell', instanceKey: 'shell-1', schemaVersion: 2, payload: {}, fileRefs: [], sourceLabel: 'janus',
  };

  it('labels and titles the tab with a pool name no open tab holds', () => {
    const tabs = [makeTab('janus', '#fff'), makeTab(agentNames[0].toUpperCase(), '#123')];
    const added = addPluginTab(tabs, 0, 'shell', 'shell', shell, true);
    const tab = added.tabs[added.activeTab];

    expect(agentNames).toContain(tab.label);
    expect(tab.label.toLowerCase()).not.toBe(agentNames[0].toLowerCase());
    expect(tab.title).toBe(tab.label);
  });

  it('falls back to the prefix label and the plugin title once every pool name is held', () => {
    const tabs = [makeTab('janus', '#fff'), ...agentNames.map((name) => makeTab(name, '#123'))];
    const added = addPluginTab(tabs, 0, 'shell', 'shell', shell, true);
    const tab = added.tabs[added.activeTab];

    expect(tab.label).toBe('shell');
    expect(tab.title).toBe('shell');
  });

  const row = (label: string, state: LaunchNameRow['state']): LaunchNameRow => (
    { label, kind: 'agent', state, host: 'box' }
  );
  const allButFirstTwoHeld = () => [makeTab('janus', '#fff'), ...agentNames.slice(2).map((name) => makeTab(name, '#123'))];

  it('passes over a pool name a detached session row holds, as an unnamed agent does', () => {
    const rows = [row(agentNames[0].toUpperCase(), 'detached')];
    const added = addPluginTab(allButFirstTwoHeld(), 0, 'shell', 'shell', shell, true, rows);

    expect(added.tabs[added.activeTab].label).toBe(agentNames[1]);
  });

  it('takes a pool name whose session row has terminated', () => {
    const rows = [row(agentNames[0], 'terminated'), row(agentNames[1], 'active')];
    const added = addPluginTab(allButFirstTwoHeld(), 0, 'shell', 'shell', shell, true, rows);

    expect(added.tabs[added.activeTab].label).toBe(agentNames[0]);
  });

  it('falls back to the prefix label once session rows hold every free pool name', () => {
    const rows = [row(agentNames[0], 'provisioning'), row(agentNames[1], 'reconnecting')];
    const added = addPluginTab(allButFirstTwoHeld(), 0, 'shell', 'shell', shell, true, rows);

    expect(added.tabs[added.activeTab].label).toBe('shell');
  });

  it('keeps the prefix label for a plugin that does not ask for agent names', () => {
    const added = addPluginTab([makeTab('janus', '#fff')], 0, 'shell', 'shell', shell);

    expect(added.tabs[added.activeTab].label).toBe('shell');
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
