import { buildAutoApprover } from './auto-approve-wire.js';
import { busyStatusHandler } from './busy-status.js';
import type { HarnessAutoApprover } from './auto-approve.js';
import type { ScreenCapture } from './screen.js';
import type { Managers } from '../managers.js';

// Which consumers a harness tab's screen reader feeds, and in what order. Split out of
// `HarnessManager` for the same reason `auto-approve-wire.ts` was: the manager decides *that* a tab
// gets a reader, not what hangs off it.
export type CaptureWiring = {
  handler: ((capture: ScreenCapture) => void) | undefined;
  autoApprover: HarnessAutoApprover | undefined;
};

// Build the screen-reader callback that feeds each fresh capture to whichever consumers apply: the
// auto-approver (when `autoApprove` is on) and the busy/ready status handler (when the harness has
// a detector). The approver runs first so the busy handler reads its stuck state as of the same
// capture. Returns an undefined handler when neither applies, so the reader runs exactly as it
// would with no consumers.
export function captureWiring(
  managers: Managers, name: string, label: string, id: string, autoApprove: boolean,
): CaptureWiring {
  const approver = autoApprove ? buildAutoApprover(managers, name, label, id) : undefined;
  const busyHandler = busyStatusHandler(name, label, managers, approver);
  if (!approver && !busyHandler) return { handler: undefined, autoApprover: undefined };
  return {
    autoApprover: approver,
    handler: (capture) => {
      approver?.onCapture(capture);
      busyHandler?.(capture);
    },
  };
}
