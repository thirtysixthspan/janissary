import { describe, it, expect } from 'vitest';
import { asArray, asNumber, asRecord, asString, parseRecordLine } from './json.js';

// Narrowing helpers for records parsed out of a harness's own on-disk session format. The shapes
// belong to another program and change between its versions, so these have to refuse everything they
// cannot vouch for — including the values JSON accepts that a record never holds.

describe('asRecord', () => {
  it('answers the object it was given', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  // An array is an object as far as `typeof` goes, and `null` is an object too — but a record is a
  // keyed record, so both have to be refused rather than indexed into by accident.
  it('refuses anything that is not a keyed object', () => {
    expect(asRecord(null)).toBeUndefined();
    expect(asRecord([1, 2])).toBeUndefined();
    expect(asRecord('a')).toBeUndefined();
    expect(asRecord(7)).toBeUndefined();
    expect(asRecord(undefined)).toBeUndefined();
  });
});

describe('asString', () => {
  it('answers the string it was given and refuses anything else', () => {
    expect(asString('a')).toBe('a');
    expect(asString('')).toBe('');
    expect(asString(7)).toBeUndefined();
    expect(asString(null)).toBeUndefined();
  });
});

describe('asNumber', () => {
  it('answers the number it was given', () => {
    expect(asNumber(7)).toBe(7);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-1.5)).toBe(-1.5);
  });

  // `NaN` and the infinities are `typeof` number, so without the finite check a corrupt or
  // truncated field would sail through as a real measurement.
  it('refuses a number that is not finite', () => {
    expect(asNumber(NaN)).toBeUndefined();
    expect(asNumber(Infinity)).toBeUndefined();
    expect(asNumber(-Infinity)).toBeUndefined();
  });

  it('refuses anything that is not a number', () => {
    expect(asNumber('7')).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
    expect(asNumber(undefined)).toBeUndefined();
  });
});

describe('asArray', () => {
  it('answers the array it was given', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray([])).toEqual([]);
  });

  // An empty array rather than `undefined`: callers iterate it, and a missing field in a record this
  // loose is a list of nothing, not a reason to guard every read.
  it('answers an empty array for anything that is not one', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray({ 0: 'a' })).toEqual([]);
    expect(asArray('ab')).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });
});

describe('parseRecordLine', () => {
  it('parses one JSONL line into a record', () => {
    expect(parseRecordLine('{"type":"user","text":"hi"}')).toEqual({ type: 'user', text: 'hi' });
    expect(parseRecordLine('  {"a":1}  ')).toEqual({ a: 1 });
  });

  // A partially flushed line is skipped, never thrown: the tailer reads a file another process is
  // still writing, so a corrupt line is normal and must not end the transcript.
  it('skips a blank line', () => {
    expect(parseRecordLine('')).toBeUndefined();
    expect(parseRecordLine(' '.repeat(3))).toBeUndefined();
    expect(parseRecordLine('\n')).toBeUndefined();
  });

  it('skips a line that is not JSON at all', () => {
    expect(parseRecordLine('not json')).toBeUndefined();
    expect(parseRecordLine('{"a":')).toBeUndefined();
    expect(parseRecordLine("{a:1}")).toBeUndefined();
  });

  // Valid JSON that is not a keyed record is the same case as unparseable: there is no record here.
  it('skips a line whose JSON is not an object', () => {
    expect(parseRecordLine('[1,2]')).toBeUndefined();
    expect(parseRecordLine('"a"')).toBeUndefined();
    expect(parseRecordLine('null')).toBeUndefined();
    expect(parseRecordLine('7')).toBeUndefined();
  });
});
