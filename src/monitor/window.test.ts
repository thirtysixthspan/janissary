import { describe, it, expect, vi } from 'vitest';
import {
  allocateMonitorLabel,
  monitorTabs,
  openMonitorTab,
  pushSuggestion,
  closeMonitorTab,
  findSuggestion,
  removeSuggestion,
  runSuggestion,
  updateMonitorMeta,
} from './window.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { MonitorSuggestion, Tab } from '../types.js';

function makeSuggestion(id: string): MonitorSuggestion {
  return { id, text: 'looks off', timestamp: Date.now(), persona: 'reviewer', about: 'main' };
}

function makeManagers(tabs: Tab[] = []): { managers: Managers; dispatchTo: ReturnType<typeof vi.fn> } {
  const dispatchTo = vi.fn();
  const managers = {
    tab: {
      tabs,
      closeTab: vi.fn((index: number) => { managers.tab.tabs = managers.tab.tabs.toSpliced(index, 1); }),
    },
    command: { dispatchTo },
  } as unknown as Managers;
  return { managers, dispatchTo };
}

describe('allocateMonitorLabel', () => {
  it('returns the bare persona name when unused', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    expect(allocateMonitorLabel(managers, 'reviewer')).toBe('reviewer');
  });

  it('suffixes with -2 when the persona name is taken', () => {
    const { managers } = makeManagers([makeTab('reviewer', 'red')]);
    expect(allocateMonitorLabel(managers, 'reviewer')).toBe('reviewer-2');
  });

  it('finds the next free suffix when several are taken', () => {
    const { managers } = makeManagers([makeTab('reviewer', 'red'), makeTab('reviewer-2', 'blue')]);
    expect(allocateMonitorLabel(managers, 'reviewer')).toBe('reviewer-3');
  });
});

describe('monitorTabs', () => {
  it('returns only tabs with view "monitor"', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    openMonitorTab(managers, 'reviewer', 'blue');
    expect(monitorTabs(managers)).toHaveLength(1);
    expect(monitorTabs(managers)[0].label).toBe('reviewer');
  });
});

describe('openMonitorTab', () => {
  it('creates a new monitor tab appended after existing tabs', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    const tab = openMonitorTab(managers, 'reviewer', 'blue');

    expect(tab.view).toBe('monitor');
    expect(tab.label).toBe('reviewer');
    expect(tab.title).toBe('reviewer');
    expect(tab.monitor).toEqual({ suggestions: [], persona: 'reviewer', targets: '', contextBytes: 0 });
    expect(tab.number).toBe(2);
    expect(managers.tab.tabs).toHaveLength(2);
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('reuses an existing monitor tab with the same name', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const first = openMonitorTab(managers, 'reviewer', 'blue');
    const second = openMonitorTab(managers, 'reviewer', 'blue');
    expect(second).toBe(first);
    expect(managers.tab.tabs).toHaveLength(2);
  });
});

describe('pushSuggestion', () => {
  it('opens the monitor tab if needed and appends a suggestion', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const suggestion = makeSuggestion('s1');

    pushSuggestion(managers, 'reviewer', 'blue', suggestion);

    const tabs = monitorTabs(managers);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].monitor?.suggestions).toEqual([suggestion]);
  });

  it('appends to an already-open monitor tab', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s1'));
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s2'));

    expect(monitorTabs(managers)[0].monitor?.suggestions.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('updateMonitorMeta', () => {
  it('updates targets and contextBytes on an existing monitor tab', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    openMonitorTab(managers, 'reviewer', 'blue');

    updateMonitorMeta(managers, 'reviewer', 'agent2, group:3', 512);

    const tab = monitorTabs(managers)[0];
    expect(tab.monitor).toMatchObject({ targets: 'agent2, group:3', contextBytes: 512 });
  });

  it('mutates the monitor object in place rather than replacing it', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    openMonitorTab(managers, 'reviewer', 'blue');
    const monitor = monitorTabs(managers)[0].monitor;

    updateMonitorMeta(managers, 'reviewer', 'agent2', 100);

    expect(monitorTabs(managers)[0].monitor).toBe(monitor);
  });

  it('emits a dirty state event', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    openMonitorTab(managers, 'reviewer', 'blue');
    const emitSpy = vi.spyOn(messageBus, 'emit');

    updateMonitorMeta(managers, 'reviewer', 'agent2', 100);

    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('is a no-op when no monitor tab matches the name', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    expect(() => updateMonitorMeta(managers, 'ghost', 'agent2', 100)).not.toThrow();
  });
});

describe('closeMonitorTab', () => {
  it('closes the named monitor tab', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    openMonitorTab(managers, 'reviewer', 'blue');

    closeMonitorTab(managers, 'reviewer');

    expect(monitorTabs(managers)).toHaveLength(0);
  });

  it('is a no-op when no monitor tab matches the name', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    expect(() => closeMonitorTab(managers, 'ghost')).not.toThrow();
    expect(managers.tab.tabs).toHaveLength(1);
  });
});

describe('findSuggestion', () => {
  it('finds a suggestion across every monitor feed', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s1'));
    pushSuggestion(managers, 'security', 'green', makeSuggestion('s2'));

    expect(findSuggestion(managers, 's2')?.persona).toBe('reviewer');
  });

  it('returns undefined when no feed has the id', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    expect(findSuggestion(managers, 'ghost')).toBeUndefined();
  });
});

describe('removeSuggestion', () => {
  it('removes a suggestion from whichever feed holds it', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s1'));
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s2'));

    removeSuggestion(managers, 's1');

    expect(monitorTabs(managers)[0].monitor?.suggestions.map((s) => s.id)).toEqual(['s2']);
  });

  it('does not emit a dirty event when the id is not found', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s1'));
    const emitSpy = vi.spyOn(messageBus, 'emit');

    removeSuggestion(managers, 'ghost');

    expect(emitSpy).not.toHaveBeenCalled();
    emitSpy.mockRestore();
  });
});

describe('runSuggestion', () => {
  it('dispatches the suggestion command to the tab it is about', () => {
    const { managers, dispatchTo } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', { ...makeSuggestion('s1'), command: 'clear', about: 'main' });

    runSuggestion(managers, 's1');

    expect(dispatchTo).toHaveBeenCalledWith('main', 'clear');
  });

  it('does nothing when the suggestion has no command', () => {
    const { managers, dispatchTo } = makeManagers([makeTab('main', 'red')]);
    pushSuggestion(managers, 'reviewer', 'blue', makeSuggestion('s1'));

    runSuggestion(managers, 's1');

    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('does nothing when the suggestion id is not found', () => {
    const { managers, dispatchTo } = makeManagers([makeTab('main', 'red')]);
    runSuggestion(managers, 'ghost');
    expect(dispatchTo).not.toHaveBeenCalled();
  });
});
