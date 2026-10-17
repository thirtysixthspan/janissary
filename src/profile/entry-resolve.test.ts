import { describe, expect, it, vi } from 'vitest';
import { closeMatchingTabs } from './entry-resolve.js';
import type { Managers } from '../managers.js';
import type { ProfileHarnessEntry } from './types.js';

function entry(name: string): ProfileHarnessEntry {
  return { type: 'harness', name, tool: 'claude' } as ProfileHarnessEntry;
}

describe('closeMatchingTabs', () => {
  it.each(['system', 'SyStEm'])('skips reserved label %s without looking up or closing a tab', (name) => {
    const findIndex = vi.fn(() => 0);
    const closeTab = vi.fn();
    const managers = { tab: { findIndex, closeTab } } as unknown as Managers;
    const skipped: string[] = [];

    const toOpen = closeMatchingTabs([entry(name)], managers, 'janus', skipped, []);

    expect(toOpen).toEqual([]);
    expect(skipped).toEqual(['system (reserved for the system tab)']);
    expect(findIndex).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('still closes a normal match and skips the issuing tab', () => {
    const findIndex = vi.fn((label: string) => label === 'worker' ? 2 : -1);
    const closeTab = vi.fn();
    const managers = { tab: { findIndex, closeTab } } as unknown as Managers;
    const skipped: string[] = [];
    const notes: string[] = [];

    const toOpen = closeMatchingTabs([entry('worker'), entry('janus')], managers, 'Janus', skipped, notes);

    expect(toOpen).toEqual([entry('worker')]);
    expect(findIndex).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledWith(2);
    expect(skipped).toEqual(['janus (cannot relaunch the issuing tab)']);
    expect(notes).toEqual(['Relaunched "worker".']);
  });
});
