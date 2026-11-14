import { describe, it, expect } from 'vitest';
import { positiveInteger } from './positive-integer.js';

describe('positiveInteger', () => {
  it('returns undefined for a missing value', () => {
    expect(positiveInteger(undefined)).toBeUndefined();
  });

  it('accepts a plain positive integer', () => {
    expect(positiveInteger('42')).toBe(42);
  });

  it('accepts leading zeros', () => {
    expect(positiveInteger('007')).toBe(7);
  });

  it.each(['0', '-3', '1.5', '1e3', ''])('rejects %j', (value) => {
    expect(positiveInteger(value)).toBeUndefined();
  });

  it('rejects a digit string beyond the safe integer range', () => {
    expect(positiveInteger('9007199254740993')).toBeUndefined();
  });
});
