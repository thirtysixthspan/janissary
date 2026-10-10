import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFlag } from '@fortawesome/free-regular-svg-icons';
import { faCircle } from '@fortawesome/free-solid-svg-icons';
import { isSummaryEligibleType, type LauncherTabRow } from '@shared/plugins/launcher/shared';
import type { ListRowClick, ListSelection } from '../api';
import { relativeTime } from './time-ago';

// A tab row is navigation rather than a command, so an inactive row focuses on one click — the way
// clicking the tab in the strip does. The host's active fact is authoritative; a remembered position
// may now hold another row after a tier reorder, or be inactive after focus moved elsewhere.
function openOnClick(index: number, active: boolean): ListRowClick {
  return { selected: index, opens: !active };
}

// One tab row: its dot, its name, its unread flag, its relative time, and its status paragraph. The dot
// is the host's own colour for that tab, so a row matches its tab in the strip. A tab with no summary
// yet shows no line at all rather than a placeholder.
export function LauncherTabRowView({ row, summary, index, selection, expanded, onFocus, now }: {
  row: LauncherTabRow;
  summary: string | undefined;
  index: number;
  selection: ListSelection;
  expanded: boolean;
  onFocus(row: LauncherTabRow): void;
  // The moment the rail's own clock is at, rather than the moment this row happens to be drawn at —
  // so an unchanged payload still advances its ages.
  now: number;
}) {
  return (
    <div
      className={`launcher-tab-row${selection.selected === index ? ' selected' : ''}${expanded ? ' expanded' : ''}`}
      style={{ borderLeftColor: row.groupColor }}
      data-index={index}
      data-label={row.label}
      role="option"
      aria-selected={selection.selected === index}
      aria-expanded={summary === undefined ? undefined : expanded}
      onClick={() => { if (selection.rowClicked(index, (at) => openOnClick(at, row.active))) onFocus(row); }}
    >
      <span className="launcher-tab-primary">
        <span className="launcher-dot" style={{ color: row.dotColor }}>
          <FontAwesomeIcon icon={faCircle} />
        </span>
        <span className="launcher-tab-name">{row.title ?? row.label}</span>
        {!isSummaryEligibleType(row.type) && <span className="launcher-tab-type">{row.type}</span>}
        {row.hasUnread && (
          <span className="launcher-tab-flag" role="img" aria-label="unread">
            <FontAwesomeIcon icon={faFlag} />
          </span>
        )}
        <span className="launcher-tab-time">{relativeTime(row.lastActivity, now)}</span>
      </span>
      {isSummaryEligibleType(row.type) && summary !== undefined && <span className="launcher-summary">{summary}</span>}
    </div>
  );
}
