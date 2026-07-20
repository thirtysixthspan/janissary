import type { ScreenCapture } from './screen.js';
import { detectPermissionGate, type HarnessAutoApprover } from './auto-approve.js';
import { BUSY_TABLE, classifyBusy } from './busy-classify.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

export { classifyBusy, type BusyState } from './busy-classify.js';

// The tab facts a capture can change, flattened for change detection: the busy flag and the
// unread badge. `state: dirty` must fire only when one of them actually flips — captures land
// every ~1s while a harness is active, and most of them re-affirm the same state.
function dotSnapshot(managers: Managers, label: string): string {
  const unread = managers.tab.tabs.find((t) => t.label === label)?.hasUnread ?? false;
  return `${managers.tab.isBusy(label)}:${unread}`;
}

// Build the per-tab capture handler that keeps the tab's busy dot in sync with the harness's
// actual state, or undefined when the harness has no detector (leaving the coarse spawn-to-exit
// busy behavior untouched). A visible permission gate outranks the busy/ready signals: the
// harness is idle, blocked on the user, so busy clears immediately — and the tab is badged unread
// when nothing is going to answer the gate (`approver` missing, or stood down on it). A busy→ready
// transition is debounced to two consecutive ready captures so a brief mid-generation pause does
// not flicker the dot off; ready→busy is applied immediately. Once a busy→ready transition
// commits, the tab is also badged unread — the harness finished its current run, same as hitting
// an unanswered permission gate. `markUnread` itself only badges a hidden (backgrounded, undocked)
// tab, so a visible tab going ready is unaffected. Whenever a capture flips the busy flag or the
// unread badge, `state: dirty` is emitted so clients see the change immediately — without it, a
// backgrounded tab's dot would sit stale until the next unrelated state push.
export function busyStatusHandler(
  name: string, label: string, managers: Managers, approver: HarnessAutoApprover | undefined,
): ((capture: ScreenCapture) => void) | undefined {
  const entry = BUSY_TABLE[name];
  if (!entry) return undefined;
  let pendingReady = false;
  const apply = (capture: ScreenCapture): void => {
    if (detectPermissionGate(capture.text, name)) {
      pendingReady = false;
      managers.tab.deleteBusy(label);
      if (!approver || approver.isStuck) managers.tab.markUnread(label);
      return;
    }
    const state = classifyBusy(capture, name);
    if (state === 'busy') {
      pendingReady = false;
      managers.tab.addBusy(label);
      return;
    }
    if (pendingReady) { managers.tab.deleteBusy(label); managers.tab.markUnread(label); }
    else pendingReady = true;
  };
  return (capture) => {
    const before = dotSnapshot(managers, label);
    apply(capture);
    if (dotSnapshot(managers, label) !== before) messageBus.emit('state', { type: 'dirty' });
  };
}
