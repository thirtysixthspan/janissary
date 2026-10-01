import { messageBus, type Subscription } from '../bus.js';
import { isUnreadEligible } from '../tab/transcript/events.js';
import { UNREAD_DWELL_MS } from '../tab/dwell.js';
import { notify } from '../notifications/index.js';
import type { Managers } from '../managers.js';

// The unread badge says a harness tab is waiting. It is a glance-level signal: a flag in the strip,
// on a tab the user may not be looking at, for a run that finished while they were reading something
// else. With a fleet of harnesses that is a lot of badges nobody acts on, so a badged tab that is
// *still* badged after this long is escalated into a notification — one that names the tab and links
// to it, which is the difference between knowing and going.
//
// Armed from `applyBusyTransition` rather than from a capture handler, so a local harness and a
// remote harness's reported transition take the same path, and armed only when the badge was actually
// raised: a tab that was on screen, or docked, never got one. One escalation per tab, never a queue
// of them — a harness running short turns stays quiet and says something once, thirty seconds after
// it finally settles. And it is cancelled the moment the badge comes off, however that happens:
// focused long enough to count as read, taken back to work, closed, or reordered away.

export const HARNESS_IDLE_ESCALATION_MS = 30_000;

const pending = new Map<string, NodeJS.Timeout>();
let subscription: Subscription | undefined;

// Arm the escalation for a tab whose committed idle transition just badged it. Replaces any pending
// escalation for the same tab, which is what keeps a cycling harness to one notification and what
// makes the interval run from the most recent idle commit. `managers` is captured in the closure
// rather than stored here, so this module holds no reference of its own beyond the pending handles.
export function armHarnessIdleEscalation(managers: Managers, label: string): void {
  cancelHarnessIdleEscalation(label);
  subscribeToBadgeClears();
  schedule(managers, label, HARNESS_IDLE_ESCALATION_MS);
}

function schedule(managers: Managers, label: string, delay: number): void {
  const timer = setTimeout(() => escalate(managers, label), delay);
  timer.unref?.();
  pending.set(label, timer);
}

// Drop a tab's pending escalation without escalating it. This is the harness going back to work, the
// tab being closed, and the badge being cleared for any other reason.
export function cancelHarnessIdleEscalation(label: string): void {
  const timer = pending.get(label);
  if (!timer) return;
  clearTimeout(timer);
  pending.delete(label);
}

function escalate(managers: Managers, label: string): void {
  pending.delete(label);
  const tab = managers.tab.byLabel(label);
  // Docking into a sidebar deliberately leaves a badge in place, but a docked tab is permanently
  // visible chrome that no dwell will ever visit, so it is discarded rather than escalated on the
  // strength of a flag it can no longer justify. A badge that is gone anyway means the tab was
  // handled while the interval ran — a completed unread dwell, most often.
  if (!tab || tab.dock || !tab.hasUnread) return;
  // Still badged, but on screen right now — the active tab, or the other pane's visible selection.
  // A notification never lands on a tab the user is looking at, and a glance is not a read either,
  // so rather than giving up, look again once a dwell would have had time to finish: if the user
  // stayed, the dwell's badge clear has cancelled this; if they moved on, the badge is still up and
  // the escalation fires then.
  if (!isUnreadEligible(tab, label, managers.tab.cur().label, managers.tab.secondaryTabLabel)) {
    schedule(managers, label, UNREAD_DWELL_MS);
    return;
  }
  // `shouldNotify` and `deliverNotification` apply every existing rule: the queue, the record file,
  // the feed, repeat folding, burst escalation, and a toast when the feed is not on screen.
  notify(managers, 'harness-idle', label, undefined, { openTab: label });
}

// Release every pending escalation and the badge-clear subscription, for shutdown. The handles are
// `unref`'d and so cannot hold the process open on their own; this is here so each arm has its
// matching release. It runs before `Controller.shutdown` clears the bus, so the next arm in the same
// process attaches a fresh subscription rather than relying on one the clear already dropped.
export function disposeHarnessIdleEscalations(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  subscription?.unsubscribe();
  subscription = undefined;
}

// The badge is the escalation's whole lifetime, so a badge coming off cancels it. Raised on the
// `tabs` channel rather than carried on `state: dirty`, which fires on essentially every mutation;
// `clearUnreadTab` emits only when the flag was actually set, so a clear aimed at a tab that was
// never badged cancels nothing. Attached by the first arm and released by dispose, so the listener
// lives exactly as long as there is something for it to cancel.
function subscribeToBadgeClears(): void {
  subscription ??= messageBus.on('tabs', 'unread-cleared', (event) => cancelHarnessIdleEscalation(event.label));
}
