import { describe, it, expect, vi } from 'vitest';
import { command, parseClose } from './close.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

describe('close command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('close');
  });

  it('matches "close" case-insensitively', () => {
    expect(command.match('close')).toBe(true);
    expect(command.match('CLOSE')).toBe(true);
    expect(command.match('Close')).toBe(true);
  });

  it('matches "close page n" with the broadened matcher', () => {
    expect(command.match('close page 1')).toBe(true);
    expect(command.match('CLOSE PAGE 3')).toBe(true);
  });

  it('matches "exit" case-insensitively, as an alias of close', () => {
    expect(command.match('exit')).toBe(true);
    expect(command.match('EXIT')).toBe(true);
    expect(command.match('exit page 2')).toBe(true);
  });

  it('does not match non-close input', () => {
    expect(command.match('closer')).toBe(false);
    expect(command.match('clos')).toBe(false);
    expect(command.match('exits')).toBe(false);
    expect(command.match('quit')).toBe(false);
  });
});

describe('parseClose', () => {
  it('returns active for bare close', () => {
    expect(parseClose('close')).toEqual({ target: 'active' });
  });

  // A page tab is a plugin tab now, named `page`, `page-2`, … like every other plugin tab, so it is
  // closed by that label rather than by a page number the app no longer assigns.
  it('returns tabname target for "close page"', () => {
    expect(parseClose('close page')).toEqual({ target: 'tabname', name: 'page' });
  });

  it('returns tabname target for "close page-2"', () => {
    expect(parseClose('close page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });

  it('is case-insensitive on the close keyword', () => {
    expect(parseClose('CLOSE page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });

  it('returns tabname target for "close page abc"', () => {
    expect(parseClose('close page abc')).toEqual({ target: 'tabname', name: 'page abc' });
  });

  it('returns tabname target for "close <name>"', () => {
    expect(parseClose('close tab 2')).toEqual({ target: 'tabname', name: 'tab 2' });
  });

  it('returns tabname target for single-word tab name', () => {
    expect(parseClose('close janus')).toEqual({ target: 'tabname', name: 'janus' });
  });

  it('returns tabname target for multi-word tab name', () => {
    expect(parseClose('close my tab')).toEqual({ target: 'tabname', name: 'my tab' });
  });

  it('treats "exit" as an alias of "close"', () => {
    expect(parseClose('exit')).toEqual({ target: 'active' });
    expect(parseClose('EXIT page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });
});

function makeManagers(tabs: Tab[]): { managers: Managers; appended: string[] } {
  const appended: string[] = [];
  const managers = {
    tab: {
      tabs,
      append: vi.fn((_label: string, entry: { output: string }) => { appended.push(entry.output); }),
      closeTab: vi.fn(),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    },
  } as unknown as Managers;
  return { managers, appended };
}

function makeTab(label: string, title?: string): Tab {
  return {
    label, title, dotColor: '#fff', number: 1, group: 1, groupColor: '#fff', log: [],
    cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
  };
}

describe('close command run', () => {
  const tabs = [makeTab('janus'), makeTab('claude', 'reviewer'), makeTab('notes')];

  it('closes the tab whose display alias matches', () => {
    const { managers, appended } = makeManagers(tabs);
    command.run('close reviewer', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.closeTab).toHaveBeenCalledWith(1);
    expect(appended).toEqual([]);
  });

  it('closes the tab whose label matches in a different case', () => {
    const { managers } = makeManagers(tabs);
    command.run('close NOTES', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.closeTab).toHaveBeenCalledWith(2);
  });

  it('resolves an alias for "exit" the same way', () => {
    const { managers } = makeManagers(tabs);
    command.run('exit Reviewer', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.closeTab).toHaveBeenCalledWith(1);
  });

  it('reports an unknown name on the invoking tab and closes nothing', () => {
    const { managers, appended } = makeManagers(tabs);
    command.run('close ghost', { label: 'janus', index: 0 }, managers);
    expect(appended).toEqual(['No tab named "ghost".']);
    expect(managers.tab.append).toHaveBeenCalledWith('janus', { input: 'close ghost', output: 'No tab named "ghost".' });
    expect(managers.tab.closeTab).not.toHaveBeenCalled();
  });

  it('closes the invoking tab when bare', () => {
    const { managers } = makeManagers(tabs);
    command.run('close', { label: 'notes', index: 2 }, managers);
    expect(managers.tab.closeTab).toHaveBeenCalledWith(2);
  });
});
