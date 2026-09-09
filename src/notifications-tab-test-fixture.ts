import { NOTIFICATIONS_LABEL } from './notifications-tab.js';

// The tab-manager surface `notify` reaches when it reveals the feed (see `revealNotificationsTab`).
// A test that only wanted a stub tab manager still ends up on this path the moment anything it
// exercises notifies, so the methods are supplied from one place rather than restated in every
// fake — and supplied working, not inert: a fake whose `openNotificationsTab` did nothing would
// leave the feed closed and quietly restore the drop-if-closed behavior the real code no longer has.
export type FakeTabRecord = { label: string; view?: string; log?: unknown[] };

export function fakeNotificationsHost(tabs: FakeTabRecord[]) {
  return {
    byLabel: (label: string) => tabs.find((t) => t.label === label),
    findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    openNotificationsTab: () => {
      tabs.push({ label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] });
    },
    setDock: () => {},
    setActiveTab: () => {},
  };
}
