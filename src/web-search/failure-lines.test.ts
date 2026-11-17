import { describe, expect, it } from 'vitest';
import { formatFailures } from './failure-lines.js';

describe('formatFailures', () => {
  it('prints one failure as a single line', () => {
    expect(formatFailures([{ name: 'tavily', reason: 'HTTP 429 Too Many Requests' }]))
      .toBe('Web search failed (tavily): HTTP 429 Too Many Requests.');
  });

  it('prints several failures under an every-provider-failed header in order', () => {
    expect(formatFailures([
      { name: 'tavily', reason: 'provider failed: boom' },
      { name: 'tinyfish', reason: 'requires provider API 2' },
    ])).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: boom',
      '- tinyfish: requires provider API 2',
    ].join('\n'));
  });
});
