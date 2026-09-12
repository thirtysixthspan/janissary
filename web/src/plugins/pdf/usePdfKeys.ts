import { useEffect, type RefObject } from 'react';
import type { PdfLayout } from './pdf-view-model';

// One arrow-key scroll step in continuous layout, in pixels. Page Up and Page Down move a whole
// stage height instead, which is what those keys mean in a document.
export const SCROLL_STEP = 80;

const PAGE_KEYS: Record<string, number> = {
  ArrowUp: -1, PageUp: -1, ArrowDown: 1, PageDown: 1,
};

export type PdfKeyHandlers = {
  pageBy(delta: number): void;
  zoomBy(steps: number): void;
  resetZoom(): void;
};

// The PDF tab's keys, deliberately the markdown tab's meanings rather than the image tab's: ↑/↓ and
// Page Up/Page Down move through a document, and a plain wheel scrolls it. Zoom is added beside them
// — the header's controls and Ctrl/Cmd+wheel — rather than on top of them.
//
// A plugin tab stays mounted while hidden, so every binding is gated on the host's own `enabled`
// answer rather than on anything read off the DOM: a hidden PDF tab must swallow no key.
export function usePdfKeys(
  enabled: boolean,
  layout: PdfLayout,
  stageRef: RefObject<HTMLDivElement | null>,
  handlers: PdfKeyHandlers,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); handlers.resetZoom(); return; }
      const direction = PAGE_KEYS[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      if (layout === 'single') { handlers.pageBy(direction); return; }
      const stage = stageRef.current;
      if (!stage) return;
      const distance = event.key.startsWith('Page') ? stage.clientHeight : SCROLL_STEP;
      stage.scrollTop += direction * distance;
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [enabled, handlers, layout, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!enabled || !stage) return;
    // A bare wheel is left alone so the stage scrolls the way a document scrolls; only the zoom
    // chord is intercepted.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      handlers.zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => { stage.removeEventListener('wheel', onWheel); };
  }, [enabled, handlers, stageRef]);
}
