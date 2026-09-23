import { NOTIFICATIONS_LABEL } from './tab.js';

// The tab-manager surface the notification path reaches when it makes the feed visible (see
// `showNotificationsFeed`). A test that only wanted a stub tab manager still ends up on this path
// the moment anything it exercises notifies, so the methods are supplied from one place rather than
// restated in every fake — and supplied working, not inert: a fake whose `openNotificationsTab` did
// nothing would leave the feed closed and make every escalation a no-op.
//
// `dock` is tracked because the server cannot know which client-side sidebar view is selected, so a
// docked feed is not considered visible here (see `notificationsFeedVisible`). `cur` is deliberately not supplied —
// every fake that reaches this path already has one, and overriding it here would answer with the
// wrong tab.
export type FakeTabRecord = {
  label: string;
  view?: string;
  log?: unknown[];
  dock?: 'left' | 'right';
};

export function fakeNotificationsHost(tabs: FakeTabRecord[]) {
  return {
    byLabel: (label: string) => tabs.find((t) => t.label === label),
    findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    openNotificationsTab: () => {
      tabs.push({ label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] });
    },
    setDock: (index: number, dock: 'left' | 'right' | null) => {
      const tab = tabs[index];
      if (tab) tab.dock = dock ?? undefined;
    },
    setActiveTab: () => {},
  };
}
