import { describe, expect, it } from 'vitest';
import { decodeFetchResult } from './fetch-result.js';

describe('decodeFetchResult', () => {
  it('decodes a page with its url and content, dropping extra fields', () => {
    expect(decodeFetchResult({
      url: 'https://example.com/',
      content: 'page body',
      status: 200,
    })).toEqual({ kind: 'fetched', url: 'https://example.com/', content: 'page body' });
  });

  it('treats empty content and an empty url as a fetched page', () => {
    expect(decodeFetchResult({ url: 'https://example.com/', content: '' })).toEqual({
      kind: 'fetched',
      url: 'https://example.com/',
      content: '',
    });
    expect(decodeFetchResult({ url: '', content: 'body' })).toEqual({
      kind: 'fetched',
      url: '',
      content: 'body',
    });
  });

  it('decodes a redirect with its target', () => {
    expect(decodeFetchResult({ redirectedTo: 'https://other.example/page' })).toEqual({
      kind: 'redirected',
      url: 'https://other.example/page',
    });
  });

  it('decodes a record with both a page and a redirect as the page', () => {
    expect(decodeFetchResult({
      url: 'https://example.com/',
      content: 'body',
      redirectedTo: 'https://other.example/page',
    })).toEqual({ kind: 'fetched', url: 'https://example.com/', content: 'body' });
  });

  it('returns undefined for shapes that are not a page or a redirect', () => {
    expect(decodeFetchResult(42)).toBeUndefined();
    expect(decodeFetchResult(null)).toBeUndefined();
    expect(decodeFetchResult([])).toBeUndefined();
    expect(decodeFetchResult({ url: 'https://example.com/' })).toBeUndefined();
    expect(decodeFetchResult({ url: 3, content: 'body' })).toBeUndefined();
    expect(decodeFetchResult({ redirectedTo: '' })).toBeUndefined();
    expect(decodeFetchResult({ redirectedTo: 3 })).toBeUndefined();
  });
});
