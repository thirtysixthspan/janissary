import type { Tab } from './types.js';
import { clearUnreadTab } from './transcript/events.js';
import { messageBus } from '../bus.js';

// The unread badge is the app's record that a tab holds something the user has not looked at, and
// focusing a tab used to be enough to clear it. That is wrong for a glance: flicking through the
// strip to find a tab silently threw away the record that a harness had finished, and a harness that
// stays badged for 30 seconds is escalated to a notification the user would then never get. So
// selecting a tab starts a dwell instead, and the badge comes off only once that tab has been the
// active one for the full interval.
//
// One handle, never a map: there is only one active tab, so there is only one candidate. Beginning a
// dwell replaces whatever was pending, which is what makes the interval continuous per tab — a glance
// at one tab and a move to another starts the clock again rather than leaving a stale candidate to
// fire against the wrong tab. That is also why the label is recorded alongside the resolver instead of
// being read back out of "whoever is active" at fire time.

export const UNREAD_DWELL_MS = 3000;

let pending: { label: string; resolveTabs: () => Tab[] } | undefined;
let timer: NodeJS.Timeout | undefined;

// Start (or restart) the dwell for `label`. `resolveTabs` is called when the interval is up rather
// than its result being captured now, because the tabs array is replaced wholesale by several
// operations — a close maps every surviving tab into a fresh object — so an array captured at
// selection time can be a detached copy by the time the dwell fires. Every caller here is a tab
// manager or a port onto one, so reading the field at fire time is what gets the live array.
//
// Selecting a tab that carries no badge arms nothing: there is nothing to take off, and a tab cannot
// be badged while it is the active one, so the badge can never appear after this point to be missed.
// That keeps the common case — moving around a strip of tabs nobody is waiting on — free of timers.
export function beginDwell(resolveTabs: () => Tab[], label: string): void {
  const tab = resolveTabs().find((t) => t.label === label);
  if (!tab?.hasUnread) return;
  clearPending();
  pending = { label, resolveTabs };
  timer = setTimeout(complete, UNREAD_DWELL_MS);
  timer.unref?.();
}

function complete(): void {
  const dwell = pending;
  clearPending();
  if (!dwell) return;
  // Only an actual clear announces anything, so a dwell on a tab that carried no badge — or whose
  // badge the harness dropped by going back to work in the meantime — is silent, and in particular
  // cannot cancel a pending escalation it knows nothing about.
  if (clearUnreadTab(dwell.resolveTabs(), dwell.label)) messageBus.emit('state', { type: 'dirty' });
}

function clearPending(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  pending = undefined;
}

// Release the pending dwell, for a tab manager shutting down. A dwell is `unref`'d and so cannot
// hold the process open on its own; this is here so the acquire has its matching release.
export function disposeDwell(): void {
  clearPending();
}
