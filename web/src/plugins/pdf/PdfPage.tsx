import React, { useEffect, useRef, useState } from 'react';
import type { PageSize } from './pdf-view-model';

// How far outside the stage a page starts rendering. The browser answers "is this near the viewport"
// natively, so this plugin keeps no render window and computes no scroll-offset-to-page arithmetic.
const RENDER_MARGIN = '300px';

export type PdfPageProperties = {
  index: number;
  size: PageSize;
  scale: number;
  text: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  renderPage(
    index: number, canvas: HTMLCanvasElement, scale: number, textLayer: HTMLElement | null,
  ): Promise<void>;
};

// One page: a placeholder sized from what PDF.js reports for it, a canvas, and — for the stage, not
// for a thumbnail — the text layer that makes the page's text selectable and copyable.
//
// A page keeps its canvas once it has been drawn, so a very long document read end to end grows in
// memory until the tab is closed. Releasing a canvas far outside the observed margin is a change
// inside this component if that ever bites.
export function PdfPage({ index, size, scale, text, root, renderPage }: PdfPageProperties) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (near || !holder) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { root: root.current, rootMargin: RENDER_MARGIN });
    observer.observe(holder);
    return () => { observer.disconnect(); };
  }, [near, root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas) return;
    // A render superseded by a later one at a different scale rejects; so does a page this document
    // cannot draw. Neither is a broken plugin, so the page simply stays as it was.
    void renderPage(index, canvas, scale, text ? layerRef.current : null).catch(() => {});
  }, [index, near, renderPage, scale, text]);

  return (
    <div
      className="pdf-page"
      data-page={index}
      ref={holderRef}
      style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}
    >
      <canvas className="pdf-page-canvas" ref={canvasRef} />
      {text && <div className="textLayer" ref={layerRef} />}
    </div>
  );
}
