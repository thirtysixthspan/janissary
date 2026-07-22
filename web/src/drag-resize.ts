import type { MouseEvent as ReactMouseEvent } from 'react';

// Attaches a mouse-drag gesture to the window for the duration of a drag started by a
// `mousedown` handler: `onMove` fires on every `mousemove`, and both listeners remove
// themselves on the following `mouseup`. Shared by every draggable resize divider
// (ReportingSection's height divider, Sidebar's width divider).
export function startDrag(onMove: (e: MouseEvent) => void): void {
  const onUp = () => {
    globalThis.removeEventListener('mousemove', onMove);
    globalThis.removeEventListener('mouseup', onUp);
  };
  globalThis.addEventListener('mousemove', onMove);
  globalThis.addEventListener('mouseup', onUp);
}

// Shared `mousedown` entry point for every resize affordance (the gutter button and the
// border divider it sits alongside): both drive the same `(down, move)` callback shape,
// so a sidebar or reporting section only needs one resize handler regardless of which
// affordance the user grabs.
export function beginResizeDrag(
  down: ReactMouseEvent,
  onResize: (down: ReactMouseEvent, move: MouseEvent) => void,
): void {
  down.preventDefault();
  down.stopPropagation();
  startDrag((move) => onResize(down, move));
}
