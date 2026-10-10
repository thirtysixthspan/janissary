import React from 'react';
import { usePdfPageRender, type PdfPageProperties } from './usePdfPageRender';
export type { PdfPageProperties } from './usePdfPageRender';

// One page: a placeholder sized from what PDF.js reports for it, a canvas, and — for the stage, not
// for a thumbnail — the text layer that makes the page's text selectable and copyable.
//
// A page keeps its canvas once it has been drawn, so a very long document read end to end grows in
// memory until the tab is closed. Releasing a canvas far outside the observed margin is a change
// inside this component if that ever bites.
export function PdfPage({ index, size, scale, text, root, renderPage, onFailure }: PdfPageProperties) {
  const { holderRef, canvasRef, layerRef } = usePdfPageRender({ index, scale, text, root, renderPage, onFailure });

  return (
    <div
      className="pdf-page"
      data-page={index}
      ref={holderRef}
      style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}
    >
      <canvas className="pdf-page-canvas" ref={canvasRef} />
      {text && <div className="pdf-text-layer" ref={layerRef} />}
    </div>
  );
}
