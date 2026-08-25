import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { EditorTabHandle } from './EditorTab';
import { useUnsavedQuitGuard } from './useUnsavedQuitGuard';

function makeTab(label: string): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false, editor: { name: 'a.txt', path: '/a.txt', size: '1 B', url: '/open/1' },
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

function tabHandles(dirty: boolean): React.RefObject<Map<string, EditorTabHandle>> {
  return { current: new Map([['a', { isDirty: () => dirty, save: async () => {}, focus: () => {} }]]) };
}

describe('useUnsavedQuitGuard', () => {
  it('calls the raw openQuitConfirm straight through when nothing is dirty', () => {
    const openQuitConfirm = vi.fn();
    const { result } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(false), openQuitConfirm, vi.fn()));
    act(() => result.current.guardedOpenQuitConfirm());
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.unsavedQuitOpen).toBe(false);
  });

  it('opens the unsaved-quit dialog instead of the raw confirm when a tab is dirty', () => {
    const openQuitConfirm = vi.fn();
    const { result, rerender } = renderHook(
      ({ dirty }) => useUnsavedQuitGuard([makeTab('a')], tabHandles(dirty), openQuitConfirm, vi.fn()),
      { initialProps: { dirty: true } },
    );
    act(() => result.current.guardedOpenQuitConfirm());
    rerender({ dirty: true });
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(result.current.unsavedQuitOpen).toBe(true);
  });

  it('confirmUnsavedQuit closes the dialog and runs the quit command', () => {
    const runCommand = vi.fn();
    const { result, rerender } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), vi.fn(), runCommand));
    act(() => result.current.guardedOpenQuitConfirm());
    rerender();
    act(() => result.current.confirmUnsavedQuit());
    rerender();
    expect(runCommand).toHaveBeenCalledWith('quit');
    expect(result.current.unsavedQuitOpen).toBe(false);
  });

  it('cancelUnsavedQuit closes the dialog without running the quit command', () => {
    const runCommand = vi.fn();
    const { result, rerender } = renderHook(() => useUnsavedQuitGuard([makeTab('a')], tabHandles(true), vi.fn(), runCommand));
    act(() => result.current.guardedOpenQuitConfirm());
    rerender();
    act(() => result.current.cancelUnsavedQuit());
    rerender();
    expect(runCommand).not.toHaveBeenCalled();
    expect(result.current.unsavedQuitOpen).toBe(false);
  });

  it('arms a beforeunload guard that prevents the default only when a tab is dirty', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedQuitGuard([makeTab('a')], tabHandles(dirty), vi.fn(), vi.fn()),
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

  // `quit` and closing the last tab bypass the per-tab close guard entirely, so an image tab with an
  // unsaved crop has to be visible here or the feature ships a hole on the two easiest paths to miss.
  it('raises the unsaved prompt for a dirty plugin tab rather than the plain quit dialog', () => {
    const openQuitConfirm = vi.fn();
    const { result, rerender } = renderHook(
      () => useUnsavedQuitGuard([makePluginTab('a')], tabHandles(true), openQuitConfirm, vi.fn()),
    );
    act(() => result.current.guardedOpenQuitConfirm());
    rerender();
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(result.current.unsavedQuitOpen).toBe(true);
  });

  it('arms beforeunload for a dirty plugin tab and leaves a clean one alone', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedQuitGuard([makePluginTab('a')], tabHandles(dirty), vi.fn(), vi.fn()),
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
