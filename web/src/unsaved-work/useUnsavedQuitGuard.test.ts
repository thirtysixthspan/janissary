import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from '../shared/tab/handles';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';

function makeTab(label: string): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    editor: { name: 'a.txt', path: '/a.txt', size: '1 B', url: '/open/1' },
  } as unknown as TabView;
}

// A plugin tab carries no `editor` view at all — it reaches these guards purely through the handle
// it registered, which is the whole point of dropping the editor-only filter.
function makePluginTab(label: string): TabView {
  return {
    ...makeTab(label), editor: undefined, view: 'plugin',
    plugin: { id: 'image', schemaVersion: 1, payload: {} },
  } as unknown as TabView;
}

function tabHandles(dirty: boolean): React.RefObject<Map<string, DirtyTabHandle>> {
  return { current: new Map([['a', { isDirty: () => dirty, save: async () => {}, focus: () => {} }]]) };
}

function walkRef(started: boolean | null): React.RefObject<(() => boolean) | null> {
  return { current: started === null ? null : vi.fn(() => started) };
}

describe('useUnsavedQuitGuard', () => {
  it('calls the raw openQuitConfirm straight through when nothing is dirty', () => {
    const openQuitConfirm = vi.fn();
    const quitWalkRef = walkRef(true);
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(false), openQuitConfirm, quitWalkRef));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(quitWalkRef.current).not.toHaveBeenCalled();
  });

  it('starts the quit walk instead of the raw confirm when an editor tab is dirty', () => {
    const openQuitConfirm = vi.fn();
    const quitWalkRef = walkRef(true);
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), openQuitConfirm, quitWalkRef));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(quitWalkRef.current).toHaveBeenCalledTimes(1);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  // `quit` and closing the last tab bypass the per-tab close guard entirely, so an image tab with an
  // unsaved crop has to be visible here or the feature ships a hole on the two easiest paths to miss.
  it('starts the quit walk for a dirty plugin tab rather than the plain quit dialog', () => {
    const openQuitConfirm = vi.fn();
    const quitWalkRef = walkRef(true);
    const { result } = renderHook(() => useUnsavedQuitGuard([makePluginTab('a')], tabHandles(true), openQuitConfirm, quitWalkRef));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(quitWalkRef.current).toHaveBeenCalledTimes(1);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('falls back to the raw confirm when the quit walk does not start', () => {
    const openQuitConfirm = vi.fn();
    const quitWalkRef = walkRef(false);
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), openQuitConfirm, quitWalkRef));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(quitWalkRef.current).toHaveBeenCalledTimes(1);
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
  });

  it('falls back to the raw confirm when no quit walk is mounted', () => {
    const openQuitConfirm = vi.fn();
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), openQuitConfirm, walkRef(null)));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
  });

  it('reads the quit walk at call time rather than during render', () => {
    const openQuitConfirm = vi.fn();
    const quitWalkRef = walkRef(null);
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), openQuitConfirm, quitWalkRef));
    const start = vi.fn(() => true);
    quitWalkRef.current = start;
    act(() => result.current.guardedOpenQuitConfirm());
    expect(start).toHaveBeenCalledTimes(1);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('arms a beforeunload guard that prevents the default only when a tab is dirty', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedQuitGuard([makeTab('a')], tabHandles(dirty), vi.fn(), walkRef(null)),
      { initialProps: { dirty: false } },
    );
    const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    globalThis.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    rerender({ dirty: true });
    const dirtyEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    globalThis.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it('arms beforeunload for a dirty plugin tab and leaves a clean one alone', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedQuitGuard([makePluginTab('a')], tabHandles(dirty), vi.fn(), walkRef(null)),
      { initialProps: { dirty: false } },
    );
    const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    globalThis.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    rerender({ dirty: true });
    const dirtyEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    globalThis.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
