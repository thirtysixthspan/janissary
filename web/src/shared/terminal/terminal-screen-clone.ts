import type { Terminal } from '@xterm/xterm';
import type { ScreenMetrics } from './terminal-selection-layer';

// The frozen screen's own pixels. The selection overlay does not re-draw the terminal's text — it
// clones the screen the emulator already rendered, so the colours, the bold and dim runs, the
// inverse video, the cursor, and the exact per-cell advance of the live screen are the overlay's
// by construction rather than by a stylesheet of ours kept in step with the terminal's options.
//
// This works because the terminal is built with no renderer addon, which leaves xterm on its DOM
// renderer: `.xterm-screen` holds one `div` per row of `span`s, and every rule that paints them is
// scoped to an owner class the renderer puts on the terminal's root element. Carrying that class
// onto the overlay is what makes the clone render the same outside the terminal's own element.

// The clone and the grid it sits on, taken together at the moment the drag starts. A null node
// means there was no rendered screen to clone and the overlay falls back to drawing the snapshot's
// text; the metrics are still the surface's best account of the grid.
export type FrozenScreen = { node: Element | null; ownerClass: string; metrics: ScreenMetrics };

const SCREEN_SELECTOR = '.xterm-screen';
const ROWS_SELECTOR = '.xterm-rows';
const BLINK_SELECTOR = '.xterm-cursor-blink';

// The terminal's root element and the screen box inside it, or nothing when there is no screen
// worth cloning. A renderer that paints to a canvas leaves no rows behind, and its canvases clone
// blank, so the row container's absence is what rules the clone out.
function renderedScreen(term: Terminal): { root: HTMLElement; screen: HTMLElement } | null {
  const root = term.element;
  if (!root) return null;
  const screen = root.querySelector(SCREEN_SELECTOR);
  if (!(screen instanceof HTMLElement) || !screen.querySelector(ROWS_SELECTOR)) return null;
  return { root, screen };
}

// The grid as the container knows it: the fallback for a surface with no rendered screen, and the
// arithmetic the layer used before the screen element could answer for itself.
function containerMetrics(term: Terminal, container: HTMLElement): ScreenMetrics {
  const rect = container.getBoundingClientRect();
  return {
    cellWidth: term.cols > 0 ? rect.width / term.cols : 0,
    cellHeight: term.rows > 0 ? rect.height / term.rows : 0,
    offsetLeft: 0,
    offsetTop: 0,
  };
}

// The screen as it stands, deep-cloned and detached from the terminal that drew it.
function cloneScreen(screen: HTMLElement): HTMLElement {
  const node = screen.cloneNode(true) as HTMLElement;
  // The renderer parks its theme and dimension stylesheets inside the screen element. They apply
  // document-wide from where the originals already are, so the clone's copies would only duplicate
  // every rule in them.
  for (const style of node.querySelectorAll('style')) style.remove();
  // A still image must not blink: the cursor keeps the shape and colour it had, without the
  // animation the renderer's keyframes would otherwise keep running over a frozen screen.
  for (const cursor of node.querySelectorAll(BLINK_SELECTOR)) {
    cursor.classList.remove('xterm-cursor-blink');
  }
  return node;
}

// Freeze the terminal's screen for the duration of a selection. The cell size comes from the
// screen element's own box over the terminal's `cols`/`rows` — exactly the figures xterm derives
// its own cell dimensions from — and the offsets place that box inside the surface's container, so
// the overlay paints the clone where the screen was and resolves the pointer against the same grid.
export function freezeTerminalScreen(term: Terminal, container: HTMLElement): FrozenScreen {
  const rendered = renderedScreen(term);
  if (!rendered) return { node: null, ownerClass: '', metrics: containerMetrics(term, container) };
  const screenRect = rendered.screen.getBoundingClientRect();
  if (screenRect.width <= 0 || screenRect.height <= 0 || term.cols <= 0 || term.rows <= 0) {
    return { node: null, ownerClass: '', metrics: containerMetrics(term, container) };
  }
  const containerRect = container.getBoundingClientRect();
  return {
    node: cloneScreen(rendered.screen),
    ownerClass: rendered.root.className,
    metrics: {
      cellWidth: screenRect.width / term.cols,
      cellHeight: screenRect.height / term.rows,
      offsetLeft: screenRect.left - containerRect.left,
      offsetTop: screenRect.top - containerRect.top,
    },
  };
}
