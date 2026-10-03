import { HarnessScreenReader, type ScreenCapture } from '../harness/screen.js';
import { HarnessAutoApprover } from '../harness/auto-approve.js';
import { HarnessAutoResumer, RESUME_ENTRY_ID } from '../harness/auto-resume.js';
import { BusyTracker, type BusyTransition } from '../harness/busy-status.js';
import { BUSY_TABLE } from '../harness/busy-classify.js';
import type { ServerFrame } from './protocol-frames.js';

export type HarnessDetection = {
  latestCapture: () => ScreenCapture | undefined;
  snapshot: () => BusyTransition;
  delivered: () => void;
  dispose: () => void;
};

/**
 * The far-side counterpart of `captureWiring()`/`buildAutoApprover()`: gate-detection, approval
 * keystroke injection, busy/ready classification, and limit-screen detection for one remote harness
 * spawn, reporting through `send` (a `ServerFrame`) instead of `notify()`/`managers.tab`, since
 * there is no local tab state on this side of the wire. Built unconditionally for every harness
 * spawn (busy/ready tracking applies whether or not auto-approve is on, exactly as `captureWiring()`
 * builds it); the approver only when `autoApprove` is true.
 *
 * The screen reader is fed via `messageBus.emit('pty', …)` — `RemoteProcesses` must emit those
 * alongside `output`/`exit` for this to ever see a byte (see `REMOTE_PROTOCOL_VERSION`'s version-18
 * comment in `./protocol.js`), the same way `PseudoterminalManager.spawn` feeds a local one.
 *
 * Auto-resume is split rather than mirrored: the resumer here only *reports* a limit, because the
 * resume is scheduled and delivered by the client — which owns the clock the reset is stated in, and
 * the schedule the entry belongs to. The client answers with `resume-ack` when that entry has left
 * its schedule, which is what `delivered()` answers.
 */
export function buildHarnessDetection(
  id: string, harnessName: string, cols: number, rows: number, autoApprove: boolean, autoResume: boolean,
  approve: (keystroke: string) => void, send: (frame: ServerFrame) => void,
): HarnessDetection {
  const tracker = Object.hasOwn(BUSY_TABLE, harnessName) ? new BusyTracker() : undefined;
  let approver: HarnessAutoApprover | undefined;
  if (autoApprove) {
    approver = new HarnessAutoApprover({
      harnessName,
      approve,
      notify: (message, capture) => send({
        type: 'gate-event', id, message, capturedAt: capture?.capturedAt ?? Date.now(),
        ...(capture && { capture: capture.text }),
      }),
    });
  }
  // Only a limit whose clause the client can act on is reported: `HarnessAutoResumer` recognizes the
  // screen and the clause together, so a limit stating no usable reset never produces a frame.
  const resumer = autoResume
    ? new HarnessAutoResumer({
      harnessName,
      schedule: () => RESUME_ENTRY_ID,
      cancel: () => {},
      onScheduled: (reset, _resumeAt, capture) => send({
        type: 'resume-event', id, reset, capturedAt: capture.capturedAt, capture: capture.text,
      }),
      onDelivered: () => {},
    })
    : undefined;
  // A settled capture skips the approver and the resumer for the same reason `captureWiring()` does.
  const reader = new HarnessScreenReader(id, cols, rows, (capture) => {
    if (!capture.settled) {
      approver?.onCapture(capture);
      resumer?.onCapture(capture);
    }
    const transition = tracker?.observe(capture, harnessName, !approver || approver.isStuck, resumer?.isParked ?? false);
    if (transition) send({ type: 'busy-transition', id, busy: transition.busy, unread: transition.unread });
  });
  return {
    latestCapture: () => reader.latestCapture(),
    snapshot: () => tracker?.snapshot() ?? { busy: true, unread: false },
    delivered: () => resumer?.onDelivered(),
    dispose: () => reader.dispose(),
  };
}