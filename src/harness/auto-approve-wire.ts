import { HarnessAutoApprover } from './auto-approve.js';
import { writeCaptureFile } from './capture-file.js';
import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';

// Build a `-y`/`--yes` tab's auto-approver: it injects the approval keystroke back into the tab's
// own PTY and reports each approval to the notifications feed (label-free — `notify` prefixes the
// tab label), linking the screen capture that triggered it. The capture used to be written only for
// an already-open feed; a recorded notification now always has one, so that check would have skipped
// the capture for the one approval that opens the feed and written it for every approval after.
// Split out of `HarnessManager` so the manager holds the observer lifecycle and nothing else; the
// caller still owns the approver map the returned instance is registered in.
export function buildAutoApprover(managers: Managers, name: string, label: string, id: string): HarnessAutoApprover {
  return new HarnessAutoApprover({
    harnessName: name,
    approve: (keystroke) => managers.pty.input(id, keystroke),
    notify: (message, capture) => {
      const openFile = capture ? writeCaptureFile(label, capture.capturedAt, capture.text) : undefined;
      notify(managers, 'auto-approve', label, message, openFile);
    },
  });
}
