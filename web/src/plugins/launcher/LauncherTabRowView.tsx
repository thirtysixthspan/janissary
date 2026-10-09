import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFlag } from '@fortawesome/free-regular-svg-icons';
import type { LauncherTabRow } from '@shared/plugins/launcher/shared';
import type { ListRowClick, ListSelection } from '../api';
import { relativeTime } from './time-ago';

function openOnConfirm(index: number, confirmed: number | null): ListRowClick {
  return { selected: index, opens: confirmed === index };
}

// One tab row: its dot, its name, its unread flag, its relative time, and its status paragraph. The dot
// is the host's own colour for that tab, so a row matches its tab in the strip.
//
// The summary is clamped by the stylesheet to three lines and expands to eight while the pointer is over
// the row, so a long paragraph is never cut off — only held short until it is wanted. A tab with no
// summary yet shows no line at all rather than a placeholder.
export function LauncherTabRowView({ row, summary, index, selection, onFocus }: {
  row: LauncherTabRow;
  summary: string | undefined;
  index: number;
  selection: ListSelection;
  onFocus(row: LauncherTabRow): void;
}) {
  const [hovered, setHovered] = useState(false);
  // Where the card should draw, measured from the row it describes. The row scrolls inside the list, so
  // the card is fixed-positioned against the viewport and re-measured on each hover.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = (event: React.MouseEvent<HTMLDivElement>): void => {
    setAnchor(event.currentTarget.getBoundingClientRect());
    setHovered(true);
  };
  return (
    <div
      className={`launcher-tab-row${selection.selected === index ? ' selected' : ''}${hovered ? ' hovered' : ''}`}
      data-index={index}
      data-label={row.label}
      role="option"
      aria-selected={selection.selected === index}
      onClick={() => { if (selection.rowClicked(index, openOnConfirm)) onFocus(row); }}
      onMouseEnter={show}
      onMouseLeave={() => { setHovered(false); setAnchor(null); }}
    >
      <span className="launcher-tab-primary">
        <span className={`launcher-dot${row.busy ? ' busy' : ''}`} style={{ color: row.dotColor }} />
        <span className="launcher-tab-name">{row.title ?? row.label}</span>
        {row.hasUnread && (
          <span className="launcher-tab-flag" role="img" aria-label="unread">
            <FontAwesomeIcon icon={faFlag} />
          </span>
        )}
        <span className="launcher-tab-time">{relativeTime(row.lastActivity)}</span>
      </span>
      {summary !== undefined && <span className="launcher-summary">{summary}</span>}
      {hovered && anchor !== null && <LauncherHoverCard row={row} anchor={anchor} />}
    </div>
  );
}

// What a hover adds: the label, where it is working, and the last command it ran. All three already
// arrive in the payload, so the card is this view's own and adds no host call. It is drawn fixed against
// the viewport just below the row it describes, so the list's own scroll container cannot clip it — the
// row scrolls, and a card positioned inside the scrolling subtree would be cut off at its edge.
function LauncherHoverCard({ row, anchor }: { row: LauncherTabRow; anchor: DOMRect }) {
  return (
    <span
      className="launcher-hover"
      role="tooltip"
      style={{ top: `${anchor.bottom + 4}px`, left: `${anchor.left}px` }}
    >
      <span className="launcher-hover-label">{row.title ?? row.label}</span>
      <span className="launcher-hover-cwd">{row.cwd}</span>
      {row.remote !== undefined && <span className="launcher-hover-remote">{row.remote}</span>}
      {row.lastCommand !== undefined && <span className="launcher-hover-command">{row.lastCommand}</span>}
    </span>
  );
}
