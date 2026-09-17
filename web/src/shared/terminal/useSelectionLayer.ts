// Janissary's Shift+drag selection layer, bound to one terminal surface.
//
// The gesture's listeners here run in the capture phase on the surface's container — before
// xterm's own handlers, which attach inside the container — so the gesture is taken from the
// harness instead of reaching its mouse reporting or its selection service. The mouse events
// the harness actually receives — pointerdown, and the mousedown and click its service is bound
// to — are each cut out by a capture-phase listener for the event itself; the guards never
// change state, only suppress. A drag runs over a snapshot of the screen taken at
// Shift+pointerdown, so nothing the harness draws afterwards can move or clear it; window-level
// move/up listeners follow the drag so a release outside the container still ends it.
//
// The snapshot is two things frozen together: the text the pick resolves to, and the screen the
// emulator had rendered, cloned. They are held in one state object because a clone paired with a
// different screenful's text would be a lie about what the highlight covers.

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { freezeTerminalScreen, type FrozenScreen } from './terminal-screen-clone';
import {
  cellFromPoint, layerHolds, layerText, snapshotViewport,
  type Cell, type ScreenMetrics, type SelectionLayer,
} from './terminal-selection-layer';

type Options = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  termRef: React.RefObject<Terminal | null>;
  inactive?: boolean;
  exited?: boolean;
};

type Frozen = { layer: SelectionLayer; screen: FrozenScreen };

export type SelectionLayerApi = {
  view: SelectionLayer | null;
  screen: FrozenScreen | null;
  holds: () => boolean;
  text: () => string;
  clear: () => void;
};

export function useSelectionLayer({ containerRef, termRef, inactive = false, exited = false }: Options): SelectionLayerApi {
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const frozenRef = useRef<Frozen | null>(null);
  const anchorRef = useRef<Cell | null>(null);
  // The grid the drag runs over, taken once with the snapshot: the terminal underneath keeps
  // drawing but cannot move the frozen screen, so re-measuring mid-drag could only introduce drift.
  const metricsRef = useRef<ScreenMetrics | null>(null);

  const update = useCallback((next: Frozen | null) => {
    frozenRef.current = next;
    setFrozen(next);
  }, []);

  const clear = useCallback(() => update(null), [update]);
  const holds = useCallback(() => layerHolds(frozenRef.current?.layer ?? null), []);
  const text = useCallback(() => layerText(frozenRef.current?.layer ?? null), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cellAt = (e: MouseEvent) => {
      const term = termRef.current;
      const metrics = metricsRef.current;
      if (!term || !metrics) return null;
      const rect = container.getBoundingClientRect();
      return cellFromPoint(e.clientX, e.clientY, rect, metrics, term.cols, term.rows);
    };
    const extend = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const current = frozenRef.current;
      const cell = cellAt(e);
      if (!anchor || !current || !cell) return;
      update({ ...current, layer: { ...current.layer, head: cell } });
    };
    const stopListening = () => {
      globalThis.removeEventListener('pointermove', extend);
      globalThis.removeEventListener('pointerup', end);
    };
    const end = (e?: MouseEvent) => {
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
      if (dragging && !layerHolds(frozenRef.current?.layer ?? null)) {
        clear();
        return;
      }
      // A release that picks text opens the same default menu a right-click would, at the
      // point the drag ended: the app's document-level contextmenu listener already resolves
      // this surface's held selection through the terminal-selection registry, so a dispatched
      // event needs no menu plumbing of its own.
      if (dragging && e) {
        container.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
        }));
      }
    };

    const onDown = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term) return;
      if (e.button === 0 && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        end();
        const screen = freezeTerminalScreen(term, container);
        metricsRef.current = screen.metrics;
        const anchor = cellAt(e);
        if (!anchor) return;
        anchorRef.current = anchor;
        term.focus();
        update({ layer: { ...snapshotViewport(term), anchor, head: anchor }, screen });
        globalThis.addEventListener('pointermove', extend);
        globalThis.addEventListener('pointerup', end);
        return;
      }
      // Any overlay on screen is dismissed and consumed by a plain click, even one holding a
      // zero-length range that a release could not unfreeze itself.
      if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && frozenRef.current !== null) {
        e.preventDefault();
        e.stopPropagation();
        clear();
      }
    };
    // xterm binds its selection service and its mouse reporting to mousedown and click, which no
    // pointerdown handler can touch; these guards take the events it actually receives. They
    // mirror the pointerdown handler's branches and never change state.
    const ownsMouse = (e: MouseEvent) => {
      if (e.button !== 0 || !termRef.current) return false;
      const modifiers = !e.ctrlKey && !e.metaKey && !e.altKey;
      return (e.shiftKey && modifiers) || (!e.shiftKey && modifiers && frozenRef.current !== null);
    };
    const onMouseDownOrClick = (e: MouseEvent) => {
      if (!ownsMouse(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    container.addEventListener('pointerdown', onDown, {capture: true});
    container.addEventListener('mousedown', onMouseDownOrClick, {capture: true});
    container.addEventListener('click', onMouseDownOrClick, {capture: true});
    return () => {
      container.removeEventListener('pointerdown', onDown, true);
      container.removeEventListener('mousedown', onMouseDownOrClick, true);
      container.removeEventListener('click', onMouseDownOrClick, true);
      stopListening();
    };
  }, [containerRef, termRef, clear, update]);

  useEffect(() => {
    if (inactive || exited) clear();
  }, [inactive, exited, clear]);

  // Escape is scoped to this surface: a keydown the container receives while an overlay is
  // frozen clears it, and anything outside stays free to use the key however it does.
  const holding = frozen !== null;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !holding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      clear();
    };
    container.addEventListener('keydown', onKey, {capture: true});
    return () => container.removeEventListener('keydown', onKey, true);
  }, [containerRef, holding, clear]);

  return useMemo(
    () => ({ view: frozen?.layer ?? null, screen: frozen?.screen ?? null, holds, text, clear }),
    [frozen, holds, text, clear],
  );
}
