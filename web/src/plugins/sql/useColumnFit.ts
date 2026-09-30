import { useLayoutEffect } from 'react';
import type React from 'react';
import { fitColumns } from './column-fit';

/**
 * Keep the grid's columns fitted to its frame: again whenever the page, the hidden columns, or the
 * cell being edited change, and whenever the frame itself is resized — a dock being dragged wider, or
 * a split pane.
 *
 * The fit runs before paint, so a page never flashes at its full width before it is cut to the
 * frame. Measuring needs a layout, which a test environment without one does not have, so there the
 * grid is left as the table lays it out.
 */
export function useColumnFit({
  frameRef, grid, hidden, editing,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  grid: unknown;
  hidden: readonly string[];
  editing: unknown;
}): void {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const fit = () => fitColumns(frame);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => { observer.disconnect(); };
  }, [frameRef, grid, hidden, editing]);
}
