import { writeBrowserLog } from '../browser/browser-log.js';
import { notify } from '../notifications/index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// The tab's browser is gone, delivered twice. The notifications tab carries it as before, and the
// tab itself now carries it too, above its terminal, the way a failed workspace clone does. A
// notification is worth nothing to a user who keeps that feed closed, and the agent that was driving
// the browser is working in this tab.
//
// Everything the browser said is kept beside those two reports, in a file the notification line
// links, because the reports themselves are bounded to a readable tail and a crash trace is
// longer than that bound. Written whether or not the feed is open — unlike an auto-approve
// capture, which is written per approval and would otherwise pile up unread. A death is rare and
// its evidence is the point, the same reasoning that keeps the dead browser's scratch directory.
//
// Split out of `HarnessManager`, which owns launching and wiring, to keep that file under the size
// limit.
export function reportBrowserGone(managers: Managers, label: string, message: string, log?: string): void {
  const logFile = log ? writeBrowserLog(label, Date.now(), log) : undefined;
  notify(managers, 'e2e-browser-gone', label, message, logFile);
  const tab = managers.tab.harnessTab(label);
  if (tab) tab.harness.browserError = message;
  messageBus.emit('state', { type: 'dirty' });
}
