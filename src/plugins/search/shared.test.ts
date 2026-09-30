import { describe, expect, it } from 'vitest';
import {
  isOpenIntent,
  isSearchIntent,
  isSearchPayload,
  type SearchPayload,
} from './shared.js';

const payload: SearchPayload = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
  state: 'done', message: '', rows: [
    {
      path: 'src/a.ts', line: 12, above: ['one', 'two'], match: '  // todo: fix', start: 5, end: 9,
      below: ['three'],
    },
  ],
};

const intent = {
  query: 'todo', include: 'src/**', exclude: '*.test.ts',
  regex: true, matchCase: true, wholeWord: false,
};

// A copy of a value with one field removed, for the guards that must reject a missing field.
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

describe('isSearchPayload', () => {
  it('accepts a payload with rows and one with none', () => {
    expect(isSearchPayload(payload)).toBe(true);
    expect(isSearchPayload({ ...payload, rows: [] })).toBe(true);
  });

  it('accepts a row whose context is clipped to nothing on both sides', () => {
    expect(isSearchPayload({
      ...payload, rows: [{ path: 'a', line: 1, above: [], match: 'x', start: 0, end: 1, below: [] }],
    })).toBe(true);
  });

  it('accepts every state', () => {
    for (const state of ['searching', 'done', 'error'] as const) {
      expect(isSearchPayload({ ...payload, state })).toBe(true);
    }
  });

  it('rejects an unknown state', () => {
    expect(isSearchPayload({ ...payload, state: 'cancelled' })).toBe(false);
  });

  it('rejects a missing field', () => {
    expect(isSearchPayload(without(payload, 'query'))).toBe(false);
  });

  it('rejects a wrong field type', () => {
    expect(isSearchPayload({ ...payload, regex: 'true' })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: 'none' })).toBe(false);
  });

  it('rejects a malformed row', () => {
    expect(isSearchPayload({ ...payload, rows: [{ ...payload.rows[0], line: '12' }] })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: [{ ...payload.rows[0], above: [1] }] })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: [{ ...payload.rows[0], match: 3 }] })).toBe(false);
  });

  it('rejects a row missing or mistyping where its match sits', () => {
    const row = payload.rows[0]!;
    expect(isSearchPayload({ ...payload, rows: [without(row, 'start')] })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: [without(row, 'end')] })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: [{ ...row, start: '5' }] })).toBe(false);
    expect(isSearchPayload({ ...payload, rows: [{ ...row, end: null }] })).toBe(false);
  });

  it('rejects a row that is not an object', () => {
    expect(isSearchPayload({ ...payload, rows: ['src/a.ts:12'] })).toBe(false);
  });

  it('rejects arrays and null', () => {
    expect(isSearchPayload([])).toBe(false);
    expect(isSearchPayload(null)).toBe(false);
  });
});

describe('isSearchIntent', () => {
  it('accepts a complete query', () => {
    expect(isSearchIntent(intent)).toBe(true);
  });

  it('rejects a missing filter or flag', () => {
    expect(isSearchIntent(without(intent, 'include'))).toBe(false);
    expect(isSearchIntent(without(intent, 'wholeWord'))).toBe(false);
  });

  it('rejects a non-string query and non-boolean flags', () => {
    expect(isSearchIntent({ ...intent, query: 7 })).toBe(false);
    expect(isSearchIntent({ ...intent, matchCase: 'yes' })).toBe(false);
  });

  it('rejects arrays and null', () => {
    expect(isSearchIntent([])).toBe(false);
    expect(isSearchIntent(null)).toBe(false);
  });
});

describe('isOpenIntent', () => {
  it('accepts a path and a line', () => {
    expect(isOpenIntent({ path: '/repo/src/a.ts', line: 12 })).toBe(true);
  });

  it('rejects a missing or mistyped field', () => {
    expect(isOpenIntent({ path: '/repo/src/a.ts' })).toBe(false);
    expect(isOpenIntent({ path: '/repo/src/a.ts', line: '12' })).toBe(false);
  });

  it('rejects arrays and null', () => {
    expect(isOpenIntent([])).toBe(false);
    expect(isOpenIntent(null)).toBe(false);
  });
});
