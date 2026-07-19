import type { Managers } from '../managers.js';
import type { ProfileEntry, ProfileHarnessEntry } from '../types.js';

// Entry-label resolution and the relaunch close-pass, split out of agent-opener.ts: a distinct
// concern from the tab-opening orchestration that remains there.

export function isHarnessEntry(e: ProfileEntry): e is ProfileHarnessEntry {
  return 'harness' in e;
}

export function labelOf(e: ProfileEntry): string {
  return isHarnessEntry(e) ? e.label : e.name;
}

// Relaunch semantics: close every open tab matching an entry's label first, then the caller opens
// all entries fresh, so label collisions between a closing tab and an opening one cannot arise.
// The issuing tab is never closed; if it's named by an entry, that entry is skipped instead.
export function closeMatchingTabs(
  entries: ProfileEntry[], managers: Managers, issuingLabel: string, skipped: string[], notes: string[],
): ProfileEntry[] {
  const toOpen: ProfileEntry[] = [];
  for (const entry of entries) {
    const label = labelOf(entry);
    if (label.toLowerCase() === issuingLabel.toLowerCase()) {
      skipped.push(`${label} (cannot relaunch the issuing tab)`);
      continue;
    }
    const index = managers.tab.findIndex(label);
    if (index !== -1) {
      managers.tab.closeTab(index);
      notes.push(`Relaunched "${label}".`);
    }
    toOpen.push(entry);
  }
  return toOpen;
}
