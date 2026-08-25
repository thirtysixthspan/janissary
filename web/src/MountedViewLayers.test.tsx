import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './tab-handles';
import type { EditorTabHandle } from './editor/EditorTab';
import { MountedViewLayers } from './MountedViewLayers';

vi.mock('./HarnessTab', () => {
  const { forwardRef, useImperativeHandle, createElement } = React;
  return {
    HarnessTab: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return createElement('div', { 'data-testid': 'harness' });
    }),
  };
});

// EditorTab fetches file content asynchronously on mount; mocking it avoids act(...) warnings
// from state updates landing after these layout-focused tests have already asserted. The mount
// effect also increments a shared counter so tests can assert the component was (or wasn't)
// torn down and recreated across a re-render.
let editorMountCount = 0;
vi.mock('./editor/EditorTab', () => {
  const { forwardRef, useImperativeHandle, useEffect, createElement } = React;
  return {
    EditorTab: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({ isDirty: () => false, save: async () => {}, focus: () => {} }), []);
      useEffect(() => { editorMountCount += 1; }, []);
      return createElement('div', { 'data-testid': 'editor' });
    }),
  };
});

// The generic plugin layer owns persistence. This fake lazy registration lets the layout tests pin
// both deferred loading and stable mounting without importing the production video chunk.
let pluginLoadCount = 0;
let pluginMountCount = 0;
vi.mock('./plugins/registry', () => {
  const { lazy, useEffect, createElement } = React;
  const Component = lazy(async () => {
    pluginLoadCount += 1;
    const FixturePlugin = (
      { onMounted, capabilities }: { onMounted(): void; capabilities: { close(): void } },
    ) => {
      useEffect(() => { pluginMountCount += 1; }, []);
      useEffect(onMounted, [onMounted]);
      return createElement('button', {
        type: 'button', 'data-testid': 'plugin', onClick: () => capabilities.close(),
      });
    };
    return {
      default: FixturePlugin,
    };
  });
  return {
    clientPluginRegistry: new Map([['video', { schemaVersion: 1, Component }]]),
    clientPluginFailure: () => {},
    disableClientPlugin: () => true,
  };
});

function makeEditorTab(label: string, url: string): TabView {
  return {
    label, view: 'editor' as const, dotColor: '#0f0', groupColor: '#ccc',
    editor: { url, name: 'test.ts' },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makeHarnessTab(label: string, ptyId: string): TabView {
  return {
    label, view: 'harness' as const, dotColor: '#f00', groupColor: '#ccc',
    harness: { ptyId, name: 'shell' },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    activePty: undefined,
  } as unknown as TabView;
}

function makePluginTab(label: string, url: string): TabView {
  return {
    label, view: 'plugin' as const, dotColor: '#ff0', groupColor: '#ccc',
    plugin: {
      id: 'video', schemaVersion: 1,
      payload: { name: 'clip.mp4', path: '/a/clip.mp4', size: '1 MB', url, player: 'QuickTime Player' },
    },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makeHarnessHandles() {
  const ref = React.createRef<Map<string, HarnessTabHandle>>();
  (ref as { current: Map<string, HarnessTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, HarnessTabHandle>>;
}

function makeEditorHandles() {
  const ref = React.createRef<Map<string, EditorTabHandle>>();
  (ref as { current: Map<string, EditorTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, EditorTabHandle>>;
}

describe('MountedViewLayers', () => {
  it('renders editor tabs', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides editor tab when not current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const other = makeEditorTab('other', '/other.ts');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders editor tab as flex when current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('does not remount the editor tab when only its url/name/path change (rename)', () => {
    editorMountCount = 0;
    const tab = makeEditorTab('etab', '/open/1');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { rerender } = render(
      React.createElement(MountedViewLayers, {
        tabs: [tab], current: tab, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(editorMountCount).toBe(1);

    const renamed: TabView = {
      ...tab,
      editor: { ...tab.editor!, url: '/open/2', name: 'renamed.ts' },
    };
    rerender(
      React.createElement(MountedViewLayers, {
        tabs: [renamed], current: renamed, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(editorMountCount).toBe(1);
  });

  it('filters out tabs without editor payload', () => {
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'editor', dotColor: '#0f0', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders harness tabs', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides harness tab when not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders harness tab as flex when current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out tabs without harness payload', () => {
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'harness', dotColor: '#f00', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders the task picker inside the current harness tab when taskPickerOpen is true', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
        taskPickerOpen: true, taskRows: [], taskPickerIndex: 0, onPickTask: vi.fn(), onToggleTaskDir: vi.fn(),
      }),
    );
    expect(container.querySelector(':scope .tab-body .picker')).toBeTruthy();
  });

  it('does not render the task picker in a harness tab that is not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
        taskPickerOpen: true, taskRows: [], taskPickerIndex: 0, onPickTask: vi.fn(), onToggleTaskDir: vi.fn(),
      }),
    );
    expect(container.querySelector('.picker')).toBeNull();
  });

  it('does not render the task picker when taskPickerOpen is false', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.picker')).toBeNull();
  });

  it('renders the tab navigator inside the current harness tab when navOpen is true', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
        navOpen: true, navQuery: '', navIndex: 0, onPickTab: vi.fn(),
      }),
    );
    expect(container.querySelector(':scope .tab-body .tab-nav-picker')).toBeTruthy();
  });

  it('does not render the tab navigator in a harness tab that is not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
        navOpen: true, navQuery: '', navIndex: 0, onPickTab: vi.fn(),
      }),
    );
    expect(container.querySelector('.tab-nav-picker')).toBeNull();
  });

  it('does not render the tab navigator when navOpen is false', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-nav-picker')).toBeNull();
  });

  it('does not load a plugin chunk when no plugin tab exists', () => {
    pluginLoadCount = 0;
    const tabs = [makeEditorTab('etab', '/test.ts')];
    render(React.createElement(MountedViewLayers, {
      tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
      harnessHandles: makeHarnessHandles(), tabHandles: makeEditorHandles(),
    }));
    expect(pluginLoadCount).toBe(0);
  });

  it('renders plugin tabs through the lazy generic layer', async () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
    await waitFor(() => { expect(container.querySelector('[data-testid="plugin"]')).toBeTruthy(); });
  });

  // A docked plugin tab is rendered by the sidebar instead; rendering it here too would mount the
  // plugin twice and leave a stray body in the centre.
  it('leaves a docked plugin tab to the sidebar', () => {
    const docked = { ...makePluginTab('vtab', '/open/1'), dock: 'left' as const };
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [docked], current: docked, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles: makeHarnessHandles(), tabHandles: makeEditorHandles(),
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('hides a plugin tab when it is not visible', () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const other = makePluginTab('other', '/open/2');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('places a current plugin tab as a visible layer', () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('places a split plugin tab in the right grid column', () => {
    const tab = { ...makePluginTab('vtab', '/open/1'), pane: 'right' as const };
    const { container } = render(React.createElement(MountedViewLayers, {
      tabs: [tab], current: tab, client: { send: vi.fn() } as never, closeTab: vi.fn(),
      harnessHandles: makeHarnessHandles(), tabHandles: makeEditorHandles(),
    }));
    expect(container.querySelector<HTMLElement>('.tab-body')?.style.gridColumn).toBe('2');
  });

  it('filters out plugin views without an envelope', () => {
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'plugin', dotColor: '#ff0', groupColor: '#ccc' }] as unknown as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('keeps one plugin component mounted through focus changes', async () => {
    pluginMountCount = 0;
    const tab = makePluginTab('vtab', '/open/1');
    const other = makeEditorTab('etab', '/test.ts');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const props = (current: TabView) => ({
      tabs: [tab, other], current, client: { send: vi.fn() } as never, closeTab: vi.fn(),
      harnessHandles, tabHandles,
    });
    const { rerender } = render(React.createElement(MountedViewLayers, props(tab)));
    await waitFor(() => { expect(pluginMountCount).toBe(1); });

    rerender(React.createElement(MountedViewLayers, props(other)));
    rerender(React.createElement(MountedViewLayers, props(tab)));

    expect(pluginMountCount).toBe(1);
  });

  it('does not remount a plugin when only its payload changes', async () => {
    pluginMountCount = 0;
    const tab = makePluginTab('vtab', '/open/1');
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { rerender } = render(
      React.createElement(MountedViewLayers, {
        tabs: [tab], current: tab, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    await waitFor(() => { expect(pluginMountCount).toBe(1); });

    const refreshed: TabView = {
      ...tab,
      plugin: {
        ...tab.plugin!,
        payload: { ...(tab.plugin!.payload as Record<string, unknown>), url: '/open/2' },
      },
    };
    rerender(
      React.createElement(MountedViewLayers, {
        tabs: [refreshed], current: refreshed, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, tabHandles,
      }),
    );
    expect(pluginMountCount).toBe(1);
  });

  it('wires a plugin\'s close capability through with the tab\'s real index in the full tabs array', async () => {
    const closeTab = vi.fn();
    const tabs = [makeHarnessTab('htab', 'pty1'), makePluginTab('vtab', '/open/1')];
    const harnessHandles = makeHarnessHandles();
    const tabHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[1], client: { send: vi.fn() } as never, closeTab,
        harnessHandles, tabHandles,
      }),
    );
    await waitFor(() => { expect(container.querySelector('[data-testid="plugin"]')).toBeTruthy(); });
    fireEvent.click(container.querySelector('[data-testid="plugin"]') as Element);
    expect(closeTab).toHaveBeenCalledWith(1);
  });
});
