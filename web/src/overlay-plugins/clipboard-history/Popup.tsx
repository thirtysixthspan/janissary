import React, { useSyncExternalStore } from 'react';
import type { OverlayPluginItem } from '../api';
import { rows, selection, subscribeToHistory } from './store';

// The clipboard-history popup: the history picker with the history's contents behind it.
//
// Same shape, same anchor, and the same `.picker` markup every other overlay uses, which is why it
// needs no styles of its own. One line per entry — the first line of non-space text, with an ellipsis
// already appended by the display rule when the copy had more than one line. The full text is what
// gets pasted, so nothing is lost by not reading all of it here.
//
// Rows and the selection are read from the store rather than passed in: they are the plugin's own
// state, and it is the one thing the host has no business holding.
type Properties = { choose: (text: string) => void };

export function ClipboardHistoryPopup({ choose }: Properties) {
  const items = useSyncExternalStore(subscribeToHistory, rows, rows);
  const selected = useSyncExternalStore(subscribeToHistory, selection, selection);

  const pick = (row: OverlayPluginItem) => choose(row.text);

  return (
    <div className="picker">
      <div className="picker-title">clipboard</div>
      {items.length === 0 ? (
        <div className="picker-row picker-empty">(no clipboard history)</div>
      ) : (
        items.map((row, index) => (
          <div
            key={row.id}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            onClick={() => pick(row)}
          >
            {row.label}
          </div>
        ))
      )}
    </div>
  );
}
