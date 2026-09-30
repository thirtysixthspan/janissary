import { useLayoutEffect, useState } from 'react';
import { displayLineCount, displayLineOf, matchWindow, type MatchWindow } from './match-window';

export type MeasuredWindow = { window: MatchWindow; lineHeight: number };

type Properties = {
  // The block holding the whole match line, unclipped, and the element wrapping the match in it.
  blockRef: React.RefObject<HTMLElement | null>;
  markRef: React.RefObject<HTMLElement | null>;
  // The row's text and match offsets, which are what change the wrapping when the row is reused.
  text: string;
  start: number;
  end: number;
};

// Measure which wrapped display line of a match line holds the match, and turn that into the window
// the row draws. Only the browser knows where a line wraps, so this reads the laid-out boxes: the
// block's height gives the line's display lines, and the top of the match's first line box, taken
// relative to the block, gives the one it sits on. Both are relative to the block, so shifting the
// block to show the window does not change what the next measurement reads.
//
// Answers null until a usable measurement exists — before the first layout, and wherever nothing is
// laid out at all — and the row then draws exactly what it drew before this existed. Re-measured
// whenever the block resizes, so narrowing the pane re-windows the row.
export function useMatchWindow({ blockRef, markRef, text, start, end }: Properties): MeasuredWindow | null {
  const [measured, setMeasured] = useState<MeasuredWindow | null>(null);

  useLayoutEffect(() => {
    const block = blockRef.current;
    const mark = markRef.current;
    if (!block || !mark) return;
    const measure = () => {
      const lineHeight = pixels(getComputedStyle(block).lineHeight);
      const box = block.getBoundingClientRect();
      if (Number.isNaN(lineHeight) || lineHeight <= 0 || box.height <= 0) {
        setMeasured(null);
        return;
      }
      const lineBox = mark.getClientRects()[0] ?? mark.getBoundingClientRect();
      const next = matchWindow(
        displayLineOf(lineBox.top - box.top, lineHeight),
        displayLineCount(box.height, lineHeight),
      );
      setMeasured((current) => (current !== null && current.lineHeight === lineHeight
        && sameWindow(current.window, next) ? current : { window: next, lineHeight }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(block);
    return () => { observer.disconnect(); };
  }, [blockRef, markRef, text, start, end]);

  return measured;
}

// A computed length in pixels, or NaN for anything else — `normal`, or the empty string an
// environment that computes no style reports.
function pixels(length: string): number {
  return length.endsWith('px') ? Number(length.slice(0, -2)) : NaN;
}

function sameWindow(a: MatchWindow, b: MatchWindow): boolean {
  return a.first === b.first && a.count === b.count && a.above === b.above && a.below === b.below;
}
