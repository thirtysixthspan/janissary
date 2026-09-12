import {
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  RenderingCancelledException,
  ResponseException,
  TextLayer,
  getDocument,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfLoadFailure } from '@shared/plugins/pdf/shared';
import type { PageSize } from './pdf-view-model';

// The only module that touches PDF.js. Everything else in this plugin is reachable with this one
// mocked, which is what makes the rest testable: client tests run in jsdom, which has neither a
// canvas 2D context nor a worker PDF.js could drive.

// Emitted into the bundle by Vite rather than fetched from a CDN, so the viewer keeps working
// offline and behind a proxy.
GlobalWorkerOptions.workerSrc = workerUrl;

// The character maps and standard font data are emitted beside the app's own assets by
// `web/vite.config.ts` and resolved against the document's base URL, so they come from this server's
// own origin at whatever path the window was opened at.
function bundledAssets(directory: string): string {
  return new URL(`pdfjs/${directory}/`, document.baseURI).href;
}

export type LoadedPdf = {
  pageSizes: readonly PageSize[];
  renderPage(
    index: number, canvas: HTMLCanvasElement, scale: number, textLayer: HTMLElement | null,
  ): Promise<void>;
  destroy(): void;
};

export type PdfLoadResult =
  | { ok: true; document: LoadedPdf }
  | { ok: false; reason: PdfLoadFailure };

export function isRenderCancellation(error: unknown): boolean {
  return error instanceof RenderingCancelledException;
}

// The closed set the notifications feed's wording is keyed on. An encrypted document is reported and
// never negotiated — there is no password prompt.
function failureKind(error: unknown): PdfLoadFailure {
  if (error instanceof PasswordException) return 'password-protected';
  if (error instanceof InvalidPDFException || error instanceof ResponseException) return 'unreadable';
  return 'other';
}

// A page can be drawn into more than one canvas at once — the stage and the thumbnail strip both
// show it — so a render in flight is tracked against its canvas rather than its page. Starting a
// second render into the same canvas cancels the first, which is what keeps a canvas from being
// painted at a scale the view has already moved on from.
const renders = new WeakMap<HTMLCanvasElement, RenderTask>();

async function drawPage(
  page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, textLayer: HTMLElement | null,
): Promise<void> {
  renders.get(canvas)?.cancel();
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const task = page.render({ canvas, viewport });
  renders.set(canvas, task);
  await task.promise;
  if (!textLayer) return;
  // The geometry comes from the stylesheet `pdfjs-dist` ships; the scale it reads is the only thing
  // this plugin has to supply.
  textLayer.replaceChildren();
  textLayer.style.setProperty('--total-scale-factor', String(scale));
  await new TextLayer({
    textContentSource: page.streamTextContent(), container: textLayer, viewport,
  }).render();
}

export async function loadPdf(url: string, signal?: AbortSignal): Promise<PdfLoadResult> {
  let destroy: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const task = getDocument({
      url,
      cMapUrl: bundledAssets('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: bundledAssets('standard_fonts'),
    });
    let destroyed = false;
    destroy = () => {
      if (destroyed) return;
      destroyed = true;
      void task.destroy().catch(() => {});
    };
    signal?.addEventListener('abort', destroy, { once: true });
    const pdf = await task.promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, (_unused, index) => pdf.getPage(index + 1)),
    );
    // Every page's size up front, so page placeholders can be laid out for the whole document from
    // the first frame: the scrollbar is honest and a jump from the thumbnail strip lands correctly.
    const pageSizes = pages.map((page) => {
      const { width, height } = page.getViewport({ scale: 1 });
      return { width, height };
    });
    return {
      ok: true,
      document: {
        pageSizes,
        renderPage: (index, canvas, scale, textLayer) =>
          drawPage(pages[index], canvas, scale, textLayer),
        // Tearing down the loading task is what aborts the outstanding network requests and
        // releases the worker; the proxy itself has no teardown of its own.
        destroy,
      },
    };
  } catch (error) {
    destroy?.();
    return { ok: false, reason: failureKind(error) };
  } finally {
    if (destroy) signal?.removeEventListener('abort', destroy);
  }
}
