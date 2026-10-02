import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { messageBus } from '../bus.js';
import { reportAutoApproved } from './auto-approved.js';

function harnessTab(label: string): Tab {
  return { label, harness: { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' } } as unknown as Tab;
}

function managersWith(tabs: Tab[]): Managers {
  return {
    tab: { harnessTab: (label: string) => tabs.find((t) => t.label === label && t.harness) },
  } as unknown as Managers;
}

beforeEach(() => vi.restoreAllMocks());

describe('reportAutoApproved', () => {
  it('marks the named harness tab as auto-approved and refreshes the view', () => {
    const tab = harnessTab('bot');
    const emit = vi.spyOn(messageBus, 'emit');
    reportAutoApproved(managersWith([tab]), 'bot');
    expect(tab.harness?.autoApproved).toBe(true);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('refreshes the view only for the first approval', () => {
    const tab = harnessTab('bot');
    const managers = managersWith([tab]);
    reportAutoApproved(managers, 'bot');
    const emit = vi.spyOn(messageBus, 'emit');
    reportAutoApproved(managers, 'bot');
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing for a tab that is no longer open', () => {
    const tab = harnessTab('bot');
    reportAutoApproved(managersWith([tab]), 'other');
    expect(tab.harness?.autoApproved).toBeUndefined();
  });
});
