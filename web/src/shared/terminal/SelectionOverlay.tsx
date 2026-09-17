import React from 'react';
import { normalizeRange, rangeSplitForLine, type SelectionLayer } from './terminal-selection-layer';
import type { FrozenScreen } from './terminal-screen-clone';
import { FrozenScreenView } from './FrozenScreenView';

type Properties = { state: SelectionLayer | null; screen: FrozenScreen | null };

// The snapshot drawn as text, for a surface with no rendered screen to clone — a terminal that has
// not opened yet, or a renderer that paints somewhere `cloneNode` cannot follow. The picked run of
// each line is carried by a highlight span, which is the only way to mark a run of text this
// overlay authored itself.
function SelectionRows({ state }: { state: SelectionLayer }) {
  const range = normalizeRange(state.anchor, state.head);
  return state.snapshot.map((line, row) => {
    const [before, picked, after] =
      rangeSplitForLine(line, row, range, state.cells?.[row]) ?? [line, '', ''];
    return (
      <div className="terminal-selection-row" key={row}>
        {before && <span>{before}</span>}
        {picked && <span className="editor-sel">{picked}</span>}
        {after && <span>{after}</span>}
      </div>
    );
  });
}

// The frozen screen: the terminal's own rendered screen, cloned and drawn over the live one with
// the pick highlighted on it. The overlay fills the surface's registered container, so a
// right-click that lands on it still resolves that container's selection.
export function SelectionOverlay({ state, screen }: Properties) {
  if (!state) return null;
  return (
    <div className="terminal-selection-overlay" aria-hidden="true">
      {screen?.node
        ? <FrozenScreenView state={state} screen={screen} />
        : <SelectionRows state={state} />}
    </div>
  );
}
