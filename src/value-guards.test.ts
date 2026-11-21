import { describe, expect, it } from 'vitest';
import { isEmptyIntent, isIdIntent, isRecord, isRefreshIntent } from './value-guards.js';

describe('isRecord', () => {
  it.each([null, [], 'text', 42, true])('rejects %j', (value) => {
    expect(isRecord(value)).toBe(false);
  });

  it('accepts a plain object', () => {
    expect(isRecord({ value: 'text' })).toBe(true);
  });
});

describe('isEmptyIntent', () => {
  it('accepts only an empty plain object', () => {
    expect(isEmptyIntent({})).toBe(true);
  });

  it.each([[], null, 'text', 42, true, { extra: true }])('rejects %j', (value) => {
    expect(isEmptyIntent(value)).toBe(false);
  });
});

describe('isRefreshIntent', () => {
  it('accepts only an empty plain object', () => {
    expect(isRefreshIntent({})).toBe(true);
  });

  it.each([[], null, 'text', 42, true, { extra: true }])('rejects %j', (value) => {
    expect(isRefreshIntent(value)).toBe(false);
  });
});

describe('isIdIntent', () => {
  it('accepts an object whose only key is a string id', () => {
    expect(isIdIntent({ id: 'first' })).toBe(true);
  });

  it.each([
    { id: 'first', extra: true }, { id: 42 }, {}, [], null, 'text',
  ])('rejects %j', (value) => {
    expect(isIdIntent(value)).toBe(false);
  });
});
