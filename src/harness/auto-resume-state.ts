import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Auto-resume has scheduled a resume for this tab: the metadata row's flag reads `Auto-resuming`
// and green until the resume is delivered. Both setters are the flag's only writers, for the same
// reason `auto-approved.ts` owns auto-approve's: two callers set it — the local resumer and the
// remote session's `resume-event` translation — and neither should reach into the tab to do it.
export function reportAutoResumeScheduled(managers: Managers, label: string): void {
  const tab = managers.tab.harnessTab(label);
  if (!tab || tab.harness.autoResumeState === 'scheduled') return;
  tab.harness.autoResumeState = 'scheduled';
  messageBus.emit('state', { type: 'dirty' });
}

// The resume has been typed into the harness: the flag goes back to plain `Auto-resume`, the state
// an armed-but-unused tab has always shown.
export function reportAutoResumed(managers: Managers, label: string): void {
  const tab = managers.tab.harnessTab(label);
  if (!tab || tab.harness.autoResumeState === 'resumed') return;
  tab.harness.autoResumeState = 'resumed';
  messageBus.emit('state', { type: 'dirty' });
}