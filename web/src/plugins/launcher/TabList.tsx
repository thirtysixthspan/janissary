import type { LauncherPayload, LauncherTabRow } from '@shared/plugins/launcher/shared';
import { nextListSelection, useListSelection, type ListSelection } from '../api';
import { launcherTiers, type TabGroup, type Tier } from './tiers';
import { LauncherTabRowView } from './LauncherTabRowView';
import { useComposedListRef } from './list-ref';

// The tab list, one tier per group of rows that need the same kind of attention. A tier with no rows is
// not drawn at all rather than drawn empty, so the rail never spends a line on a state nothing is in.
export function LauncherTabList({ payload, listRef, onFocus, now }: {
  payload: LauncherPayload;
  listRef: React.RefObject<HTMLDivElement | null>;
  onFocus(row: LauncherTabRow): void;
  now: number;
}) {
  const rows = payload.tabs;
  // The active tier is the host's answer to which tab the user is on, carried per row, so this list
  // never derives it and never has a tier it cannot fill.
  const activeLabel = rows.find((row) => row.active)?.label;
  const groups = launcherTiers(rows, activeLabel);
  // The rows in the order they are drawn, which is the order the keyboard walks them. The payload's
  // own order is not that order — a tier's rows are regrouped by what needs attention — so an index
  // into it would highlight the second row on screen while the first one is lit, and Enter would act
  // on the row the highlight is not on.
  const displayed = groups.flatMap((group) => group.tiers.flatMap((tier) => tier.rows));
  const selection = useListSelection(displayed.length);
  const composed = useComposedListRef(listRef, selection.listRef);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (selection.navigate(event.key, nextListSelection)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selection.selected !== null) {
      event.preventDefault();
      const row = displayed[selection.selected];
      if (row) onFocus(row);
    }
  };
  return (
    <div
      className="launcher-tabs"
      ref={composed}
      tabIndex={0}
      role="listbox"
      aria-label="Open tabs"
      onKeyDown={onKeyDown}
    >
      {displayed.length === 0 && <div className="launcher-empty">No open tabs</div>}
      {groups.map((group) => (
        <LauncherGroup key={group.number} group={group} displayed={displayed} summaries={payload.summaries} selection={selection} onFocus={onFocus} now={now} />
      ))}
    </div>
  );
}

function LauncherGroup({ group, displayed, summaries, selection, onFocus, now }: {
  group: TabGroup;
  displayed: readonly LauncherTabRow[];
  summaries: LauncherPayload['summaries'];
  selection: ListSelection;
  onFocus(row: LauncherTabRow): void;
  now: number;
}) {
  return (
    <div className="launcher-group" data-group={group.number}>
      {group.tiers.map((tier) => (
        <LauncherTier
          key={tier.key}
          tier={tier}
          displayed={displayed}
          summaries={summaries}
          groupColor={group.color}
          selection={selection}
          onFocus={onFocus}
          now={now}
        />
      ))}
    </div>
  );
}

// One tier: its label, then its rows. The label is small and muted, because the rows themselves carry
// the state — the label is a wayfinding aid rather than a second statement of it.
function LauncherTier({ tier, displayed, summaries, groupColor, selection, onFocus, now }: {
  tier: Tier;
  displayed: readonly LauncherTabRow[];
  summaries: LauncherPayload['summaries'];
  groupColor: string;
  selection: ListSelection;
  onFocus(row: LauncherTabRow): void;
  now: number;
}) {
  return (
    <div className="launcher-tier" data-tier={tier.key}>
      <div className="launcher-tier-label" style={{ borderRightColor: groupColor }}>{tier.label}</div>
      {tier.rows.map((row) => (
        <LauncherTabRowView
          key={row.label}
          row={row}
          summary={Object.hasOwn(summaries, row.label) ? summaries[row.label] : undefined}
          index={displayed.indexOf(row)}
          selection={selection}
          onFocus={onFocus}
          now={now}
        />
      ))}
    </div>
  );
}
