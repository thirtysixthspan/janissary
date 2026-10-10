import { describe, expect, it, vi } from 'vitest';
import { loadMarkdownSource } from './markdown-source';

describe('loadMarkdownSource', () => {
  it('passes the abort signal to fetch and returns the response text', async () => {
    const signal = new AbortController().signal;
    const response = { ok: true, text: vi.fn().mockResolvedValue('# hello') } as unknown as Response;
    const fetchSource = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    await expect(loadMarkdownSource('/open/1', signal, fetchSource)).resolves.toBe('# hello');
    expect(fetchSource).toHaveBeenCalledWith('/open/1', { signal });
  });

  it('rejects a non-success response without reading its body', async () => {
    const response = { ok: false, status: 404, text: vi.fn() } as unknown as Response;
    const fetchSource = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    await expect(loadMarkdownSource('/open/1', new AbortController().signal, fetchSource)).rejects.toThrow('HTTP 404');
    expect(response.text).not.toHaveBeenCalled();
  });
});
