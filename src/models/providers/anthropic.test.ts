import { describe, expect, it, vi } from 'vitest';
import { fetchAnthropicModels } from './anthropic.js';

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe('fetchAnthropicModels', () => {
  it('walks pages by last_id and sends the required headers', async () => {
    const requests: { url: URL; init: RequestInit | undefined }[] = [];
    const pages = [
      { data: [{ id: 'claude-a', display_name: 'Claude A' }], has_more: true, last_id: 'cursor-a' },
      { data: [{ id: 'claude-b', display_name: 'Claude B' }], has_more: false },
    ];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: new URL(String(input)), init });
      const page = pages.shift();
      if (page === undefined) throw new Error('unexpected extra page');
      return jsonResponse(page);
    });

    await expect(fetchAnthropicModels(new AbortController().signal, { apiKey: 'secret', fetcher })).resolves.toEqual({
      status: 'ok', records: [
        { id: 'claude-a', name: 'Claude A' },
        { id: 'claude-b', name: 'Claude B' },
      ],
    });
    expect(requests.map(({ url }) => url.searchParams.get('after_id'))).toEqual([null, 'cursor-a']);
    expect(requests[0]?.init).toMatchObject({
      method: 'GET',
      headers: { 'x-api-key': 'secret', 'anthropic-version': '2023-06-01' },
    });
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('skips without a key without calling fetch', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchAnthropicModels(new AbortController().signal, { apiKey: '', fetcher })).resolves.toEqual({
      status: 'skipped', reason: 'ANTHROPIC_API_KEY is not set',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails malformed pages, non-advancing cursors, and duplicate ids without partial records', async () => {
    const malformed = vi.fn<typeof fetch>(async () => jsonResponse({ data: [], has_more: true, last_id: '' }));
    await expect(fetchAnthropicModels(new AbortController().signal, { apiKey: 'secret', fetcher: malformed })).resolves.toEqual({
      status: 'failed', reason: 'Anthropic pagination cursor did not advance',
    });

    const duplicatePages = [
      { data: [{ id: 'same', display_name: 'Same' }], has_more: true, last_id: 'next' },
      { data: [{ id: 'same', display_name: 'Same' }], has_more: false },
    ];
    const duplicateFetcher: typeof fetch = async () => jsonResponse(duplicatePages.shift());
    await expect(fetchAnthropicModels(new AbortController().signal, {
      apiKey: 'secret', fetcher: duplicateFetcher,
    })).resolves.toEqual({ status: 'failed', reason: 'duplicate model id in Anthropic response' });
  });

  it('reports HTTP status and timeout failures', async () => {
    const unavailable: typeof fetch = async () => jsonResponse({}, 503);
    await expect(fetchAnthropicModels(new AbortController().signal, { apiKey: 'secret', fetcher: unavailable })).resolves.toEqual({
      status: 'failed', reason: '503',
    });

    const timeout: typeof fetch = async () => { throw new DOMException('deadline', 'TimeoutError'); };
    await expect(fetchAnthropicModels(new AbortController().signal, { apiKey: 'secret', fetcher: timeout })).resolves.toEqual({
      status: 'failed', reason: 'timed out after 30 s',
    });
  });
});
