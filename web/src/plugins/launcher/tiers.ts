import type { LauncherTabRow } from '@shared/plugins/launcher/shared';

// The tier a row belongs to. Ordered, because that order is the order the rows are drawn in: a tab
// waiting on the user comes first, then one with unseen output, then the one being looked at, then
// the rest in two groups — busy work above idle.
//
// This is the ordering Paseo uses (`needs_input → failed → attention → running → done`), and the
// reason the blocked-tab case is first rather than third: without it a tab held at a permission
// prompt reads as merely busy, which is the same row chrome a working tab gets, and the one state
// worth interrupting for looks like the ordinary one.
export type TierKey = 'needsInput' | 'unread' | 'active' | 'busy' | 'idle';

export type Tier = { key: TierKey; label: string; rows: LauncherTabRow[] };

// The label each tier draws above its rows. Small and muted, because the rows themselves carry the
// state — the label is a wayfinding aid rather than a second statement of it.
const TIER_LABELS: Record<TierKey, string> = {
  needsInput: 'Needs you',
  unread: 'Unread',
  active: 'Active',
  busy: 'Working',
  idle: 'Idle',
};

// Which tier one row belongs to, given which tab is active. The active tab is a tier of its own
// rather than a flag on a row, because "the one you are looking at" is a position in the list and
// not a property of a tab.
function tierOf(row: LauncherTabRow, activeLabel: string | undefined): TierKey {
  if (row.needsInput) return 'needsInput';
  if (row.hasUnread) return 'unread';
  if (activeLabel !== undefined && row.label === activeLabel) return 'active';
  return row.busy ? 'busy' : 'idle';
}

// The rows in tier order, with the order inside each tier left exactly as the host sent it. Stable
// within a tier is the point: the host publishes in strip order, and a row that reordered itself
// whenever a neighbour changed would make the rail impossible to read as a list of places.
//
// The active tab's label is passed in rather than read from a prop, because the launcher's own tab is
// docked and can never be the active tab — so the row to lift is the one the payload's active label
// names, not one this view could work out for itself.
export function launcherTiers(
  rows: readonly LauncherTabRow[],
  activeLabel?: string,
): Tier[] {
  const buckets = new Map<TierKey, LauncherTabRow[]>();
  for (const row of rows) {
    const key = tierOf(row, activeLabel);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return (Object.keys(TIER_LABELS) as TierKey[])
    .flatMap((key) => {
      const grouped = buckets.get(key);
      return grouped && grouped.length > 0 ? [{ key, label: TIER_LABELS[key], rows: grouped }] : [];
    });
}

// The active tab's label as the payload's own state has it. The launcher is docked and never active,
// so this is the label the host names as the active one and nothing this view can derive.
export const ACTIVE_TIER_LABEL = 'Active';
