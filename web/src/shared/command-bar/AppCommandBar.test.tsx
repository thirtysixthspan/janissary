import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode, RefObject } from 'react';
import type { TabView, DisabledApplicationCommand } from '@shared/protocol';
import { AppCommandBarProvider, AppCommandBarTabScope, useAppCommandBar, useAppCommandLine } from './AppCommandBar';
import { registerCommandLineInsertion, type AppCommandBarState } from './app-command-bar-scope';
import { disabledApplicationCommand } from '../command-availability';
import type { PickerCommands } from './picker-commands';

const tab = (label: string, overrides: Partial<TabView> = {}) => ({ label, ...overrides }) as TabView;

type Options = {
  tabs?: TabView[];
  activeTab?: number;
  guard?: (index: number) => boolean;
  openers?: Partial<PickerCommands>;
  onPickerOpen?: (sourceTab: string | undefined) => void;
  navOpen?: boolean;
  disabledApplicationCommand?: (line: string) => boolean;
};

const disabledBy = (rows: DisabledApplicationCommand[]) => (
  (line: string) => disabledApplicationCommand(line, rows) !== undefined
);

const disabledRow = (name: string, forms: readonly string[], aliases: readonly string[] = []): DisabledApplicationCommand => ({
  name, aliases, forms,
});

function build(options: Options = {}) {
  const openers = {
    openPicker: vi.fn(), openThemePicker: vi.fn(), openAppThemePicker: vi.fn(),
    openQueue: vi.fn(), openTaskPicker: vi.fn(), openProfilePicker: vi.fn(),
    ...options.openers,
  };
  const openQuitConfirm = vi.fn();
  const setNavOpen = vi.fn();
  const openTabNavWithQuery = vi.fn();
  const { result, rerender } = renderHook((current: Options) => useAppCommandLine({
    ...openers,
    navOpen: current.navOpen ?? false, setNavOpen, openTabNavWithQuery,
    tabs: current.tabs ?? [tab('shell1')],
    activeTab: current.activeTab ?? 0,
    openQuitConfirm,
    guardRef: { current: current.guard ?? null } as RefObject<((index: number) => boolean) | null>,
    onPickerOpen: current.onPickerOpen,
    disabledApplicationCommand: current.disabledApplicationCommand,
  }), { initialProps: options });
  return { intercept: result.current, result, openers, openQuitConfirm, setNavOpen, openTabNavWithQuery, rerender };
}

describe('useAppCommandLine', () => {
  it('confirms a quit instead of letting it through, and says it handled it', () => {
    const { intercept, openQuitConfirm } = build();

    expect(intercept('quit')).toBe(true);
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
  });

  it('confirms a close that would take the last tab with it', () => {
    const { intercept, openQuitConfirm } = build();

    expect(intercept('close')).toBe(true);
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
  });

  it('hands a close of one tab to the save guard, and runs the line when the guard declines', () => {
    const guard = vi.fn(() => false);
    const { intercept, openQuitConfirm } = build({ tabs: [tab('shell1'), tab('other')], guard });

    expect(intercept('close other')).toBe(false);
    expect(guard).toHaveBeenCalledWith(1);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  // The guard is the client's answer to "does this tab hold unsaved work", and it exists whether or
  // not the line was typed into a shell tab: `CloseSaveGuard` is mounted for every tab's view.
  it('lets the save guard keep a close that would discard unsaved work', () => {
    const { intercept, openQuitConfirm } = build({
      tabs: [tab('shell1'), tab('other')], guard: () => true,
    });

    expect(intercept('close other')).toBe(true);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('treats a missing guard as a decline rather than a refusal', () => {
    const { intercept } = build({ tabs: [tab('shell1'), tab('other')] });

    expect(intercept('close other')).toBe(false);
  });

  it('opens the picker a bare word names, in the same order the agent bar resolves them', () => {
    const { intercept, openers } = build();

    expect(intercept('theme')).toBe(true);
    expect(openers.openAppThemePicker).toHaveBeenCalledTimes(1);

    expect(intercept('hist')).toBe(true);
    expect(openers.openPicker).toHaveBeenCalledTimes(1);
    expect(intercept('profile launch')).toBe(true);
    expect(openers.openProfilePicker).toHaveBeenCalledTimes(1);
  });

  it('routes a bare close from a docked shell to that shell tab', () => {
    const guard = vi.fn(() => false);
    const { intercept, openQuitConfirm } = build({
      tabs: [tab('agent'), tab('shell-left', { dock: 'left' })], guard,
    });

    expect(intercept('close', 'shell-left')).toBe(false);
    expect(guard).toHaveBeenCalledWith(1);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('reports which plugin tab opened a bare-word picker', () => {
    const onPickerOpen = vi.fn();
    const { intercept } = build({ onPickerOpen });

    expect(intercept('theme', 'shell-left')).toBe(true);
    expect(onPickerOpen).toHaveBeenCalledWith('shell-left');
  });

  // The queue popup decides at open time whether it opens and what it selects, before the source is
  // recorded, so the opener itself is told which tab asked.
  it('tells the opener which plugin tab asked for it', () => {
    const { intercept, openers } = build({ tabs: [tab('agent'), tab('shell-left', { dock: 'left' })] });

    expect(intercept('queue', 'shell-left')).toBe(true);
    expect(openers.openQueue).toHaveBeenCalledWith('shell-left');
  });

  // A shell draining a queued tasks line behind another tab would otherwise open a picker nobody can
  // see that still takes the modal keys of the tab in front.
  it.each(['tasks', 'queue', 'theme', 'nav'])('opens nothing for %s from a tab that is not on screen', (line) => {
    const onPickerOpen = vi.fn();
    const { intercept, openers, openTabNavWithQuery } = build({ onPickerOpen });

    expect(intercept(line, 'shell1', false)).toBe(true);
    for (const opener of Object.values(openers)) expect(opener).not.toHaveBeenCalled();
    expect(openTabNavWithQuery).not.toHaveBeenCalled();
    expect(onPickerOpen).not.toHaveBeenCalled();
  });

  it('still confirms a quit typed in a tab that is not on screen', () => {
    const { intercept, openQuitConfirm } = build();

    expect(intercept('quit', 'shell1', false)).toBe(true);
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
  });

  it('opens the tab navigator on nav\'s query from any bar, and reports which tab opened it', () => {
    const onPickerOpen = vi.fn();
    const { intercept, openTabNavWithQuery, setNavOpen } = build({ onPickerOpen });

    expect(intercept('nav shell', 'shell1')).toBe(true);
    expect(openTabNavWithQuery).toHaveBeenCalledWith('shell');
    expect(onPickerOpen).toHaveBeenCalledWith('shell1');
    expect(setNavOpen).not.toHaveBeenCalled();
  });

  it('closes the tab navigator when nav is submitted while it is open', () => {
    const { intercept, openTabNavWithQuery, setNavOpen } = build({ navOpen: true });

    expect(intercept('nav')).toBe(true);
    expect(setNavOpen).toHaveBeenCalledWith(false);
    expect(openTabNavWithQuery).not.toHaveBeenCalled();
  });

  it('offers an ordinary line onward, and the `!` override with it', () => {
    const { intercept, openQuitConfirm, openers } = build();

    expect(intercept('ls -la')).toBe(false);
    expect(intercept('!quit')).toBe(false);
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(openers.openAppThemePicker).not.toHaveBeenCalled();
  });

  it.each([
    ['quit', ['quit']],
    ['theme', ['theme']],
    ['hist', ['hist']],
    ['queue', ['queue']],
    ['tasks', ['tasks']],
    ['syntax theme', ['syntax theme']],
    ['profile launch', ['profile launch']],
  ] as const)('returns false and opens nothing when %s is disabled', (line, _forms) => {
    const rows = [disabledRow(line, [line])];
    const { intercept, openers, openQuitConfirm } = build({ disabledApplicationCommand: disabledBy(rows) });

    expect(intercept(line)).toBe(false);
    for (const opener of Object.values(openers)) expect(opener).not.toHaveBeenCalled();
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('returns false for bare and named close when close is disabled', () => {
    const guard = vi.fn(() => true);
    const { intercept, openQuitConfirm } = build({
      tabs: [tab('shell1'), tab('other')], guard,
      disabledApplicationCommand: disabledBy([disabledRow('close', ['close'], ['exit'])]),
    });

    for (const line of ['close', 'exit', 'close other', '/close']) {
      expect(intercept(line), line).toBe(false);
    }
    expect(guard).not.toHaveBeenCalled();
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('leaves nav, clip, `!quit`, and an ordinary line ungated', () => {
    const rows = [
      disabledRow('quit', ['quit']), disabledRow('theme', ['theme']),
      disabledRow('hist', ['hist']), disabledRow('close', ['close']),
    ];
    const { intercept, openTabNavWithQuery, openQuitConfirm } = build({ disabledApplicationCommand: disabledBy(rows) });

    expect(intercept('nav')).toBe(true);
    expect(openTabNavWithQuery).toHaveBeenCalledWith('');
    expect(intercept('clip')).toBe(false);
    expect(intercept('!quit')).toBe(false);
    expect(intercept('ls -la')).toBe(false);
    expect(openQuitConfirm).not.toHaveBeenCalled();
  });

  it('applies a later row update to the next intercept', () => {
    const { intercept, rerender, result, openers } = build();

    expect(intercept('theme')).toBe(true);
    rerender({ disabledApplicationCommand: disabledBy([disabledRow('theme', ['theme'])]) });
    expect(result.current('theme')).toBe(false);
    expect(openers.openAppThemePicker).toHaveBeenCalledTimes(1);
  });
});

function scopedBar(state: AppCommandBarState, label?: string, active?: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppCommandBarProvider bar={state}>
      {label === undefined ? children : <AppCommandBarTabScope label={label} active={active}>{children}</AppCommandBarTabScope>}
    </AppCommandBarProvider>
  );
  return renderHook(() => useAppCommandBar(), { wrapper });
}

describe('useAppCommandBar', () => {
  it('throws outside a tab scope rather than answering for no tab', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => scopedBar({ intercept: () => false, ghostHistory: [] })).toThrow('no AppCommandBarTabScope');
    vi.restoreAllMocks();
  });

  it('answers for the tab its scope names, without the body naming one', () => {
    const intercept = vi.fn(() => true);
    const onFocusTab = vi.fn();
    const { result } = scopedBar({ intercept, ghostHistory: [], onFocusTab }, 'shell-left');

    expect(result.current.intercept('theme')).toBe(true);
    expect(intercept).toHaveBeenCalledWith('theme', 'shell-left', true);
    result.current.onFocusChange(true);
    expect(onFocusTab).toHaveBeenLastCalledWith('shell-left');
  });

  it('carries whether the scoped body is on screen into the interception', () => {
    const intercept = vi.fn(() => true);
    const { result } = scopedBar({ intercept, ghostHistory: [] }, 'shell-hidden', false);

    result.current.intercept('tasks');
    expect(intercept).toHaveBeenCalledWith('tasks', 'shell-hidden', false);
  });

  it('registers a picked-line insertion under the scoped tab and keeps one registration across renders', () => {
    const insertions = new Map<string, (text: string) => void>();
    const state: AppCommandBarState = {
      intercept: () => false,
      ghostHistory: [],
      registerCommandLineInsertion: (label, handler) => registerCommandLineInsertion(insertions, label, handler),
    };
    const { result, rerender } = scopedBar(state, 'shell1');
    const first = result.current.registerCommandLineInsertion;
    rerender();
    expect(result.current.registerCommandLineInsertion).toBe(first);

    const handler = vi.fn();
    const unregister = first(handler);
    insertions.get('shell1')?.('execute ./ai/tasks/build.md');
    expect(handler).toHaveBeenCalledWith('execute ./ai/tasks/build.md');
    unregister();
    expect(insertions.has('shell1')).toBe(false);
  });
});

describe('registerCommandLineInsertion', () => {
  it('leaves a newer handler for the same tab in place when an older one unregisters', () => {
    const insertions = new Map<string, (text: string) => void>();
    const older = vi.fn();
    const newer = vi.fn();
    const unregisterOlder = registerCommandLineInsertion(insertions, 'shell1', older);
    registerCommandLineInsertion(insertions, 'shell1', newer);

    unregisterOlder();

    expect(insertions.get('shell1')).toBe(newer);
  });
});
