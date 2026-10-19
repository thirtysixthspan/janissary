import { describe, expect, it } from 'vitest';
import { isRecord } from './value-guards.js';

describe('isRecord', () => {
  it.each([null, [], 'text', 42, true])('rejects %j', (value) => {
    expect(isRecord(value)).toBe(false);
  });

  it('accepts a plain object', () => {
    expect(isRecord({ value: 'text' })).toBe(true);
  });
});
