import type { ScreenCapture } from './screen.js';
import { detectPermissionGate, type HarnessAutoApprover } from './auto-approve.js';
import { BUSY_TABLE, classifyBusy, endsWithRecap } from './busy-classify.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

export { classifyBusy, type BusyState } from './busy-classify.js';

export type BusyTransition = { busy: boolean; unread: boolean };

// The busy/ready/unread decision for one harness's capture stream, decoupled from `Managers` so it
// can run identically wherever the capture stream lives — locally against a client's own tab state,
// or server-side against a remote harness with no tab state to read at all. `stuck` is the caller's
// `!approver || approver.isStuck` — auto-approve missing or unable to clear the gate — since only the
// caller knows whether an approver exists for this tab.
//
// A visible permission gate outranks the busy/ready signals: the harness is idle, blocked on the
// user, so busy clears immediately, and `unread` is raised exactly when nothing is going to answer
// the gate. A busy→ready transition is debounced to two consecutive ready captures so a brief
// mid-generation pause does not flicker the dot off; ready→busy is applied immediately. Once a
// busy→ready transition commits, `unread` is raised too — the harness finished its current run, same
// as hitting an unanswered permission gate — except for claude, where a `recap:`-prefixed summary
// line just above its own prompt is not new information worth flagging.
export class BusyTracker {
  private pendingReady = false;
  private busy = true;
  private reported: BusyTransition | undefined;

  // The last classification, for a caller that needs a value with nothing new to observe (a remote
  // peer answering an attach with its current state rather than a fresh capture).
  current(): boolean { return this.busy; }

  // The transition to report for this capture, or undefined when nothing changed (still busy, or a
  // ready capture that only started the debounce window).
  observe(capture: ScreenCapture, harnessName: string, stuck: boolean): BusyTransition | undefined {
    let decision: BusyTransition | undefined;
    if (detectPermissionGate(capture.text, harnessName)) {
      this.pendingReady = false;
      this.busy = false;
      decision = { busy: false, unread: stuck };
    } else if (classifyBusy(capture, harnessName) === 'busy') {
      this.pendingReady = false;
      this.busy = true;
      decision = { busy: true, unread: false };
    } else if (this.pendingReady) {
      this.busy = false;
      decision = { busy: false, unread: harnessName !== 'claude' || !endsWithRecap(capture.text) };
    } else this.pendingReady = true;
    if (!decision || (this.reported?.busy === decision.busy && this.reported.unread === decision.unread)) return undefined;
    this.reported = decision;
    return decision;
  }
}

// The tab facts a capture can change, flattened for change detection: the busy flag and the
// unread badge. `state: dirty` must fire only when one of them actually flips — captures land
// every ~1s while a harness is active, and most of them re-affirm the same state.
function dotSnapshot(managers: Managers, label: string): string {
  const unread = managers.tab.byLabel(label)?.hasUnread ?? false;
  return `${managers.tab.isBusy(label)}:${unread}`;
}

// Build the per-tab capture handler that keeps the tab's busy dot in sync with the harness's
// actual state, or undefined when the harness has no detector (leaving the coarse spawn-to-exit
// busy behavior untouched). `markUnread` itself only badges a hidden (backgrounded, undocked) tab,
// so a visible tab going ready is unaffected. Whenever a capture flips the busy flag or the unread
// badge, `state: dirty` is emitted so clients see the change immediately — without it, a
// backgrounded tab's dot would sit stale until the next unrelated state push.
export function busyStatusHandler(
  name: string, label: string, managers: Managers, approver: HarnessAutoApprover | undefined,
): ((capture: ScreenCapture) => void) | undefined {
  if (!Object.hasOwn(BUSY_TABLE, name)) return undefined;
  const tracker = new BusyTracker();
  return (capture) => {
    const before = dotSnapshot(managers, label);
    const transition = tracker.observe(capture, name, !approver || approver.isStuck);
    if (transition) {
      if (transition.busy) managers.tab.addBusy(label);
      else {
        managers.tab.deleteBusy(label);
        if (transition.unread) managers.tab.markUnread(label);
      }
    }
    if (dotSnapshot(managers, label) !== before) messageBus.emit('state', { type: 'dirty' });
  };
}
