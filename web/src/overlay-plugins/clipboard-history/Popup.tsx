import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { rows, selection, subscribeToHistory, type ClipboardHistoryRow } from './store';

// The clipboard-history popup: the history picker with the history's contents behind it.
//
// Same shape, same anchor, and the same `.picker` markup every other overlay uses, which is why it
// needs so little styling of its own. One line per entry — the first line of non-space text, with a
// `(N lines)` postfix beside it when the copy had more than one line. The full text is what gets pasted,
// so nothing is lost by not reading all of it here, and the postfix is never part of it. A line too long
// for the overlay is clipped by CSS on the label, before the postfix, the way the editor's find rows clip
// theirs.
//
// Rows and the selection are read from the store rather than passed in: they are the plugin's own
// state, and it is the one thing the host has no business holding.
type Properties = { choose: (text: string) => void };

export function ClipboardHistoryPopup({ choose }: Properties) {
  const items = useSyncExternalStore(subscribeToHistory, rows, rows);
  const selected = useSyncExternalStore(subscribeToHistory, selection, selection);
  const rootRef = useRef<HTMLDivElement>(null);

  // The popup takes the keyboard as it appears, so the arrows move its selection on every tab rather
  // than the caret of an editor or the cursor of a terminal underneath it. Its keys still reach the
  // window key handler by bubbling, which is what routes them to the plugin's `onKey`. Where the
  // keyboard was is recorded by the seam as the overlay opens, and given back when the plugin closes.
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);

  const pick = (row: ClipboardHistoryRow) => choose(row.text);

  return (
    <div className="picker clipboard-history" ref={rootRef} tabIndex={-1}>
      <div className="picker-title">clipboard</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no clipboard history)</div>
      ) : (
        items.map((row, index) => (
          <div
            key={row.id}
            className={`picker-row clipboard-history-row${index === selected ? ' selected' : ''}`}
            onClick={() => pick(row)}
          >
            <span className="clipboard-history-label">{row.label}</span>
            {row.postfix && <span className="clipboard-history-lines">{row.postfix}</span>}
          </div>
        ))
      )}
    </div>
  );
}
