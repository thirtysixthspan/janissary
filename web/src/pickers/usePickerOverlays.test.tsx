import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React, { createRef } from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { usePickerOverlays } from './usePickerOverlays';
import { buildOverlayOpenState, firstOpenOverlay } from './overlay-registry';

function fakeClient(): JanusClient {
  return { send: vi.fn(), request: vi.fn(async () => ({ root: '/w', paths: [] })) } as unknown as JanusClient;
}

function agentTab(): TabView {
  return {
    label: 'agent1', cwd: '/w', bufferLines: [],
    cmdHistory: ['first', 'second', 'third'], commandQueue: ['queued one', 'queued two'],
  } as unknown as TabView;
}

type Hook = ReturnType<typeof usePickerOverlays>;

function TestComponent({ client, current, onHook }: {
  client: JanusClient; current: TabView | undefined; onHook: (hook: Hook) => void;
}) {
  const hook = usePickerOverlays({
    client, current, tabs: current ? [current] : [], syntaxTheme: 'monokai',
    tasks: [], profiles: [],
    runCommand: () => {},
    inputRef: createRef(), recallRef: createRef(), dropRef: createRef(), focusHarness: () => {},
    pluginCommandLineInsertions: { current: new Map() },
  });
  onHook(hook);
  return null;
}

// `current` is explicit at every call site: passing `undefined` for it is a case of its own (the
// app before its first state event), which a default parameter would silently replace.
function mount(current: TabView | undefined, client: JanusClient = fakeClient()) {
  let hook: Hook | undefined;
  render(<TestComponent client={client} current={current} onHook={(h) => { hook = h; }} />);
  return () => hook!;
}

describe('usePickerOverlays', () => {
  it('reports every overlay closed until one is opened', () => {
    expect(firstOpenOverlay(mount(agentTab())().overlays)).toBeUndefined();
  });

  // The point of the change: one owner means the render bag and the key-handler bag cannot report
  // different things about the same picker. Each case opens a picker through the command bar's own
  // opener and checks both projections agree with the registry.
  it.each([
    ['history', 'openPicker'],
    ['syntaxTheme', 'openThemePicker'],
    ['appTheme', 'openAppThemePicker'],
    ['queue', 'openQueue'],
    ['task', 'openTaskPicker'],
    ['profile', 'openProfilePicker'],
  ] as const)('opening the %s overlay shows up in the view and the key snapshot alike', (name, opener) => {
    const hook = mount(agentTab());
    act(() => hook().commands[opener]());
    expect(firstOpenOverlay(hook().overlays)).toBe(name);
    expect(hook().view.overlays).toBe(hook().overlays);
    // The key snapshot carries the nine flags rather than the built object, and `dispatchModalKey`
    // rebuilds the registry state from them — so it must arrive at the same overlay.
    expect(firstOpenOverlay(buildOverlayOpenState(hook().keys))).toBe(name);
  });

  it('keeps the two projections on the same index for the picker that moved', () => {
    const hook = mount(agentTab());
    act(() => hook().commands.openPicker());
    // `openPicker` highlights the most recent entry, so the index is non-zero and a projection
    // reading the wrong picker's index would disagree.
    expect(hook().view.pickerIndex).toBe(2);
    expect(hook().keys.pickerIdx).toBe(2);
  });

  it('routes the server-driven chooser into the overlays, the view, and the snapshot', () => {
    const view: RouteChooserView = { cmd: 'run', choices: ['shell', 'acp'] };
    const hook = mount(agentTab());
    act(() => hook().serverState.setRoute(view));
    expect(firstOpenOverlay(hook().overlays)).toBe('route');
    expect(hook().route).toBe(view);
    expect(hook().view.route).toBe(view);
    expect(hook().keys.route).toBe(view);
  });

  it('derives the history and queue rows from the active tab', () => {
    const hook = mount(agentTab());
    expect(hook().view.recent).toEqual(['first', 'second', 'third']);
    expect(hook().view.queueItems).toEqual(['queued one', 'queued two']);
    expect(hook().keys.recent).toBe(hook().view.recent);
    expect(hook().keys.queueItems).toBe(hook().view.queueItems);
  });

  it('survives having no active tab, which is how the app renders before its first state event', () => {
    const hook = mount(undefined);
    expect(hook().view.recent).toEqual([]);
    expect(hook().view.queueItems).toEqual([]);
    expect(firstOpenOverlay(hook().overlays)).toBeUndefined();
  });

  it('sends the queue edits for the row the queue picker has selected', () => {
    const client = fakeClient();
    const hook = mount(agentTab(), client);
    act(() => hook().onDeleteQueued());
    expect(client.send).toHaveBeenCalledWith({ method: 'deleteQueuedCommand', params: { index: 0, tab: 'agent1' } });
    act(() => hook().onEditQueued('edited'));
    expect(client.send).toHaveBeenCalledWith({
      method: 'editQueuedCommand', params: { index: 0, text: 'edited', tab: 'agent1' },
    });
  });
});

function dockedShell(): TabView {
  return {
    label: 'shell1', cwd: '/w', bufferLines: [], cmdHistory: [], commandQueue: ['make test'],
    view: 'plugin', dock: 'left', plugin: { id: 'shell', hostsCommandBar: true },
  } as unknown as TabView;
}

// The app records a plugin bar's tab as the picker's source after the opener runs; these mount the
// hook with that source already recorded, the way the app renders once it has.
function mountWithSource(sourceTab: string | undefined) {
  const client = fakeClient();
  const insertIntoShell = vi.fn();
  const insertIntoAgent = vi.fn();
  const dropRef = { current: { insertAtCaret: insertIntoAgent, setDropHighlighted: vi.fn() } };
  let hook: Hook | undefined;
  function Source() {
    hook = usePickerOverlays({
      client, current: agentTab(), sourceTab, tabs: [agentTab(), dockedShell()], syntaxTheme: 'monokai',
      tasks: [{ path: 'fix.md', name: 'fix', depth: 0, dir: false, source: 'project' }], profiles: [],
      runCommand: () => {},
      inputRef: createRef(), recallRef: createRef(), dropRef, focusHarness: () => {},
      pluginCommandLineInsertions: { current: new Map([['shell1', insertIntoShell]]) },
    });
    return null;
  }
  render(<Source />);
  return { hook: () => hook!, client, insertIntoShell, insertIntoAgent };
}

describe('usePickerOverlays with a picker raised from a docked shell', () => {
  it('lists and edits the shell\'s queue while an agent is the current tab', () => {
    const { hook, client } = mountWithSource('shell1');
    expect(hook().view.queueItems).toEqual(['make test']);
    act(() => hook().onEditQueued('make lint'));
    expect(client.send).toHaveBeenCalledWith({
      method: 'editQueuedCommand', params: { index: 0, text: 'make lint', tab: 'shell1' },
    });
  });

  it('inserts a picked task into the shell\'s bar rather than the agent\'s', () => {
    const { hook, insertIntoShell, insertIntoAgent } = mountWithSource('shell1');
    act(() => hook().commands.openTaskPicker('shell1'));
    act(() => hook().keys.pickTask('fix.md'));
    expect(insertIntoShell).toHaveBeenCalledWith('execute ./ai/tasks/fix.md');
    expect(insertIntoAgent).not.toHaveBeenCalled();
  });

  it('acts on the current tab when no source is recorded, or the source is no longer open', () => {
    for (const source of [undefined, 'gone']) {
      const { hook, insertIntoShell, insertIntoAgent } = mountWithSource(source);
      expect(hook().view.queueItems).toEqual(['queued one', 'queued two']);
      act(() => hook().keys.pickTask('fix.md'));
      expect(insertIntoAgent).toHaveBeenCalledWith('execute ./ai/tasks/fix.md');
      expect(insertIntoShell).not.toHaveBeenCalled();
    }
  });
});
