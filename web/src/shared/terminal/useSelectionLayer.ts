// Janissary's Shift+drag selection layer, bound to one terminal surface.
//
// The pointer listeners here run in the capture phase on the surface's container — before
// xterm's own handlers, which attach inside the container — so the gesture is taken from the
// harness instead of reaching its mouse reporting or its selection service. A drag runs over a
// snapshot of the screen taken at Shift+pointerdown, so nothing the harness draws afterwards can
// move or clear it; window-level move/up listeners follow the drag so a release outside the
// container still ends it.

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import {
  cellFromPoint, layerHolds, layerText, snapshotViewport,
  type Cell, type SelectionLayer,
} from './terminal-selection-layer';

type Options = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  termRef: React.RefObject<Terminal | null>;
  inactive?: boolean;
  exited?: boolean;
};

export type SelectionLayerApi = {
  view: SelectionLayer | null;
  holds: () => boolean;
  text: () => string;
  clear: () => void;
};

export function useSelectionLayer({ containerRef, termRef, inactive = false, exited = false }: Options): SelectionLayerApi {
  const [view, setView] = useState<SelectionLayer | null>(null);
  const stateRef = useRef<SelectionLayer | null>(null);
  const anchorRef = useRef<Cell | null>(null);

  const update = useCallback((next: SelectionLayer | null) => {
    stateRef.current = next;
    setView(next);
  }, []);

  const clear = useCallback(() => update(null), [update]);
  const holds = useCallback(() => layerHolds(stateRef.current), []);
  const text = useCallback(() => layerText(stateRef.current), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cellAt = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term) return null;
      return cellFromPoint(e.clientX, e.clientY, container.getBoundingClientRect(), term.cols, term.rows);
    };
    const extend = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const current = stateRef.current;
      const cell = cellAt(e);
      if (!anchor || !current || !cell) return;
      update({ ...current, head: cell });
    };
    const end = () => {
      anchorRef.current = null;
      globalThis.removeEventListener('pointermove', extend);
      globalThis.removeEventListener('pointerup', end);
    };

    const onDown = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term) return;
      if (e.button === 0 && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        end();
        const anchor = cellFromPoint(e.clientX, e.clientY, container.getBoundingClientRect(), term.cols, term.rows);
        anchorRef.current = anchor;
        update({ snapshot: snapshotViewport(term), anchor, head: anchor });
        globalThis.addEventListener('pointermove', extend);
        globalThis.addEventListener('pointerup', end);
        return;
      }
      if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && layerHolds(stateRef.current)) {
        e.preventDefault();
        e.stopPropagation();
        clear();
      }
    };
    container.addEventListener('pointerdown', onDown, {capture: true});
    return () => {
      container.removeEventListener('pointerdown', onDown, true);
      end();
    };
  }, [containerRef, termRef, clear, update]);

  useEffect(() => {
    if (inactive || exited) clear();
  }, [inactive, exited, clear]);

  const holdingView = view !== null;
  useEffect(() => {
    if (!holdingView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      clear();
    };
    globalThis.addEventListener('keydown', onKey, {capture: true});
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [holdingView, clear]);

  return useMemo(() => ({ view, holds, text, clear }), [view, holds, text, clear]);
}
