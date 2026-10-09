import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFlag } from '@fortawesome/free-regular-svg-icons';
import type { LauncherTabRow } from '@shared/plugins/launcher/shared';
import type { ListRowClick, ListSelection } from '../api';
import { relativeTime } from './time-ago';

// The rail's default dot colour, used until a row carries its own. The tab's dot is the host's palette
// choice and the row is where it arrives; this is only what a row with no colour reads as.
const RAIL_DOT = '#8b95a5';

function openOnConfirm(index: number, confirmed: number | null): ListRowClick {
  return { selected: index, opens: confirmed === index };
}

// One tab row: its dot, its name, its unread flag, its relative time, and its status paragraph. The dot
// is the host's own colour for that tab, so a row matches its tab in the strip.
//
// The summary is clamped by the stylesheet to three lines and expands to eight while the pointer is
// over the row, so a long paragraph is never cut off — only held short until it is wanted. A tab with
// no summary yet shows no line at all rather than a placeholder.
export function LauncherTabRowView({ row, summary, index, selection, onFocus }: {
  row: LauncherTabRow;
  summary: string | undefined;
  index: number;
  selection: ListSelection;
  onFocus(row: LauncherTabRow): void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`launcher-tab-row${selection.selected === index ? ' selected' : ''}${hovered ? ' hovered' : ''}`}
      data-index={index}
      data-label={row.label}
      role="option"
      aria-selected={selection.selected === index}
      onClick={() => { if (selection.rowClicked(index, openOnConfirm)) onFocus(row); }}
      onMouseEnter={() => { setHovered(true); }}
      onMouseLeave={() => { setHovered(false); }}
    >
      <span className="launcher-tab-primary">
        <span className={`launcher-dot${row.busy ? ' busy' : ''}`} style={{ color: RAIL_DOT }} />
        <span className="launcher-tab-name">{row.title ?? row.label}</span>
        {row.hasUnread && (
          <span className="launcher-tab-flag" role="img" aria-label="unread">
            <FontAwesomeIcon icon={faFlag} />
          </span>
        )}
        <span className="launcher-tab-time">{relativeTime(row.lastActivity)}</span>
      </span>
      {summary !== undefined && <span className="launcher-summary">{summary}</span>}
      {hovered && <LauncherHoverCard row={row} />}
    </div>
  );
}

// What a hover adds: the label, where it is working, and the last command it ran. All three already
// arrive in the payload, so the card is this view's own and adds no host call.
function LauncherHoverCard({ row }: { row: LauncherTabRow }) {
  return (
    <span className="launcher-hover" role="tooltip">
      <span className="launcher-hover-label">{row.title ?? row.label}</span>
      <span className="launcher-hover-cwd">{row.cwd}</span>
      {row.remote !== undefined && <span className="launcher-hover-remote">{row.remote}</span>}
      {row.lastCommand !== undefined && <span className="launcher-hover-command">{row.lastCommand}</span>}
    </span>
  );
}
