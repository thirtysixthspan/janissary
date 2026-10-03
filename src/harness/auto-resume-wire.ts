import { HarnessAutoResumer, RESUME_ENTRY_ID, resumeEntry } from './auto-resume.js';
import { reportAutoResumeScheduled, reportAutoResumed } from './auto-resume-state.js';
import { writeCaptureFile } from './capture/file.js';
import { fmtNextRun } from '../schedule/display.js';
import { notify } from '../notifications/index.js';
import type { Managers } from '../managers.js';

// Build an auto-resume tab's resumer: it appends the pending resume to the tab's own schedule — so
// the wait shows in the schedule window, survives a harness that is not yet running, and can be
// cancelled by the user with `schedule cancel auto-resume` — and reports each scheduling to the feed
// (label-free; `notify` prefixes the tab label), linking the screen capture that triggered it.
// Delivery comes back through the same entry: `ScheduleManager`'s fired hook reports it, and the
// resumer cancels the entry when the blockage clears. Split out of `HarnessManager` so the manager
// holds the observer lifecycle and nothing else, beside `auto-approve-wire.ts`.
export function buildAutoResumer(managers: Managers, name: string, label: string): HarnessAutoResumer {
  const resumer = new HarnessAutoResumer({
    harnessName: name,
    schedule: (resumeAt) => {
      managers.schedule.add(label, resumeEntry(resumeAt), {
        fired: () => resumer.onSettled(),
        // A resume the user cancelled is not a resume that landed, but the entry is gone either way —
        // so the flag stops claiming one is pending either way.
        removed: () => resumer.onSettled(),
      });
      return RESUME_ENTRY_ID;
    },
    cancel: () => {
      managers.schedule.cancel(label, RESUME_ENTRY_ID);
    },
    onScheduled: (_reset, resumeAt, capture) => {
      const openFile = writeCaptureFile(label, capture.capturedAt, capture.text);
      notify(managers, 'auto-resume', label, `Hit a usage limit; resuming at ${fmtNextRun(resumeAt)}`, { openFile });
      reportAutoResumeScheduled(managers, label);
    },
    onSettled: () => {
      reportAutoResumed(managers, label);
    },
  });
  return resumer;
}