import { describe, it, expect } from 'vitest';
import { isRateLimitError } from './rate-limit.js';

describe('isRateLimitError', () => {
  it('matches a 429 status code', () => {
    expect(isRateLimitError('request failed with status 429')).toBe(true);
  });

  it('matches "rate limit" case-insensitively', () => {
    expect(isRateLimitError('Rate Limit exceeded, please slow down')).toBe(true);
  });

  it('matches "too many requests" case-insensitively', () => {
    expect(isRateLimitError('TOO MANY REQUESTS')).toBe(true);
  });

  it('returns false for an unrelated ACP error message', () => {
    expect(isRateLimitError('connection refused')).toBe(false);
  });
});
