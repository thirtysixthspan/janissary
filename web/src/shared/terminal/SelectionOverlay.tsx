import React from 'react';
import { normalizeRange, rangeSplitForLine, type SelectionLayer } from './terminal-selection-layer';

type Properties = { state: SelectionLayer | null };

// The frozen screen: the snapshot's lines drawn as text over the live terminal, with the picked
// run of each line carried by a highlight span. The overlay fills the surface's registered
// container, so a right-click that lands on it still resolves that container's selection.
export function SelectionOverlay({ state }: Properties) {
  if (!state) return null;
  const range = normalizeRange(state.anchor, state.head);
  return (
    <div className="terminal-selection-overlay" aria-hidden="true">
      {state.snapshot.map((line, row) => {
        const [before, picked, after] = rangeSplitForLine(line, row, range) ?? [line, '', ''];
        return (
          <div className="terminal-selection-row" key={row}>
            {before && <span>{before}</span>}
            {picked && <span className="editor-sel">{picked}</span>}
            {after && <span>{after}</span>}
          </div>
        );
      })}
    </div>
  );
}
