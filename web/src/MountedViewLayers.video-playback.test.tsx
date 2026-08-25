import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { EditorTabHandle } from './EditorTab';
import { MountedViewLayers } from './MountedViewLayers';

// Deliberately kept out of `MountedViewLayers.test.tsx`, which installs a fixture registration:
// these assertions load the real video plugin and pin its DOM node across focus changes.

function makeVideoTab(label: string): TabView {
  return {
    label, view: 'plugin' as const, dotColor: '#ff0', groupColor: '#ccc',
    plugin: {
      id: 'video', schemaVersion: 1,
      payload: { name: 'clip.mp4', path: '/a/clip.mp4', size: '1 MB', url: '/open/1', player: 'QuickTime Player' },
    },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makeAgentTab(label: string): TabView {
  return {
    label, dotColor: '#0ff', groupColor: '#ccc',
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makeHandles() {
  const harness = React.createRef<Map<string, HarnessTabHandle>>();
  (harness as { current: Map<string, HarnessTabHandle> | null }).current = new Map();
  const editor = React.createRef<Map<string, EditorTabHandle>>();
  (editor as { current: Map<string, EditorTabHandle> | null }).current = new Map();
  return {
    harnessHandles: harness as React.RefObject<Map<string, HarnessTabHandle>>,
    tabHandles: editor as React.RefObject<Map<string, EditorTabHandle>>,
  };
}

let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  pauseSpy.mockRestore();
});

describe('video playback while the tab is not focused', () => {
  const video = makeVideoTab('vtab');
  const agent = makeAgentTab('janus');
  const props = (current: TabView) => ({
    tabs: [video, agent], current,
    client: { send: vi.fn(), request: vi.fn() } as never, closeTab: vi.fn(),
    ...makeHandles(),
  });

  it('keeps the very same video element in the document when its tab loses focus', async () => {
    const { container, rerender } = render(React.createElement(MountedViewLayers, props(video)));
    await waitFor(() => { expect(container.querySelector('video')).toBeTruthy(); });
    const element = container.querySelector('video');

    rerender(React.createElement(MountedViewLayers, props(agent)));

    expect(container.querySelector('video')).toBe(element);
    expect(element!.isConnected).toBe(true);
  });

  it('hides the unfocused video tab without tearing the element down, and restores it on return', async () => {
    const { container, rerender } = render(React.createElement(MountedViewLayers, props(video)));
    await waitFor(() => { expect(container.querySelector('video')).toBeTruthy(); });
    const element = container.querySelector('video');
    const body = () => container.querySelector<HTMLElement>('.tab-body');
    expect(body()!.style.display).toBe('flex');

    rerender(React.createElement(MountedViewLayers, props(agent)));
    expect(body()!.style.display).toBe('none');

    rerender(React.createElement(MountedViewLayers, props(video)));
    expect(body()!.style.display).toBe('flex');
    expect(container.querySelector('video')).toBe(element);
  });

  it('never pauses the element when its tab loses focus', async () => {
    const { container, rerender } = render(React.createElement(MountedViewLayers, props(video)));
    await waitFor(() => { expect(container.querySelector('video')).toBeTruthy(); });

    rerender(React.createElement(MountedViewLayers, props(agent)));
    rerender(React.createElement(MountedViewLayers, props(video)));

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('does not reload the media when the tab loses focus, so playback position is not reset', async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { rerender } = render(React.createElement(MountedViewLayers, props(video)));
    await waitFor(() => { expect(document.querySelector('video')).toBeTruthy(); });
    loadSpy.mockClear();

    rerender(React.createElement(MountedViewLayers, props(agent)));

    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockRestore();
  });
});
