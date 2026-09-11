import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PdfLoadFailure } from '@shared/plugins/pdf/shared';
import type { TabPluginClientCapabilities } from '../api';
import { loadPdf, type LoadedPdf, type PdfLoadResult } from './pdf-document';
import { usePdfDocument } from './usePdfDocument';

// The one module that touches PDF.js, mocked — which is the whole reason it is a module of its own:
// jsdom has neither a canvas 2D context nor a worker PDF.js could drive.
vi.mock('./pdf-document', () => ({ loadPdf: vi.fn() }));

const load = vi.mocked(loadPdf);

function makeDocument(): LoadedPdf {
  return {
    pageSizes: [{ width: 600, height: 800 }],
    renderPage: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
}

function setup(result: PdfLoadResult) {
  load.mockResolvedValue(result);
  const intent = vi.fn(async () => null);
  const capabilities = { intent } as unknown as TabPluginClientCapabilities;
  const view = renderHook(() => usePdfDocument('/open/ref-1', capabilities));
  return { intent, view };
}

beforeEach(() => { load.mockReset(); });

describe('usePdfDocument', () => {
  it('starts loading and ends ready, reporting nothing', async () => {
    const document = makeDocument();
    const { intent, view } = setup({ ok: true, document });

    expect(view.result.current.status).toBe('loading');
    await waitFor(() => { expect(view.result.current).toEqual({ status: 'ready', document }); });
    expect(intent).not.toHaveBeenCalled();
  });

  it('maps each failure kind to the failed state and one feed report', async () => {
    for (const reason of ['password-protected', 'unreadable', 'other'] as PdfLoadFailure[]) {
      const { intent, view } = setup({ ok: false, reason });

      await waitFor(() => { expect(view.result.current.status).toBe('failed'); });
      expect(intent).toHaveBeenCalledWith('load-failed', { reason });
      expect(intent).toHaveBeenCalledTimes(1);
    }
  });

  it('reports a failure once per tab however often the tab re-renders', async () => {
    const { intent, view } = setup({ ok: false, reason: 'unreadable' });

    await waitFor(() => { expect(view.result.current.status).toBe('failed'); });
    view.rerender();
    view.rerender();

    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('releases a document that resolved after the tab went away', async () => {
    const document = makeDocument();
    const { view } = setup({ ok: true, document });
    view.unmount();

    await waitFor(() => { expect(document.destroy).toHaveBeenCalled(); });
  });

  it('aborts a pending load and ignores its late failure', async () => {
    let resolve!: (result: PdfLoadResult) => void;
    const pending = new Promise<PdfLoadResult>((done) => { resolve = done; });
    const cancelled = vi.fn();
    load.mockImplementation((_url, signal) => {
      signal?.addEventListener('abort', cancelled);
      return pending;
    });
    const intent = vi.fn(async () => null);
    const view = renderHook(() => usePdfDocument('/open/pending', { intent } as unknown as TabPluginClientCapabilities));
    view.unmount();
    expect(cancelled).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: false, reason: 'other' }); });
    expect(intent).not.toHaveBeenCalled();
  });

  it('destroys a loaded document when the tab closes', async () => {
    const document = makeDocument();
    const { view } = setup({ ok: true, document });
    await waitFor(() => { expect(view.result.current.status).toBe('ready'); });
    view.unmount();
    expect(document.destroy).toHaveBeenCalledTimes(1);
  });
});
