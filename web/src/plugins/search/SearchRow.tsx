import React, { useRef } from 'react';
import type { SearchMatch } from '@shared/plugins/search/shared';
import { splitAtMatch } from './match-window';
import { useMatchWindow, type MeasuredWindow } from './useMatchWindow';

function ContextLine({ text, line }: { text: string; line: number }) {
  return (
    <div className="search-line search-context">
      <span className="search-lineno">{line}</span>
      <span className="search-text">{text}</span>
    </div>
  );
}

// The inline caps a measured window puts on the row, or none at all before there is one — the
// stylesheet's own two-line context cap and uncapped match line are then what shows.
function capsOf(measured: MeasuredWindow | null) {
  if (measured === null) return { above: undefined, below: undefined, clip: undefined, shift: undefined };
  const { window: shown, lineHeight } = measured;
  return {
    above: { maxHeight: `${shown.above * lineHeight}px` },
    below: { maxHeight: `${shown.below * lineHeight}px` },
    clip: { maxHeight: `${shown.count * lineHeight}px` },
    shift: { marginTop: `${-shown.first * lineHeight}px` },
  };
}

// One match: a dimmed header carrying the file path and the line the match is on, then the context
// above it, the match line, and the context below. The context carries its own line numbers, derived
// from the header's and the position within the block, so a reader can see where every line sits
// without the server sending five numbers per row to draw one.
//
// The entry shows two *display* lines either side of the display line holding the match. A match
// line long enough to wrap supplies as many of those as it can itself — clipped to the window around
// the match and shifted to it — and each context block draws only the lines left over, which is none
// on a side the match line filled.
export function SearchRow({ row, index, selected, onClick, onDoubleClick }: {
  row: SearchMatch; index: number; selected: boolean;
  onClick: () => void; onDoubleClick: () => void;
}) {
  const blockRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const measured = useMatchWindow({
    blockRef, markRef, text: row.match, start: row.start, end: row.end,
  });
  const caps = capsOf(measured);
  const [before, match, after] = splitAtMatch(row.match, row.start, row.end);
  const first = row.line - row.above.length;
  return (
    <div
      className={`search-row${selected ? ' selected' : ''}`}
      data-index={index}
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="search-row-header">
        <span className="search-row-path">{row.path}</span>
        <span className="search-row-line">{row.line}</span>
      </div>
      <div className="search-context-block search-context-above" style={caps.above}>
        {row.above.map((text, offset) => (
          <ContextLine key={first + offset} text={text} line={first + offset} />
        ))}
      </div>
      <div className="search-line search-hit">
        <span className="search-lineno">{row.line}</span>
        <span className="search-text search-hit-text" style={caps.clip}>
          <span className="search-hit-block" ref={blockRef} style={caps.shift}>
            {before}
            <span className="search-hit-match" ref={markRef}>{match}</span>
            {after}
          </span>
        </span>
      </div>
      <div className="search-context-block search-context-below" style={caps.below}>
        {row.below.map((text, offset) => (
          <ContextLine key={row.line + 1 + offset} text={text} line={row.line + 1 + offset} />
        ))}
      </div>
    </div>
  );
}
