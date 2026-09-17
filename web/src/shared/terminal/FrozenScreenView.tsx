import React, { useEffect, useRef } from 'react';
import type { FrozenScreen } from './terminal-screen-clone';
import { highlightRects } from './terminal-selection-rects';
import type { SelectionLayer } from './terminal-selection-layer';

type Properties = { state: SelectionLayer; screen: FrozenScreen };

// The cloned screen, held still. The host div carries the terminal root's own class list — the
// renderer scopes every font and colour rule it injects to a class there — and is placed at the
// offset the live screen box had inside the container, so the clone covers exactly what it
// duplicates. `position` is set inline because the terminal's own `.xterm` class would otherwise
// make the host relative.
export function FrozenScreenView({ state, screen }: Properties) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const node = screen.node;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !node) return;
    host.replaceChildren(node);
    return () => host.replaceChildren();
  }, [node]);

  return (
    <>
      <div
        className={screen.ownerClass}
        ref={hostRef}
        style={{ position: 'absolute', left: screen.metrics.offsetLeft, top: screen.metrics.offsetTop }}
      />
      {highlightRects(state, screen.metrics).map((rect) => (
        <div
          key={rect.row}
          className="terminal-selection-highlight"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ))}
    </>
  );
}
