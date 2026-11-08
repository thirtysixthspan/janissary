import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument, RenderingCancelledException } from 'pdfjs-dist';
import { isRenderCancellation, loadPdf, type LoadedPdf } from './pdf-document';

const textRender = vi.hoisted(() => vi.fn());

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  InvalidPDFException: class extends Error {},
  PasswordException: class extends Error {},
  ResponseException: class extends Error {},
  RenderingCancelledException: class extends Error {},
  TextLayer: class { render = textRender; },
  getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }));

beforeEach(() => { vi.clearAllMocks(); });

describe('PDF loading task ownership', () => {
  it('destroys the loading task immediately when a pending load is aborted', async () => {
    let reject!: (error: Error) => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
    const promise = new Promise<never>((_resolve, fail) => { reject = fail; });
    const destroy = vi.fn(async () => { reject(new Error('aborted')); });
    vi.mocked(getDocument).mockReturnValue({ promise, destroy } as unknown as ReturnType<typeof getDocument>);
    const controller = new AbortController();
    const result = loadPdf('/pending.pdf', controller.signal);
    controller.abort();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(await result).toEqual({ ok: false, reason: 'other' });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('never starts a task for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await loadPdf('/cancelled.pdf', controller.signal)).toEqual({ ok: false, reason: 'other' });
    expect(getDocument).not.toHaveBeenCalled();
  });
});

describe('PDF page rendering', () => {
  it.each(['canvas', 'text'])('propagates %s failures to the caller', async (phase) => {
    const failure = new Error(`broken ${phase}`);
    const page = {
      getViewport: () => ({ width: 600, height: 800 }),
      render: () => ({ promise: phase === 'canvas' ? Promise.reject(failure) : Promise.resolve(), cancel: vi.fn() }),
      streamTextContent: vi.fn(),
    };
    textRender.mockRejectedValue(failure);
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: async () => page }),
      destroy: vi.fn(async () => {}),
    } as unknown as ReturnType<typeof getDocument>);
    const result = await loadPdf('/broken.pdf');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('fixture failed to load');
    await expect(result.document.renderPage(0, document.createElement('canvas'), 1, document.createElement('div'))).rejects.toBe(failure);
    result.document.destroy();
  });

  it('recognizes PDF.js render cancellation without swallowing ordinary errors', () => {
    expect(isRenderCancellation(new RenderingCancelledException('cancelled', 0))).toBe(true);
    expect(isRenderCancellation(new Error('render failed'))).toBe(false);
  });
});

function pdfPage(
  items: unknown[],
  convertToViewportPoint = vi.fn((_x: number, y: number) => [0, y]),
) {
  return {
    getViewport: () => ({ width: 600, height: 800, convertToViewportPoint }),
    getTextContent: vi.fn(async () => ({ items })),
  };
}

async function loadPages(pages: unknown[]): Promise<LoadedPdf> {
  vi.mocked(getDocument).mockReturnValue({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (number: number) => pages[number - 1],
    }),
    destroy: vi.fn(async () => {}),
  } as unknown as ReturnType<typeof getDocument>);
  const result = await loadPdf('/text.pdf');
  if (!result.ok) throw new Error('fixture failed to load');
  return result.document;
}

describe('PDF page text', () => {
  it('reads the 0-based page through the scale-1 viewport', async () => {
    const first = pdfPage([
      { str: 'first page', hasEOL: false, transform: [1, 0, 0, 1, 0, 0] },
    ]);
    const convert = vi.fn((_x: number, _y: number) => [10, 200]);
    const second = pdfPage([
      { str: 'Hello', hasEOL: true, transform: [1, 0, 0, 1, 30, 90] },
      { str: 'world', hasEOL: false, transform: [1, 0, 0, 1, 45, 90] },
    ], convert);

    const document_ = await loadPages([first, second]);

    expect(await document_.readPageText(1)).toEqual([
      { text: 'Hello', hasEOL: true, top: 200 / 800 },
      { text: 'world', hasEOL: false, top: 200 / 800 },
    ]);
    expect(convert).toHaveBeenCalledWith(30, 90);
    expect(convert).toHaveBeenCalledWith(45, 90);
    expect(first.getTextContent).not.toHaveBeenCalled();
    document_.destroy();
  });

  it('skips an item with no string', async () => {
    const document_ = await loadPages([
      pdfPage([
        { type: 'beginMarkedContent', id: 'span' },
        { str: 'Visible', hasEOL: false, transform: [1, 0, 0, 1, 0, 40] },
      ]),
    ]);

    expect(await document_.readPageText(0)).toEqual([
      { text: 'Visible', hasEOL: false, top: 40 / 800 },
    ]);
  });

  it('takes the top from the converted y rather than the transform y', async () => {
    const convert = vi.fn((_x: number, _y: number) => [0, 640]);
    const document_ = await loadPages([
      pdfPage([{ str: 'Rotated', hasEOL: false, transform: [0, 1, -1, 0, 12, 432] }], convert),
    ]);

    expect(await document_.readPageText(0)).toEqual([
      { text: 'Rotated', hasEOL: false, top: 640 / 800 },
    ]);
  });

  it('propagates a rejected text read instead of failing the document', async () => {
    const failure = new Error('text unavailable');
    const document_ = await loadPages([{
      getViewport: () => ({ width: 600, height: 800, convertToViewportPoint: vi.fn() }),
      getTextContent: vi.fn(async () => { throw failure; }),
    }]);

    expect(document_.pageSizes).toEqual([{ width: 600, height: 800 }]);
    await expect(document_.readPageText(0)).rejects.toBe(failure);
  });

  it('returns an empty array for a page with no items', async () => {
    const document_ = await loadPages([pdfPage([])]);

    expect(await document_.readPageText(0)).toEqual([]);
  });
});
