import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { EditorTabHandle } from './EditorTab';
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
vi.mock('./EditorTab', () => {
  const { forwardRef, useImperativeHandle, useEffect, createElement } = React;
  return {
    EditorTab: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({ isDirty: () => false, save: async () => {}, focus: () => {} }), []);
      useEffect(() => { editorMountCount += 1; }, []);
      return createElement('div', { 'data-testid': 'editor' });
    }),
  };
});

// Plugin tabs are mounted persistently so state survives tab switches; the mount effect increments
// a shared counter so tests can assert the generic host never tears down and recreates the view.
let pluginMountCount = 0;
vi.mock('../../src/plugins/client/PluginTabLayer', () => {
  const { useEffect, createElement } = React;
  return {
    PluginTabLayer: () => {
      useEffect(() => { pluginMountCount += 1; }, []);
      return createElement('div', { 'data-testid': 'plugin' });
    },
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

function makePageTab(label: string, url: string): TabView {
  return {
    label, view: 'page' as const, dotColor: '#00f', groupColor: '#ccc',
    page: { url, domain: 'example.com', number: 1 },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makePluginTab(label: string, url: string): TabView {
  return {
    label, view: 'plugin' as const, dotColor: '#ff0', groupColor: '#ccc',
    plugin: {
      pluginId: 'video', schemaVersion: 1,
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
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides editor tab when not current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const other = makeEditorTab('other', '/other.ts');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders editor tab as flex when current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('does not remount the editor tab when only its url/name/path change (rename)', () => {
    editorMountCount = 0;
    const tab = makeEditorTab('etab', '/open/1');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { rerender } = render(
      React.createElement(MountedViewLayers, {
        tabs: [tab], current: tab, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
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
        harnessHandles, editorHandles,
      }),
    );
    expect(editorMountCount).toBe(1);
  });

  it('filters out tabs without editor payload', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'editor', dotColor: '#0f0', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders harness tabs', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides harness tab when not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders harness tab as flex when current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out tabs without harness payload', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'harness', dotColor: '#f00', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders the task picker inside the current harness tab when taskPickerOpen is true', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
        taskPickerOpen: true, taskRows: [], taskPickerIndex: 0, onPickTask: vi.fn(), onToggleTaskDir: vi.fn(),
      }),
    );
    expect(container.querySelector(':scope .tab-body .picker')).toBeTruthy();
  });

  it('does not render the task picker in a harness tab that is not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
        taskPickerOpen: true, taskRows: [], taskPickerIndex: 0, onPickTask: vi.fn(), onToggleTaskDir: vi.fn(),
      }),
    );
    expect(container.querySelector('.picker')).toBeNull();
  });

  it('does not render the task picker when taskPickerOpen is false', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.picker')).toBeNull();
  });

  it('renders the tab navigator inside the current harness tab when navOpen is true', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
        navOpen: true, navQuery: '', navIndex: 0, onPickTab: vi.fn(),
      }),
    );
    expect(container.querySelector(':scope .tab-body .tab-nav-picker')).toBeTruthy();
  });

  it('does not render the tab navigator in a harness tab that is not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
        navOpen: true, navQuery: '', navIndex: 0, onPickTab: vi.fn(),
      }),
    );
    expect(container.querySelector('.tab-nav-picker')).toBeNull();
  });

  it('does not render the tab navigator when navOpen is false', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-nav-picker')).toBeNull();
  });

  it('renders page tabs', () => {
    const tabs = [makePageTab('ptab', 'https://example.com')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides page tab when not current', () => {
    const tabs = [makePageTab('ptab', 'https://example.com')];
    const other = makePageTab('other', 'https://other.example.com');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders page tab as flex when current', () => {
    const tabs = [makePageTab('ptab', 'https://example.com')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out tabs without page payload', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'page', dotColor: '#00f', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders plugin tabs', () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides plugin tabs when they are not current', () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const other = makePluginTab('other', '/open/2');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders a current plugin tab as flex', () => {
    const tabs = [makePluginTab('vtab', '/open/1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out plugin tabs without an envelope', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'plugin', dotColor: '#ff0', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('keeps a plugin tab mounted while it is not current, so plugin state survives', () => {
    pluginMountCount = 0;
    const tab = makePluginTab('vtab', '/open/1');
    const other = makeEditorTab('etab', '/test.ts');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const props = (current: TabView) => ({
      tabs: [tab, other], current, client: { send: vi.fn() } as never, closeTab: vi.fn(),
      harnessHandles, editorHandles,
    });
    const { rerender } = render(React.createElement(MountedViewLayers, props(tab)));
    expect(pluginMountCount).toBe(1);

    rerender(React.createElement(MountedViewLayers, props(other)));
    rerender(React.createElement(MountedViewLayers, props(tab)));

    expect(pluginMountCount).toBe(1);
  });

  it('does not remount a plugin tab when only its payload changes', () => {
    pluginMountCount = 0;
    const tab = makePluginTab('vtab', '/open/1');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { rerender } = render(
      React.createElement(MountedViewLayers, {
        tabs: [tab], current: tab, client: { send: vi.fn() } as never, closeTab: vi.fn(),
        harnessHandles, editorHandles,
      }),
    );
    expect(pluginMountCount).toBe(1);

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
        harnessHandles, editorHandles,
      }),
    );
    expect(pluginMountCount).toBe(1);
  });

  it('places a plugin tab in the right split pane', () => {
    const tab = { ...makePluginTab('vtab', '/open/1'), pane: 'right' as const };
    const { container } = render(React.createElement(MountedViewLayers, {
      tabs: [tab], current: tab, visibleLabels: [tab.label], client: { send: vi.fn() } as never,
      closeTab: vi.fn(), harnessHandles: makeHarnessHandles(), editorHandles: makeEditorHandles(),
    }));

    expect(container.querySelector<HTMLElement>('.tab-body')?.style.gridColumn).toBe('2');
  });

  it('wires closeTab through with the tab\'s real index in the full tabs array', () => {
    const closeTab = vi.fn();
    const tabs = [makeHarnessTab('htab', 'pty1'), makePageTab('ptab', 'https://example.com')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[1], client: { send: vi.fn() } as never, closeTab,
        harnessHandles, editorHandles,
      }),
    );
    fireEvent.click(container.querySelector('.page-close') as Element);
    expect(closeTab).toHaveBeenCalledWith(1);
  });
});
