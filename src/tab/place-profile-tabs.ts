import type { Tab, CenterPane } from './types.js';
import { isCenterActionTab } from './split.js';

type ProfileTabCandidate = { label: string; number?: number; pane?: CenterPane };

// Applies each candidate's requested pane to its matching center-action tab, in place.
export function applyProfileTabPanes(tabs: Tab[], candidates: ProfileTabCandidate[]): void {
  for (const candidate of candidates) {
    const tab = tabs.find((item) => item.label === candidate.label);
    if (tab && isCenterActionTab(tab)) tab.pane = candidate.pane === 'right' ? 'right' : undefined;
  }
}

// Decides which tab should become active and which should become the secondary (split) tab,
// given the freshly placed candidates. Returns only the fields that should change — a field left
// out of the result means "leave as-is", not "clear it".
export function resolveProfileTabFocus(
  tabs: Tab[],
  activeTab: number,
  candidates: ProfileTabCandidate[],
  findIndex: (label: string) => number,
): { activeTab?: number; secondaryTabLabel?: string } {
  const ordered = candidates.toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  const left = ordered.find((candidate) => candidate.pane !== 'right');
  const right = ordered.find((candidate) => candidate.pane === 'right');

  if (left && right) return { activeTab: findIndex(left.label), secondaryTabLabel: right.label };

  if (left) {
    const active = tabs[activeTab];
    return active?.pane === 'right' ? { secondaryTabLabel: left.label } : { activeTab: findIndex(left.label) };
  }

  if (right) {
    const active = tabs[activeTab];
    return active?.pane === 'right' ? { activeTab: findIndex(right.label) } : { secondaryTabLabel: right.label };
  }

  return {};
}
