import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist';
import { loadPdf } from './pdf-document';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  InvalidPDFException: class extends Error {},
  PasswordException: class extends Error {},
  ResponseException: class extends Error {},
  TextLayer: vi.fn(),
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
