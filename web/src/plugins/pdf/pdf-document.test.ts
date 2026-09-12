import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument, RenderingCancelledException } from 'pdfjs-dist';
import { isRenderCancellation, loadPdf } from './pdf-document';

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
