import React, { useEffect, useState } from 'react';
import type { LoadedPdf } from './pdf-document';
import { fitScale, type PdfLayout, type StageSize } from './pdf-view-model';
import { PdfPage } from './PdfPage';

// Breathing room between a page and the stage's edges, taken off the box the fit is computed
// against so a fitted page is not flush with the frame.
const STAGE_PADDING = 16;

export type PdfJump = { page: number; token: number };

export type PdfStageProperties = {
  document: LoadedPdf;
  layout: PdfLayout;
  zoom: number;
  page: number;
  jump: PdfJump;
  onVisiblePage(index: number): void;
  stageRef: React.RefObject<HTMLDivElement | null>;
};

// One stage and one page component, not a path per layout: continuous scroll and single page differ
// only in which pages the stage lists and which fit rule it applies, so the layout toggle changes
// two inputs rather than swapping renderers.
export function PdfStage({
  document: pdf, layout, zoom, page, jump, onVisiblePage, stageRef,
}: PdfStageProperties) {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
  const pageCount = pdf.pageSizes.length;

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (stage) setSize({ width: stage.clientWidth, height: stage.clientHeight });
    };
    measure();
    globalThis.addEventListener('resize', measure);
    return () => { globalThis.removeEventListener('resize', measure); };
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

  const box = {
    width: Math.max(0, size.width - STAGE_PADDING * 2),
    height: Math.max(0, size.height - STAGE_PADDING * 2),
  };
  const indices = layout === 'single'
    ? [Math.min(Math.max(0, page), pageCount - 1)]
    : pdf.pageSizes.map((_size, index) => index);

  return (
    <div className={`plugin-stage pdf-stage pdf-${layout}`} ref={stageRef}>
      {zoom !== 1 && <div className="pdf-zoom-badge">{Math.round(zoom * 100)}%</div>}
      <div className="pdf-pages">
        {indices.map((index) => (
          <PdfPage
            key={index}
            index={index}
            size={pdf.pageSizes[index]}
            scale={fitScale(layout, pdf.pageSizes[index], box) * zoom}
            text
            root={stageRef}
            renderPage={pdf.renderPage}
          />
        ))}
      </div>
    </div>
  );
}
