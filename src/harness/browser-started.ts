import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// The tab's browser has come up behind its endpoint — the other half of `reportBrowserGone`. Nothing
// is notified: a browser starting is what the agent asked for, so it is news only to the metadata
// row, whose browser flag shows the browser is in use until one is reported gone. The remote
// channel's counterpart is `notifyBrowserStarted`, which resolves its tab by session id instead.
export function reportBrowserStarted(managers: Managers, label: string): void {
  const tab = managers.tab.harnessTab(label);
  if (!tab) return;
  tab.harness.browserRunning = true;
  messageBus.emit('state', { type: 'dirty' });
}
