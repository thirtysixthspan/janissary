import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { FileNavigatorRestoreHint, TabView } from '@shared/protocol';
import type { JanusClient } from './shared/ws/ws';
import { sidebarSelectionFor } from './sidebar-selection-coordinator';
import { useSidebarSelection } from './useSidebarSelection';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'files', number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [],
    ...overrides,
  } as TabView;
}

function makeClient(): JanusClient {
  return { send: vi.fn() } as unknown as JanusClient;
}

function notificationsTab(dock: 'left' | 'right' = 'left'): TabView {
  return makeTab({ label: 'notifications', title: 'notifications', view: 'notifications', dock });
}

function filesTab(restore: FileNavigatorRestoreHint | undefined, overrides: Partial<TabView> = {}): TabView {
  const view = { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] };
  return makeTab({
    label: 'files', view: 'files', dock: 'left',
    files: restore ? { ...view, restore } : view,
    ...overrides,
  });
}

const focusHint = (revision: number): FileNavigatorRestoreHint => ({
  revision, focus: true, cursor: 'a', anchor: 'a', selected: ['a'],
});

const ordinaryHint = (revision: number): FileNavigatorRestoreHint => ({
  revision, cursor: 'a', anchor: 'a', selected: ['a'],
});

describe('useSidebarSelection reveal selection', () => {
  it('selects a docked navigator whose focus hint has an unacted revision', () => {
    const client = makeClient();
    const tabs = [notificationsTab(), filesTab(focusHint(1))];

    const { result } = renderHook(() => useSidebarSelection(tabs, 'left', undefined, client));

    expect(result.current.selectedLabel).toBe('files');
  });

  it('does not reselect after the user picks another entry at the same revision', () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ tabs }) => useSidebarSelection(tabs, 'left', undefined, client),
      { initialProps: { tabs: [notificationsTab(), filesTab(focusHint(1))] as TabView[] } },
    );
    expect(result.current.selectedLabel).toBe('files');

    act(() => result.current.setSelectedLabel('notifications'));
    rerender({ tabs: [notificationsTab(), filesTab(focusHint(1))] });

    expect(result.current.selectedLabel).toBe('notifications');
  });

  it('selects the navigator again when a later broadcast carries a new revision', () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ tabs }) => useSidebarSelection(tabs, 'left', undefined, client),
      { initialProps: { tabs: [notificationsTab(), filesTab(focusHint(1))] as TabView[] } },
    );
    act(() => result.current.setSelectedLabel('notifications'));

    rerender({ tabs: [notificationsTab(), filesTab(focusHint(2))] });

    expect(result.current.selectedLabel).toBe('files');
    expect(result.current.current?.tab.label).toBe('files');
  });

  it('ignores a focus hint on a files tab that is not docked', () => {
    const client = makeClient();
    const tabs = [notificationsTab(), filesTab(focusHint(1), { dock: undefined })];

    const { result } = renderHook(() => useSidebarSelection(tabs, 'left', undefined, client));

    expect(result.current.selectedLabel).toBe('notifications');
  });

  it('leaves the first docked entry selected for an ordinary hint or no restore at all', () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ tabs }) => useSidebarSelection(tabs, 'left', undefined, client),
      { initialProps: { tabs: [notificationsTab(), filesTab(ordinaryHint(1))] as TabView[] } },
    );
    expect(result.current.selectedLabel).toBe('notifications');

    rerender({ tabs: [notificationsTab(), filesTab(undefined)] });

    expect(result.current.selectedLabel).toBe('notifications');
  });

  it('ignores a focus hint docked to the other side', () => {
    const client = makeClient();
    const tabs = [filesTab(focusHint(1)), notificationsTab('right')];

    const { result } = renderHook(() => useSidebarSelection(tabs, 'right', undefined, client));

    expect(result.current.selectedLabel).toBe('notifications');
    expect(sidebarSelectionFor(client).isSelected('files')).toBe(false);
  });

  it('selects a reveal hint over a notifications entry docked in the same broadcast', () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ tabs }) => useSidebarSelection(tabs, 'left', undefined, client),
      { initialProps: { tabs: [filesTab(ordinaryHint(1))] as TabView[] } },
    );
    expect(result.current.selectedLabel).toBe('files');

    rerender({ tabs: [filesTab(focusHint(2)), notificationsTab()] });

    expect(result.current.selectedLabel).toBe('files');
    expect(result.current.current?.tab.label).toBe('files');
  });
});
