import React from 'react';
import type { LoadedPdf } from './pdf-document';
import { fitScale, type PdfLayout } from './pdf-view-model';
import { PdfPage } from './PdfPage';
import { usePdfStageViewport } from './usePdfStageViewport';

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
  onRenderFailure(): void;
  stageRef: React.RefObject<HTMLDivElement | null>;
};

// One stage and one page component, not a path per layout: continuous scroll and single page differ
// only in which pages the stage lists and which fit rule it applies, so the layout toggle changes
// two inputs rather than swapping renderers.
export function PdfStage({
  document: pdf, layout, zoom, page, jump, onVisiblePage, onRenderFailure, stageRef,
}: PdfStageProperties) {
  const size = usePdfStageViewport({
    stageRef, layout, pageCount: pdf.pageSizes.length, jump, onVisiblePage,
  });
  const pageCount = pdf.pageSizes.length;

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
            onFailure={onRenderFailure}
          />
        ))}
      </div>
    </div>
  );
}
