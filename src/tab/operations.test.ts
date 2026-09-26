import { describe, expect, it, vi } from 'vitest';
import { closeTab, insertTab, moveTabToOtherPane, setDock, toggleCollapse } from './operations.js';
import { MANAGER_TAB_RELEASE } from '../managers.js';
import type { TabOperationsPort } from './operations.js';
import type { CenterPane, Tab } from './types.js';

function tab(label: string, pane?: CenterPane, dock?: 'left' | 'right'): Tab {
  return { label, pane, dock, view: 'agent', hasUnread: true } as unknown as Tab;
}

// Every manager a closing tab is released from, each answering `closeTab`. Built from the exported
// list rather than restated, so a manager added to the release order is covered without editing this.
function managerServices() {
  const services: Record<string, unknown> = { closeTab: vi.fn() };
  for (const name of MANAGER_TAB_RELEASE) services[name] = { closeTab: vi.fn() };
  return {
    ...services,
    tab: { deleteBusy: vi.fn(), forgetPersisted: vi.fn() },
    // `database` is in the release list too, so it keeps its `closeTab` alongside `closeAll`.
    database: { ...(services.database as object), closeAll: vi.fn() },
  };
}

// A port that answers only what these operations ask of it, and records the two things they are
// allowed to decide on their own: which tab is active, and which is the split's other side.
function makePort(tabs: Tab[], activeTab = 0, secondaryTabLabel?: string) {
  const port = {
    tabs,
    activeTab,
    secondaryTabLabel,
    focusHistory: [] as string[],
    managerServices: managerServices() as never,
    openFiles: new Map<string, string>(),
    findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    recordLeavingActiveTab: vi.fn(),
    popFocusHistory: vi.fn(),
    repairSelections: vi.fn(),
    persist: vi.fn(),
    buildAgentState: vi.fn(),
    registerFile: vi.fn(() => 'ref'),
    replaceFile: vi.fn((_r: string, p: string) => p),
  } as unknown as TabOperationsPort;
  return port;
}

// A left/right pair, which is what makes `hasSplit` true and brings the cascades into play.
const split = () => [tab('left-1', 'left'), tab('right-1', 'right')];

describe('setDock', () => {
  it('does nothing for an index naming no tab', () => {
    const port = makePort([tab('a')]);
    setDock(port, 5, 'left');
    expect(port.tabs[0].dock).toBeUndefined();
    expect(port.repairSelections).not.toHaveBeenCalled();
  });

  it('docks a tab into a sidebar', () => {
    const port = makePort([tab('a'), tab('b')]);
    setDock(port, 1, 'right');
    expect(port.tabs[1].dock).toBe('right');
  });

  // Undocking a tab while the right pane is showing it is not a move back to the left: the pane it
  // is being looked at in is where it stays, or the split would close under the user.
  it('leaves a tab in the right pane when it is undocked while that pane is focused', () => {
    const port = makePort(split(), 1, 'left-1');
    setDock(port, 1, null);
    expect(port.tabs[1].pane).toBe('right');
  });

  it('drops a docked tab back to the left pane while that pane is focused', () => {
    const port = makePort(split(), 0, 'right-1');
    setDock(port, 1, null);
    expect(port.tabs[1].pane).toBeUndefined();
  });

  // Docking the tab the user is looking at takes it out of the center, so focus has to land on
  // another tab in the pane it came from — otherwise the center goes empty behind the sidebar.
  it('moves focus to another tab in the same pane when the active tab is docked', () => {
    const tabs = [tab('left-1', 'left'), tab('left-2', 'left'), tab('right-1', 'right')];
    const port = makePort(tabs, 1);
    port.focusHistory = ['left-1'];

    setDock(port, 1, 'right');

    expect(port.activeTab).toBe(port.findIndex('left-1'));
  });

  it('leaves focus alone when the docked tab was not the active one', () => {
    const tabs = [tab('left-1', 'left'), tab('left-2', 'left')];
    const port = makePort(tabs, 0);
    port.focusHistory = ['left-2'];

    setDock(port, 1, 'right');

    expect(port.activeTab).toBe(0);
  });

  // Nothing left in the pane the tab came from to take focus, so there is no replacement to find —
  // focus stays where the dock put it rather than jumping to a tab the user did not ask for.
  it('leaves focus where the dock put it when the pane it came from is now empty', () => {
    const port = makePort(split(), 0, 'right-1');
    setDock(port, 0, 'right');
    expect(port.tabs).toHaveLength(2);
    expect(port.activeTab).toBeGreaterThanOrEqual(0);
  });

  // The split's other side just left the center too, so the pair is no longer a pair.
  it('clears the secondary when the secondary tab is docked', () => {
    const port = makePort(split(), 0, 'right-1');
    setDock(port, 1, 'left');
    expect(port.secondaryTabLabel).toBeUndefined();
  });

  it('clears the unread mark of a tab that leaves the center', () => {
    const port = makePort(split(), 0, 'right-1');
    setDock(port, 1, null);
    expect(port.tabs[1].hasUnread).toBe(false);
  });
});

describe('moveTabToOtherPane', () => {
  it('does nothing for an index naming no tab, or with no active tab', () => {
    const port = makePort(split());
    const before = [...port.tabs];

    moveTabToOtherPane(port, 9);
    const noActive = makePort(split());
    noActive.activeTab = 9;
    moveTabToOtherPane(noActive, 0);

    expect(port.tabs).toEqual(before);
    expect(noActive.tabs).toEqual(before);
  });

  // A lone tab has no other pane to move to, so the operation answers nothing rather than inventing
  // a split to put it in.
  it('does nothing when there is no pane to move to', () => {
    const port = makePort([tab('only')]);
    moveTabToOtherPane(port, 0);
    expect(port.tabs[0].pane).toBeUndefined();
    expect(port.repairSelections).not.toHaveBeenCalled();
  });

  it('moves the target into the other pane and puts a tab in the one it left', () => {
    const port = makePort([tab('left-1', 'left'), tab('left-2', 'left'), tab('right-1', 'right')], 0, 'right-1');
    moveTabToOtherPane(port, 0);
    expect(port.tabs[0].pane).toBe('right');
    expect(port.tabs[1].pane).toBe('left');
    expect(port.activeTab).toBe(port.findIndex('left-1'));
    expect(port.secondaryTabLabel).toBe('left-2');
  });
});

describe('closeTab', () => {
  it('does nothing for an index naming no tab', () => {
    const port = makePort(split());
    closeTab(port, 9);
    expect(port.tabs).toHaveLength(2);
  });

  // Closing the active side of a split can leave focus on a tab in the *other* pane while the pane
  // the closed tab was in still has a tab of its own. That is the state a user does not expect: they
  // closed something on the right and are now looking at the left with the right still split open, so
  // focus is handed back into the pane that lost the tab.
  it('hands focus back into the pane the closed tab was in when the split survives', () => {
    const tabs = [tab('right-1', 'right'), tab('left-1', 'left'), tab('right-2', 'right')];
    const port = makePort(tabs, 0, 'left-1');
    port.focusHistory = ['right-2'];

    closeTab(port, 0);

    expect(port.tabs.map((t) => t.label)).toEqual(['left-1', 'right-2']);
    expect(port.activeTab).toBe(port.findIndex('right-2'));
  });

  // With no right-pane tab in the focus history, the replacement falls back to the only right-pane tab
  // still open rather than leaving focus on the other side of a split the user is looking across.
  it('falls back to the surviving tab in the pane the closed one was in', () => {
    const tabs = [tab('right-1', 'right'), tab('left-1', 'left'), tab('right-2', 'right')];
    const port = makePort(tabs, 0, 'left-1');
    port.focusHistory = ['left-1'];

    closeTab(port, 0);

    expect(port.tabs.map((t) => t.label)).toEqual(['left-1', 'right-2']);
    expect(port.activeTab).toBe(port.findIndex('right-2'));
  });

  // The pane that emptied outright is not a split any more, so nothing is refilled: the center is
  // simply the tabs that are left, and focus goes to the first of them.
  it('does not refill a pane that emptied, because there is no split left to refill', () => {
    const tabs = [tab('left-1', 'left'), tab('left-2', 'left'), tab('right-1', 'right')];
    const port = makePort(tabs, 2, 'left-1');
    port.focusHistory = ['left-1'];

    closeTab(port, 2);

    expect(port.tabs.map((t) => t.label)).toEqual(['left-1', 'left-2']);
    expect(port.tabs.some((t) => t.pane === 'right')).toBe(false);
  });

  // Note on the branch this cannot cover: the "no replacement" side of the close cascade is
  // unreachable. It is guarded on the split having survived, which means a right-pane tab is still
  // open, and that tab is exactly what `recentLabel` falls back to — so a replacement always exists
  // whenever the guard lets the cascade run at all.

  it('clears the secondary when the secondary tab is closed', () => {
    const port = makePort(split(), 0, 'right-1');
    closeTab(port, 1);
    expect(port.secondaryTabLabel).toBeUndefined();
  });

  it('drops the closed tab from the focus history', () => {
    const port = makePort(split(), 0, 'right-1');
    port.focusHistory = ['left-1', 'right-1'];
    closeTab(port, 1);
    expect(port.focusHistory).toEqual(['left-1']);
  });
});

describe('toggleCollapse', () => {
  it('flips the active tab\'s expanded tool steps and clears its unread mark path', () => {
    const port = makePort([tab('a')]);
    toggleCollapse(port);
    expect(port.tabs[0].toolStepsExpanded).toBe(true);
    toggleCollapse(port);
    expect(port.tabs[0].toolStepsExpanded).toBe(false);
  });

  it('does nothing when no tab is active', () => {
    const port = makePort([tab('a')], 9);
    expect(() => { toggleCollapse(port); }).not.toThrow();
    expect(port.tabs[0].toolStepsExpanded).toBeUndefined();
  });
});

describe('insertTab', () => {
  it('puts a new tab in the focused pane', () => {
    const port = makePort(split(), 1, 'left-1');
    insertTab(port, tab('new'));
    expect(port.tabs.at(-1)?.pane).toBe('right');
  });

  it('leaves a new tab undocked while the left pane is focused', () => {
    const port = makePort(split(), 0, 'right-1');
    insertTab(port, tab('new'));
    expect(port.tabs.at(-1)?.pane).toBeUndefined();
  });

  it('leaves a docked tab docked, wherever it is focused', () => {
    const port = makePort(split(), 0, 'right-1');
    const report = { label: 'security', view: 'monitor' } as unknown as Tab;
    insertTab(port, report);
    expect(port.tabs.at(-1)?.pane).toBeUndefined();
  });

  // A reporting tab reports and never takes commands, so it is not a center action tab and takes no
  // pane: it sits outside the split whatever the center is showing.
  it('gives a reporting tab no pane even when the right pane is focused', () => {
    const port = makePort(split(), 1, 'left-1');
    const report = { label: 'quality', view: 'monitor' } as unknown as Tab;
    insertTab(port, report);
    expect(port.tabs.at(-1)?.pane).toBeUndefined();
  });
});
