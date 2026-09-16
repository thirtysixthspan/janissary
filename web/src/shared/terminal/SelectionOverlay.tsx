import React from 'react';
import type { RefObject } from 'react';
import { normalizeRange, rangeSplitForLine, type SelectionLayer } from './terminal-selection-layer';

type Properties = { state: SelectionLayer | null; probeRef?: RefObject<HTMLDivElement | null> };

// The probe row's character count: its measured width divided by this is the real per-character
// advance the overlay lays its snapshot out with.
export const PROBE_CHARACTERS = 40;

// The frozen screen: the snapshot's lines drawn as text over the live terminal, with the picked
// run of each line carried by a highlight span. The overlay fills the surface's registered
// container, so a right-click that lands on it still resolves that container's selection. The
// probe row reports back the overlay's own grid metrics, so the mapping that decides which cell
// the pointer is over uses the layout the user is actually dragging across.
export function SelectionOverlay({ state, probeRef }: Properties) {
  if (!state) return null;
  const range = normalizeRange(state.anchor, state.head);
  return (
    <div className="terminal-selection-overlay" aria-hidden="true">
      <div
        className="terminal-selection-probe"
        ref={probeRef}
        aria-hidden="true"
      >{ 'x'.repeat(PROBE_CHARACTERS) }</div>
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
