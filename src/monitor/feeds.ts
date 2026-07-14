import type { LogEntry, MonitorTarget, Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { seedEntries } from './targets.js';
import { harnessFeedEntries } from './harness-feed.js';
import { editorFeedEntries } from './editor-feed.js';
import { pageFeedEntries } from './page-feed.js';

export type FeedState = {
  harnessSeen: Map<string, number>;
  editorSeen: Map<string, string>;
  pageSeen: Map<string, string>;
};

// The non-transcript feeds (harness screen, editor content, page content) — used both at monitor
// start (seed) and on every flush tick. Transcript entries flow separately via the `entry:appended`
// subscription.
export function flushFeedEntries(managers: Managers, targets: MonitorTarget[], state: FeedState): { tabLabel: string; entry: LogEntry }[] {
  return [
    ...harnessFeedEntries(managers, targets, state.harnessSeen),
    ...editorFeedEntries(managers, targets, state.editorSeen),
    ...pageFeedEntries(managers, targets, state.pageSeen),
  ];
}

// Full seed: transcript entries for every already-open target plus the current state of the
// non-transcript feeds.
export function seedFeedEntries(managers: Managers, tabs: Tab[], targets: MonitorTarget[], state: FeedState): { tabLabel: string; entry: LogEntry }[] {
  return [...seedEntries(tabs, targets), ...flushFeedEntries(managers, targets, state)];
}
