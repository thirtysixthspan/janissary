// The PDF view's arithmetic, with no React and no PDF engine. It holds only zoom and the fit scale:
// which pages are on screen and which one is most of the view are answered by `IntersectionObserver`,
// and jumping to a page is `Element.scrollIntoView`, so none of that is computed here.

export const ZOOM_STEP = 0.1;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export type PdfLayout = 'single' | 'continuous';

export type PageSize = { width: number; height: number };
export type StageSize = { width: number; height: number };

// The image tab's documented bounds, reused rather than invented a second time: 10% steps, clamped
// to 10%–800%, saturating at either end rather than overshooting.
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 10) / 10));
}

export function stepZoom(zoom: number, steps: number): number {
  return clampZoom(zoom + steps * ZOOM_STEP);
}

// What 100% means, which depends on the layout. Single page fits the whole page inside the stage —
// seeing one page at a time is the layout's point. Continuous scroll fits the page width, so
// scrolling is the only axis that matters.
//
// A stage that has not been measured yet answers 1, so the first frame of a freshly mounted tab
// draws at natural size rather than collapsing to nothing.
export function fitScale(layout: PdfLayout, page: PageSize, stage: StageSize): number {
  if (page.width <= 0 || page.height <= 0 || stage.width <= 0) return 1;
  const byWidth = stage.width / page.width;
  if (layout === 'continuous' || stage.height <= 0) return byWidth;
  return Math.min(byWidth, stage.height / page.height);
}
