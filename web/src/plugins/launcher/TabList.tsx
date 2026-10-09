import type { LauncherPayload, LauncherTabRow } from '@shared/plugins/launcher/shared';
import { useListSelection, type ListSelection } from '../api';
import { launcherTiers, type Tier } from './tiers';
import { LauncherTabRowView } from './LauncherTabRowView';

// Arrows step by one and stop at the ends, so holding a key settles on the last or first rather than
// cycling past it. Home and End jump. A list with no selection yet starts at the first row.
function listStep(length: number, selected: number | null, key: string): number | null {
  if (length === 0) return null;
  const at = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(at + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(at - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}

// The tab list, one tier per group of rows that need the same kind of attention. A tier with no rows is
// not drawn at all rather than drawn empty, so the rail never spends a line on a state nothing is in.
export function LauncherTabList({ payload, listRef, onFocus }: {
  payload: LauncherPayload;
  listRef: React.RefObject<HTMLDivElement | null>;
  onFocus(row: LauncherTabRow): void;
}) {
  const rows = payload.tabs;
  const selection = useListSelection(rows.length);
  const tiers = launcherTiers(rows);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (selection.navigate(event.key, listStep)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selection.selected !== null) {
      event.preventDefault();
      const row = rows[selection.selected];
      if (row) onFocus(row);
    }
  };
  return (
    <div
      className="launcher-tabs"
      ref={listRef}
      tabIndex={0}
      role="listbox"
      aria-label="Open tabs"
      onKeyDown={onKeyDown}
    >
      {rows.length === 0 && <div className="launcher-empty">No open tabs</div>}
      {tiers.map((tier) => (
        <LauncherTier
          key={tier.key}
          tier={tier}
          rows={rows}
          summaries={payload.summaries}
          selection={selection}
          onFocus={onFocus}
        />
      ))}
    </div>
  );
}

// One tier: its label, then its rows. The label is small and muted, because the rows themselves carry
// the state — the label is a wayfinding aid rather than a second statement of it.
function LauncherTier({ tier, rows, summaries, selection, onFocus }: {
  tier: Tier;
  rows: readonly LauncherTabRow[];
  summaries: LauncherPayload['summaries'];
  selection: ListSelection;
  onFocus(row: LauncherTabRow): void;
}) {
  return (
    <div className="launcher-tier" data-tier={tier.key}>
      <div className="launcher-tier-label">{tier.label}</div>
      {tier.rows.map((row) => (
        <LauncherTabRowView
          key={row.label}
          row={row}
          summary={summaries[row.label]}
          index={rows.indexOf(row)}
          selection={selection}
          onFocus={onFocus}
        />
      ))}
    </div>
  );
}
