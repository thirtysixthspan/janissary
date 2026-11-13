import { describe, expect, it } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { checkEditReplacement, decodeEditableText, replaceExactText } from './edit-text.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

const NUL = String.fromCodePoint(0);
const BOM = String.fromCodePoint(0xfe_ff);
const LONE_SURROGATE = String.fromCodePoint(0xd8_00);
const CR = String.fromCodePoint(13);
const LF = String.fromCodePoint(10);
const CRLF = CR + LF;

function replace(text: string, oldString: string, newString: string, replaceAll = false) {
  return replaceExactText(text, Buffer.byteLength(text), oldString, newString, replaceAll);
}

describe('replaceExactText matching', () => {
  it('replaces one match', () => {
    expect(replace('hello world', 'world', 'there')).toEqual({ ok: true, value: { text: 'hello there', replacements: 1 } });
  });

  it('refuses zero matches', () => {
    expect(replace('hello', 'bye', 'x')).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
  });

  it('refuses two matches without replaceAll', () => {
    expect(replace('a b a', 'a', 'c')).toEqual({ ok: false, reason: MULTIPLE_MATCHES_REASON });
  });

  it('replaces every match with replaceAll', () => {
    expect(replace('a b a', 'a', 'c', true)).toEqual({ ok: true, value: { text: 'c b c', replacements: 2 } });
  });

  it('refuses zero matches with replaceAll', () => {
    expect(replace('hello', 'bye', 'x', true)).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
  });

  it('counts non-overlapping occurrences', () => {
    expect(replace('aaa', 'aa', 'b')).toEqual({ ok: true, value: { text: 'ba', replacements: 1 } });
    expect(replace('aaaa', 'aa', 'b')).toEqual({ ok: false, reason: MULTIPLE_MATCHES_REASON });
  });

  it('refuses an empty oldString', () => {
    expect(replace('text', '', 'x', true)).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
  });

  it('finds no match in empty text', () => {
    expect(replace('', 'a', 'b')).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
  });
});

describe('replaceExactText replacement text', () => {
  it('deletes with an empty newString', () => {
    expect(replace('keep drop keep', ' drop', '')).toEqual({ ok: true, value: { text: 'keep keep', replacements: 1 } });
  });

  it('keeps replacement markers literally', () => {
    expect(replace('x', 'x', '$& $1 $$')).toEqual({ ok: true, value: { text: '$& $1 $$', replacements: 1 } });
  });

  it('preserves untouched line endings', () => {
    const text = `one${LF}two${CRLF}three${CR}four`;
    expect(replace(text, 'two', '2')).toEqual({ ok: true, value: { text: `one${LF}2${CRLF}three${CR}four`, replacements: 1 } });
  });

  it('matches across a CRLF only when oldString contains it', () => {
    const text = `a${CRLF}b`;
    expect(replace(text, `a${LF}b`, 'x')).toEqual({ ok: false, reason: NO_MATCHING_TEXT_REASON });
    expect(replace(text, `a${CRLF}b`, 'x')).toEqual({ ok: true, value: { text: 'x', replacements: 1 } });
  });
});

describe('replaceExactText size', () => {
  it('refuses a result over 5 MiB', () => {
    expect(replaceExactText('ab', FILE_POLICY_MAX_BYTES, 'a', 'aa', false)).toEqual({ ok: false, reason: 'File too large (>5 MB)' });
  });

  it('accepts a result of exactly 5 MiB', () => {
    const result = replaceExactText('ab', FILE_POLICY_MAX_BYTES - 1, 'a', 'aa', false);
    expect(result).toEqual({ ok: true, value: { text: 'aab', replacements: 1 } });
  });
});

describe('decodeEditableText', () => {
  it('keeps a leading BOM', () => {
    expect(decodeEditableText(Buffer.from(`${BOM}hi`, 'utf8'))).toEqual({ ok: true, value: `${BOM}hi` });
  });

  it('refuses invalid UTF-8', () => {
    expect(decodeEditableText(Uint8Array.from([0xff, 0xfe, 0x41]))).toEqual({ ok: false, reason: 'Not a text file' });
  });

  it('refuses decoded NUL', () => {
    expect(decodeEditableText(Buffer.from(`a${NUL}b`, 'utf8'))).toEqual({ ok: false, reason: 'Not a text file' });
  });
});

describe('checkEditReplacement', () => {
  it('refuses NUL and lone surrogates', () => {
    expect(checkEditReplacement(`a${NUL}`)).toEqual({ ok: false, reason: 'Not a text file' });
    expect(checkEditReplacement(`a${LONE_SURROGATE}`)).toEqual({ ok: false, reason: 'Not a text file' });
  });

  it('accepts ordinary text', () => {
    expect(checkEditReplacement('ordinary')).toEqual({ ok: true, value: undefined });
  });
});
