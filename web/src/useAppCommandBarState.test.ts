import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TabView } from '@shared/protocol';
import { useAppCommandBarState } from './useAppCommandBarState';
import { buildOverlayOpenState } from './pickers/overlay-registry';
import type { PickerOverlayView } from './pickers/picker/overlay-view';

const tab = (label: string, commandQueue: string[]) => ({ label, commandQueue }) as unknown as TabView;

function view(queueOpen: boolean): PickerOverlayView {
  const overlays = buildOverlayOpenState({
    route: null, themePickerOpen: false, appThemePickerOpen: false, quickOpenOpen: false, navOpen: false,
    pickerOpen: false, queueOpen, taskPickerOpen: false, profilePickerOpen: false,
  });
  return { overlays, queueIndex: 1, queueItems: ['first', 'second'] } as unknown as PickerOverlayView;
}

function build(queueTab: string | undefined) {
  const insertions = { current: new Map<string, (text: string) => void>() };
  const pickers = { view: view(true), onEditQueued: vi.fn(), onDeleteQueued: vi.fn() };
  const { result } = renderHook(() => useAppCommandBarState({
    intercept: () => false,
    ghostHistory: [],
    pickers,
    queueTab,
    tabs: [tab('agent', ['first', 'second']), tab('shell1', ['!ls'])],
    onFocusTab: vi.fn(),
    insertions,
  }));
  return { state: result.current, insertions, pickers };
}

describe('useAppCommandBarState', () => {
  it('names the tab the queue popup belongs to beside the popup state', () => {
    const { state, pickers } = build('shell1');

    expect(state.queueTab).toBe('shell1');
    expect(state.queueOpen).toBe(true);
    expect(state.queueIndex).toBe(1);
    expect(state.queueItems).toEqual(['first', 'second']);
    expect(state.onEditQueued).toBe(pickers.onEditQueued);
  });

  it('reads each tab\'s own command queue from the tabs it was given', () => {
    const { state } = build('agent');

    expect(state.queuedLinesOf?.('shell1')).toEqual(['!ls']);
    expect(state.queuedLinesOf?.('agent')).toEqual(['first', 'second']);
    expect(state.queuedLinesOf?.('missing')).toBeUndefined();
  });

  it('registers an insertion where the task picker looks it up', () => {
    const { state, insertions } = build('agent');
    const handler = vi.fn();

    const unregister = state.registerCommandLineInsertion?.('shell1', handler);
    expect(insertions.current.get('shell1')).toBe(handler);
    unregister?.();
    expect(insertions.current.has('shell1')).toBe(false);
  });
});
