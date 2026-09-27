import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import { MountedViewLayers } from './MountedViewLayers';
import { createPluginHost, PluginHostProvider } from './plugins/host';
import type { DirtyTabHandle, HarnessTabHandle } from './shared/tab/handles';

// Two capabilities every mounted layer is handed but the layout tests never exercised: the split
// chord, which must carry the layer's own index rather than the tab's label, and the dirty handle a
// plugin tab registers so the tab strip can mark it. The mocks below surface each as something a
// test can press, which is the only way to observe a prop that no DOM reflects.

vi.mock('./harness/HarnessTab', () => {
  const { forwardRef, useImperativeHandle, createElement } = React;
  return {
    HarnessTab: forwardRef(({ onSplit }: { onSplit?: () => void }, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return createElement('button', { 'data-testid': 'harness', 'type': 'button', onClick: onSplit });
    }),
  };
});

vi.mock('./editor/EditorTab', () => {
  const { forwardRef, useImperativeHandle, createElement } = React;
  return {
    EditorTab: forwardRef(({ onSplit }: { onSplit?: () => void }, ref) => {
      useImperativeHandle(ref, () => ({ isDirty: () => false, save: async () => {}, focus: () => {} }), []);
      return createElement('button', { 'data-testid': 'editor', 'type': 'button', onClick: onSplit });
    }),
  };
});

// The plugin registers its dirty handle on mount and hands it back on unmount, which is the pair of
// calls that puts a handle in the map and takes it out again. It also renders the split action the
// host built for it, which is the only way the plugin path's split chord is reachable.
let dirtyHandle: { isDirty: () => boolean } | undefined;
vi.mock('./plugins/registry', () => {
  const { lazy, useEffect, createElement } = React;
  const Component = lazy(async () => ({
    default: function FixturePlugin({ onMounted, capabilities }: {
      onMounted(): void;
      capabilities: {
        close(): void; registerDirtyHandle(handle: unknown): void; splitAction: React.ReactNode;
      };
    }) {
      useEffect(() => {
        onMounted();
        capabilities.registerDirtyHandle(dirtyHandle);
        return () => { capabilities.registerDirtyHandle(null); };
      }, [capabilities, onMounted]);
      return createElement('div', { 'data-testid': 'plugin' }, capabilities.splitAction);
    },
  }));
  return { clientPluginRegistry: new Map([['video', { schemaVersion: 1, Component }]]) };
});

const pluginHost = createPluginHost();

function mount(props: Partial<React.ComponentProps<typeof MountedViewLayers>>) {
  return render(
    <PluginHostProvider host={pluginHost}>
      <MountedViewLayers
        tabs={[]} current={{ label: 'janus' } as TabView}
        client={{ send: vi.fn() } as never} closeTab={vi.fn()}
        harnessHandles={handles<HarnessTabHandle>()} tabHandles={handles<DirtyTabHandle>()}
        {...props}
      />
    </PluginHostProvider>,
  );
}

function handles<T>() {
  const ref = React.createRef<Map<string, T>>();
  (ref as { current: Map<string, T> | null }).current = new Map();
  return ref as React.RefObject<Map<string, T>>;
}

function tab(overrides: Record<string, unknown>): TabView {
  return {
    connections: [], schedule: [], bufferLines: [], cmdHistory: [], dotColor: '#fff', groupColor: '#ccc',
    ...overrides,
  } as unknown as TabView;
}

const harness = (label: string, ptyId: string) => tab({ label, view: 'harness', harness: { ptyId, name: 'shell' } });
const editor = (label: string) => tab({ label, view: 'editor', editor: { url: '/a.ts', name: 'a.ts' } });
const plugin = (label: string) => tab({
  label, view: 'plugin',
  plugin: { id: 'video', schemaVersion: 1, payload: { name: 'c.mp4', path: '/c.mp4', size: '1 MB', url: '/open/1' } },
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// The plugin layer resolves lazily, so its split chord only exists after the chunk lands.
async function pressSplit(container: HTMLElement, testid: string, index = 0): Promise<void> {
  const layer = await waitFor(() => {
    const found = container.querySelectorAll(`[data-testid="${CSS.escape(testid)}"]`)[index];
    expect(found).toBeTruthy();
    return found as HTMLElement;
  });
  const button = layer.tagName === 'BUTTON' ? layer : layer.querySelector('button');
  expect(button).toBeTruthy();
  fireEvent.click(button!);
}

describe('the split chord every mounted layer is handed', () => {
  it.each([
    ['harness', harness('shell', 'pty-1')],
    ['editor', editor('a.ts')],
    ['plugin', plugin('vtab')],
  ] as const)('splits the %s tab at its own index, not at zero', async (kind, subject) => {
    const onSplit = vi.fn();
    const { container } = mount({ tabs: [subject], current: subject, onSplit });

    await pressSplit(container, kind);

    expect(onSplit).toHaveBeenCalledWith(0);
  });

  it('splits the second tab at index one', async () => {
    const onSplit = vi.fn();
    const second = plugin('second');
    const { container } = mount({ tabs: [plugin('first'), second], current: second, onSplit });

    await pressSplit(container, 'plugin', 1);

    expect(onSplit).toHaveBeenCalledWith(1);
  });

  it('offers no split at all when the caller passes no handler', async () => {
    const subject = plugin('vtab');
    const { container } = mount({ tabs: [subject], current: subject });

    // The layer is still mounted and still pressable; nothing is wired behind it.
    await waitFor(() => expect(container.querySelector('[data-testid="plugin"]')).toBeTruthy());
    expect(container.querySelector(':scope [data-testid="plugin"] button')).toBeNull();
  });
});

describe('the dirty handle a plugin tab registers', () => {
  it('puts the handle in the map and tells the strip the tab is dirty', async () => {
    dirtyHandle = { isDirty: () => true };
    const onPluginDirty = vi.fn();
    const tabHandles = handles<DirtyTabHandle>();
    const subject = plugin('vtab');

    mount({ tabs: [subject], current: subject, tabHandles, onPluginDirty });

    await waitFor(() => {
      expect(onPluginDirty).toHaveBeenCalledWith('vtab', true);
    });
    expect(tabHandles.current?.get('vtab')?.isDirty()).toBe(true);
  });

  it('reports a handle that says it is clean as not dirty', async () => {
    dirtyHandle = { isDirty: () => false };
    const onPluginDirty = vi.fn();
    const subject = plugin('vtab');

    mount({ tabs: [subject], current: subject, onPluginDirty });

    await waitFor(() => {
      expect(onPluginDirty).toHaveBeenCalledWith('vtab', false);
    });
  });

  it('reports not dirty when there is no handle at all, and stays quiet if nobody listens', async () => {
    dirtyHandle = undefined;
    const subject = plugin('vtab');

    const { getByTestId } = mount({ tabs: [subject], current: subject });

    await waitFor(() => expect(getByTestId('plugin')).toBeTruthy());
    expect(() => { dirtyHandle = { isDirty: () => true }; }).not.toThrow();
  });
});
