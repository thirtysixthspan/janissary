import { buildAutoApprover } from '../auto-approve-wire.js';
import { buildAutoResumer } from '../auto-resume-wire.js';
import { busyStatusHandler } from '../busy-status.js';
import type { HarnessAutoApprover } from '../auto-approve.js';
import type { HarnessAutoResumer } from '../auto-resume.js';
import type { ScreenCapture } from '../screen.js';
import type { Managers } from '../../managers.js';

// Which consumers a harness tab's screen reader feeds, and in what order. Split out of
// `HarnessManager` for the same reason `auto-approve-wire.ts` was: the manager decides *that* a tab
// gets a reader, not what hangs off it.
export type CaptureWiring = {
  handler: ((capture: ScreenCapture) => void) | undefined;
  autoApprover: HarnessAutoApprover | undefined;
  autoResumer: HarnessAutoResumer | undefined;
};

// Build the screen-reader callback that feeds each fresh capture to whichever consumers apply: the
// auto-approver (when `autoApprove` is on), the auto-resumer (when `autoResume` is on), and the
// busy/ready status handler (when the harness has a detector). The approver runs first so the busy
// handler reads its stuck state as of the same capture, and the resumer before it so the handler
// reads whether the tab is parked on a scheduled resume. A settled capture (the reader's confirming
// re-read of an unchanged screen) goes to the busy handler only: the approver reads an identical
// repeat of a gate it answered as a gate it could not clear, and the resumer a blockage it has
// already acted on. Returns an undefined handler when none applies, so the reader runs exactly as
// it would with no consumers.
export function captureWiring(
  managers: Managers, name: string, label: string, id: string, autoApprove: boolean, autoResume: boolean,
): CaptureWiring {
  const approver = autoApprove ? buildAutoApprover(managers, name, label, id) : undefined;
  const resumer = autoResume ? buildAutoResumer(managers, name, label) : undefined;
  const busyHandler = busyStatusHandler(name, label, managers, approver, resumer);
  if (!approver && !resumer && !busyHandler) return { handler: undefined, autoApprover: undefined, autoResumer: undefined };
  return {
    autoApprover: approver,
    autoResumer: resumer,
    handler: (capture) => {
      if (!capture.settled) {
        approver?.onCapture(capture);
        resumer?.onCapture(capture);
      }
      busyHandler?.(capture);
    },
  };
}