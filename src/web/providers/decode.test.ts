import { describe, expect, it } from 'vitest';
import { ProviderRequestError } from './contract.js';
import { decodeResults } from './decode.js';

describe('decodeResults', () => {
  it('maps the named snippet key and keeps the response order', () => {
    const body = {
      results: [
        { title: 'First', url: 'https://first.example/', content: 'one' },
        { title: 'Second', url: 'https://second.example/', content: 'two' },
      ],
    };

    expect(decodeResults(body, 'content')).toEqual([
      { title: 'First', url: 'https://first.example/', snippet: 'one' },
      { title: 'Second', url: 'https://second.example/', snippet: 'two' },
    ]);
    expect(
      decodeResults({ results: [{ title: 'T', url: 'https://x.example/', snippet: 's' }] }, 'snippet'),
    ).toEqual([{ title: 'T', url: 'https://x.example/', snippet: 's' }]);
  });

  it('decodes a non-string title or snippet as an empty string', () => {
    expect(
      decodeResults({ results: [{ title: 1, url: 'https://example.com/', content: null }] }, 'content'),
    ).toEqual([{ title: '', url: 'https://example.com/', snippet: '' }]);
  });

  it('skips entries that are not objects or lack a string url', () => {
    const body = {
      results: [
        'scalar',
        null,
        { title: 'missing' },
        { title: 'number', url: 3 },
        { title: 'kept', url: 'https://kept.example/', content: 'kept snippet' },
      ],
    };

    expect(decodeResults(body, 'content')).toEqual([
      { title: 'kept', url: 'https://kept.example/', snippet: 'kept snippet' },
    ]);
  });

  it('refuses a body that is not an object with a results array', () => {
    expect(() => decodeResults(null, 'content')).toThrowError(ProviderRequestError);
    expect(() => decodeResults({}, 'content')).toThrow('invalid response');
    expect(() => decodeResults([], 'content')).toThrow('invalid response');
    expect(() => decodeResults({ results: {} }, 'content')).toThrow('invalid response');
  });

  it('returns an empty list for an empty results array', () => {
    expect(decodeResults({ results: [] }, 'snippet')).toEqual([]);
  });
});
