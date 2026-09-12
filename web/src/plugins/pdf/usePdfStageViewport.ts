import { useEffect, useLayoutEffect, useState } from 'react';
import type { PdfLayout, StageSize } from './pdf-view-model';

// The jump input the scroll-sync effect needs, declared structurally so this module never imports
// the component that owns the public `PdfJump` type.
type StageJump = { page: number; token: number };

// Stage measurement and visible-page tracking for the PDF stage: the resize subscription with its
// duplicate-size suppression, the intersection-ratio ranking of the most-visible page while
// scrolling, and the token-driven scroll to a jumped-to page. Owns the measured size and returns
// it; the component renders from it.
export function usePdfStageViewport({
  stageRef, layout, pageCount, jump, onVisiblePage,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  layout: PdfLayout;
  pageCount: number;
  jump: StageJump;
  onVisiblePage(index: number): void;
}): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      setSize((current) => current.width === width && current.height === height
        ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => { observer.disconnect(); };
  }, [stageRef]);

  // Which page is most of the view, answered natively rather than by scroll arithmetic. Single-page
  // layout already knows — it shows one page — so the observer runs only while scrolling.
  useEffect(() => {
    const stage = stageRef.current;
    if (layout !== 'continuous' || !stage) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        ratios.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio);
      }
      let best = -1;
      let bestRatio = 0;
      for (const [index, ratio] of ratios) {
        if (ratio <= bestRatio) continue;
        bestRatio = ratio;
        best = index;
      }
      if (best >= 0) onVisiblePage(best);
    }, { root: stage, threshold: [0, 0.25, 0.5, 0.75, 1] });
    for (const element of stage.querySelectorAll('.pdf-page')) observer.observe(element);
    return () => { observer.disconnect(); };
  }, [layout, onVisiblePage, pageCount, stageRef]);

  // A jump carries a token rather than only a page number, so clicking the thumbnail of the page you
  // are already on still scrolls to it. Single-page layout needs no scroll: it re-lists one page.
  useEffect(() => {
    const stage = stageRef.current;
    if (layout !== 'continuous' || !stage) return;
    stage.querySelector(`.pdf-page[data-page="${CSS.escape(String(jump.page))}"]`)
      ?.scrollIntoView({ block: 'start' });
  }, [jump, layout, stageRef]);

  return size;
}
