import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../api';
import { useMarkdownContent } from './useMarkdownContent';

vi.mock('../api', () => ({ renderMarkdown: vi.fn() }));

function response(text: string): Response {
  return { ok: true, text: () => Promise.resolve(text) } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('# ready')));
  vi.mocked(renderMarkdown).mockImplementation((text) => `<p>${text}</p>`);
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('useMarkdownContent', () => {
  it('aborts the request when the hook unmounts', () => {
    let requestSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_source, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = renderHook(() => useMarkdownContent('/one'));
    expect(requestSignal?.aborted).toBe(false);
    unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it('replaces the URL and ignores a completion from the aborted request', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch).mockImplementation((source) => {
      if (source === '/one') return first.promise;
      return second.promise;
    });
    const { result, rerender } = renderHook(
      ({ source }: { source: string }) => useMarkdownContent(source),
      { initialProps: { source: '/one' } },
    );
    rerender({ source: '/two' });
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => { second.resolve(response('latest')); });
    await waitFor(() => expect(result.current).toEqual({ status: 'loaded-html', html: '<p>latest</p>' }));
    await act(async () => { first.resolve(response('stale')); });
    expect(result.current).toEqual({ status: 'loaded-html', html: '<p>latest</p>' });
  });

  it('returns source text when Markdown parsing fails', async () => {
    vi.mocked(renderMarkdown).mockReturnValue(undefined);
    vi.mocked(fetch).mockResolvedValue(response('<script>plain source</script>'));
    const { result } = renderHook(() => useMarkdownContent('/one'));
    await waitFor(() => expect(result.current).toEqual({
      status: 'loaded-text', text: '<script>plain source</script>',
    }));
  });

  it('returns a failed state when fetching rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMarkdownContent('/one'));
    await waitFor(() => expect(result.current).toEqual({ status: 'failed' }));
  });
});
