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
import { PROBE_CHARACTERS } from './SelectionOverlay';
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
  probeRef: React.RefObject<HTMLDivElement | null>;
};

export function useSelectionLayer({ containerRef, termRef, inactive = false, exited = false }: Options): SelectionLayerApi {
  const [view, setView] = useState<SelectionLayer | null>(null);
  const stateRef = useRef<SelectionLayer | null>(null);
  const anchorRef = useRef<Cell | null>(null);
  // Fed to SelectionOverlay's probe row by the surface that renders it, and measured here so the
  // mapping runs over the grid the user actually drags across.
  const probeRef = useRef<HTMLDivElement | null>(null);

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

    // The overlay's own DOM reports the grid the user is actually dragging across: the probe
    // row's measured width per known character is the real per-character advance and its height
    // the real per-row height. Before the overlay has laid out — no probe, nothing measurable —
    // the container box divided by the terminal's grid is the fallback.
    const grid = () => {
      const rect = container.getBoundingClientRect();
      const probe = probeRef.current;
      if (probe) {
        const measured = probe.getBoundingClientRect();
        if (measured.width > 0 && measured.height > 0) {
          return { rect, cellWidth: measured.width / PROBE_CHARACTERS, cellHeight: measured.height };
        }
      }
      const term = termRef.current;
      if (!term) return null;
      return { rect, cellWidth: rect.width / term.cols, cellHeight: rect.height / term.rows };
    };
    const cellAt = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term) return null;
      const gridMetrics = grid();
      if (!gridMetrics) return null;
      return cellFromPoint(e.clientX, e.clientY, gridMetrics.rect, gridMetrics.cellWidth, gridMetrics.cellHeight, term.cols, term.rows);
    };
    const extend = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const current = stateRef.current;
      const cell = cellAt(e);
      if (!anchor || !current || !cell) return;
      update({ ...current, head: cell });
    };
    const stopListening = () => {
      globalThis.removeEventListener('pointermove', extend);
      globalThis.removeEventListener('pointerup', end);
    };
    const end = () => {
      // Only a released gesture can have picked nothing; the effect's own teardown must not
      // unfreeze a held (even zero-length) overlay.
      let dragging = false;
      if (anchorRef.current !== null) {
        dragging = true;
        anchorRef.current = null;
      }
      stopListening();
      // A released gesture that never left its starting cell picked nothing, and leaving it
      // on screen would freeze the terminal behind an overlay with no highlight to explain it.
      if (dragging && !layerHolds(stateRef.current)) clear();
    };

    const onDown = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term) return;
      if (e.button === 0 && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        end();
        const gridMetrics = grid();
        const anchor = gridMetrics
          ? cellFromPoint(e.clientX, e.clientY, gridMetrics.rect, gridMetrics.cellWidth, gridMetrics.cellHeight, term.cols, term.rows)
          : null;
        if (!anchor) return;
        anchorRef.current = anchor;
        update({ snapshot: snapshotViewport(term), anchor, head: anchor });
        globalThis.addEventListener('pointermove', extend);
        globalThis.addEventListener('pointerup', end);
        return;
      }
      // Any overlay on screen is dismissed and consumed by a plain click, even one holding a
      // zero-length range that a release could not unfreeze itself.
      if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && stateRef.current !== null) {
        e.preventDefault();
        e.stopPropagation();
        clear();
      }
    };
    container.addEventListener('pointerdown', onDown, {capture: true});
    return () => {
      container.removeEventListener('pointerdown', onDown, true);
      stopListening();
    };
  }, [containerRef, termRef, clear, update]);

  useEffect(() => {
    if (inactive || exited) clear();
  }, [inactive, exited, clear]);

  // Escape is scoped to this surface: a keydown the container receives while an overlay is
  // frozen clears it, and anything outside stays free to use the key however it does.
  const holdingView = view !== null;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !holdingView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      clear();
    };
    container.addEventListener('keydown', onKey, {capture: true});
    return () => container.removeEventListener('keydown', onKey, true);
  }, [containerRef, holdingView, clear]);

  return useMemo(() => ({ view, holds, text, clear, probeRef }), [view, holds, text, clear]);
}
