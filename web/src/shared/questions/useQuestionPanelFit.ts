import { useLayoutEffect } from 'react';
import type React from 'react';
import { fitPanelPercent } from './panel-fit';

// Sizes a question panel to the smallest equal percentage of its layer that fits the content, up to
// 90%. The search reads layout at candidate widths, then the chosen size is applied: the body scrolls
// while the title and footer stay, unless the title and footer fill that size, in which case the
// whole panel fills the layer and scrolls so the question text stays reachable.
export function useQuestionPanelFit({
  layerRef,
  panelRef,
  questionId,
}: {
  layerRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  questionId: string;
}) {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const panel = panelRef.current;
    if (!layer || !panel) return;
    panel.style.pointerEvents = 'auto';

    const measure = () => {
      const layerWidth = layer.clientWidth;
      const layerHeight = layer.clientHeight;
      if (layerWidth === 0 || layerHeight === 0) return;

      const contentHeightAtWidth = (width: number) => {
        panel.style.height = 'auto';
        panel.style.width = `${width}px`;
        return panel.scrollHeight;
      };
      const percent = fitPanelPercent(layerWidth, layerHeight, contentHeightAtWidth);
      const width = layerWidth * percent / 100;
      const fittedHeight = layerHeight * percent / 100;
      const contentHeight = contentHeightAtWidth(width);

      const title = panel.querySelector<HTMLElement>('.modal-title');
      const footer = panel.querySelector<HTMLElement>('.question-panel-footer');
      const fixedHeight = (title?.offsetHeight ?? 0) + (footer?.offsetHeight ?? 0);
      const overflow = contentHeight > layerHeight || fixedHeight >= fittedHeight;

      panel.style.width = `${width}px`;
      panel.style.height = `${overflow ? layerHeight : fittedHeight}px`;
      panel.style.overflowY = overflow ? 'auto' : 'hidden';
      panel.classList.toggle('question-panel--overflow', overflow);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => { observer.disconnect(); };
  }, [layerRef, panelRef, questionId]);
}
