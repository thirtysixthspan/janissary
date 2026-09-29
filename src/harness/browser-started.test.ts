import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { reportBrowserGone } from './browser-gone.js';
import { reportBrowserStarted } from './browser-started.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../browser/browser-log.js', () => ({ writeBrowserLog: vi.fn(() => '/project/.janissary/browser-logs/bot.log') }));

// The two halves of a `-b` tab's browser state as the metadata row reads it: a browser that came up
// marks the tab, and a browser reported gone clears the mark it left.

function harnessTab(label: string): Tab {
  return { label, harness: { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' } } as unknown as Tab;
}

function managersWith(tabs: Tab[]): Managers {
  return {
    tab: { harnessTab: (label: string) => tabs.find((t) => t.label === label && t.harness) },
  } as unknown as Managers;
}

beforeEach(() => vi.clearAllMocks());

describe('reportBrowserStarted', () => {
  it('marks the named harness tab\'s browser as running and refreshes the view', () => {
    const tab = harnessTab('bot');
    const emit = vi.spyOn(messageBus, 'emit');
    reportBrowserStarted(managersWith([tab]), 'bot');
    expect(tab.harness?.browserRunning).toBe(true);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  // A browser starting is what the agent asked for, not something to tell the user about.
  it('notifies nothing', () => {
    reportBrowserStarted(managersWith([harnessTab('bot')]), 'bot');
    expect(notify).not.toHaveBeenCalled();
  });

  it('does nothing for a tab that is no longer open', () => {
    const tab = harnessTab('bot');
    reportBrowserStarted(managersWith([tab]), 'other');
    expect(tab.harness?.browserRunning).toBeUndefined();
  });
});

describe('reportBrowserGone', () => {
  it('clears the running mark a started browser left, beside the gone report', () => {
    const tab = harnessTab('bot');
    const managers = managersWith([tab]);
    reportBrowserStarted(managers, 'bot');
    reportBrowserGone(managers, 'bot', 'e2e browser exited');
    expect(tab.harness?.browserRunning).toBeUndefined();
    expect(tab.harness?.browserError).toBe('e2e browser exited');
  });
});
