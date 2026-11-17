import { describe, expect, it } from 'vitest';
import {
  formatFailures,
  WEB_FETCH_FAILURE_HEADINGS,
  WEB_SEARCH_FAILURE_HEADINGS,
} from './failure-lines.js';

describe('formatFailures', () => {
  it('prints one failure as a single line', () => {
    expect(formatFailures(
      [{ name: 'tavily', reason: 'HTTP 429 Too Many Requests' }],
      WEB_SEARCH_FAILURE_HEADINGS,
    )).toBe('Web search failed (tavily): HTTP 429 Too Many Requests.');
  });

  it('prints several failures under an every-provider-failed header in order', () => {
    expect(formatFailures([
      { name: 'tavily', reason: 'provider failed: boom' },
      { name: 'tinyfish', reason: 'requires provider API 2' },
    ], WEB_SEARCH_FAILURE_HEADINGS)).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: boom',
      '- tinyfish: requires provider API 2',
    ].join('\n'));
  });

  it('prints one fetch failure with the fetch heading', () => {
    expect(formatFailures(
      [{ name: 'local', reason: 'too many redirects' }],
      WEB_FETCH_FAILURE_HEADINGS,
    )).toBe('Web fetch failed (local): too many redirects.');
  });

  it('prints several fetch failures under the fetch header in order', () => {
    expect(formatFailures([
      { name: 'local', reason: 'too many redirects' },
      { name: 'remote', reason: 'HTTP 500 Internal Server Error' },
    ], WEB_FETCH_FAILURE_HEADINGS)).toBe([
      'Web fetch: every attempt failed.',
      '- local: too many redirects',
      '- remote: HTTP 500 Internal Server Error',
    ].join('\n'));
  });
});
