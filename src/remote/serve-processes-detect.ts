import { HarnessScreenReader, type ScreenCapture } from '../harness/screen.js';
import { HarnessAutoApprover } from '../harness/auto-approve.js';
import { BusyTracker } from '../harness/busy-status.js';
import type { ServerFrame } from './protocol.js';

export type HarnessDetection = {
  latestCapture: () => ScreenCapture | undefined;
  currentBusy: () => boolean;
  dispose: () => void;
};

/**
 * The far-side counterpart of `captureWiring()`/`buildAutoApprover()`: gate-detection, approval
 * keystroke injection, and busy/ready classification for one remote harness spawn, reporting through
 * `send` (a `ServerFrame`) instead of `notify()`/`managers.tab`, since there is no local tab state on
 * this side of the wire. Built unconditionally for every harness spawn (busy/ready tracking applies
 * whether or not auto-approve is on, exactly as `captureWiring()` builds it); the approver only when
 * `autoApprove` is true.
 *
 * The screen reader is fed via `messageBus.emit('pty', …)` — `RemoteProcesses` must emit those
 * alongside `output`/`exit` for this to ever see a byte (see `REMOTE_PROTOCOL_VERSION`'s version-18
 * comment in `./protocol.js`), the same way `PseudoterminalManager.spawn` feeds a local one.
 */
export function buildHarnessDetection(
  id: string, harnessName: string, cols: number, rows: number, autoApprove: boolean,
  approve: (keystroke: string) => void, send: (frame: ServerFrame) => void,
): HarnessDetection {
  const tracker = new BusyTracker();
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
  const reader = new HarnessScreenReader(id, cols, rows, (capture) => {
    approver?.onCapture(capture);
    const transition = tracker.observe(capture, harnessName, !approver || approver.isStuck);
    if (transition) send({ type: 'busy-transition', id, busy: transition.busy, unread: transition.unread });
  });
  return {
    latestCapture: () => reader.latestCapture(),
    currentBusy: () => tracker.current(),
    dispose: () => reader.dispose(),
  };
}
