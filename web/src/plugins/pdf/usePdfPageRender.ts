import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { PageSize } from './pdf-view-model';
import { isRenderCancellation } from './pdf-document';

const RENDER_MARGIN = '300px';

export type PdfPageProperties = {
  index: number;
  size: PageSize;
  scale: number;
  text: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  onFailure?(): void;
  renderPage(
    index: number, canvas: HTMLCanvasElement, scale: number, textLayer: HTMLElement | null,
  ): Promise<void>;
};

type Params = Pick<PdfPageProperties, 'index' | 'scale' | 'text' | 'root' | 'onFailure' | 'renderPage'>;

export function usePdfPageRender({ index, scale, text, root, renderPage, onFailure }: Params) {
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
    let live = true;
    void renderPage(index, canvas, scale, text ? layerRef.current : null).catch((error: unknown) => {
      if (live && !isRenderCancellation(error)) onFailure?.();
    });
    return () => { live = false; };
  }, [index, near, onFailure, renderPage, scale, text]);

  return { holderRef, canvasRef, layerRef };
}
