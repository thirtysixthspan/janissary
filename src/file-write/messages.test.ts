import { describe, it, expect } from 'vitest';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { displayPath, editSuccessLine, matchFailureLine, writeSuccessLine } from './messages.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

const LINE_SEPARATOR_CODE = 0x20_28;

describe('file mutation success lines', () => {
  it('reports a write', () => {
    expect(writeSuccessLine('a.md')).toBe('Wrote a.md.');
  });

  it('reports an edit with the plural word for every count', () => {
    expect(editSuccessLine('a.md', 1)).toBe('Edited a.md (1 replacements).');
    expect(editSuccessLine('a.md', 3)).toBe('Edited a.md (3 replacements).');
  });
});

describe('matchFailureLine', () => {
  it('reports no matching text', () => {
    expect(matchFailureLine(NO_MATCHING_TEXT_REASON, 'a.md')).toBe(`${NO_MATCHING_TEXT_REASON}: a.md.`);
  });

  it('reports multiple matches with the replaceAll hint', () => {
    expect(matchFailureLine(MULTIPLE_MATCHES_REASON, 'a.md'))
      .toBe(`${MULTIPLE_MATCHES_REASON}: a.md; set replaceAll to true.`);
  });

  it('leaves other reasons to the caller', () => {
    expect(matchFailureLine(OUTSIDE_ROOT_REASON, 'a.md')).toBeUndefined();
  });
});

describe('displayPath', () => {
  it('escapes line breaks, tabs, and control characters onto one line', () => {
    const controls = [0x0A, 0x0D, 0x09, 0x1B, 0x7F, 0x85, LINE_SEPARATOR_CODE].map((code) => String.fromCodePoint(code));
    const path = controls.map((character, index) => `${String(index)}${character}`).join('');
    const escapes = ['n', 'r', 't', 'u001b', 'u007f', 'u0085', `u${LINE_SEPARATOR_CODE.toString(16)}`];
    const expected = escapes.map((escape, index) => `${String(index)}\\${escape}`).join('');
    expect(displayPath(path)).toBe(expected);
  });

  it('escapes bidirectional and invisible formatting controls', () => {
    const codes = [0x06_1C, 0x20_0E, 0x20_0F, 0x20_2A, 0x20_2B, 0x20_2C, 0x20_2D, 0x20_2E, 0x20_66, 0x20_67, 0x20_68, 0x20_69];
    const path = codes.map((code, index) => `${String(index)}${String.fromCodePoint(code)}`).join('');
    const escapes = ['u061c', 'u200e', 'u200f', 'u202a', 'u202b', 'u202c', 'u202d', 'u202e', 'u2066', 'u2067', 'u2068', 'u2069'];
    const expected = escapes.map((escape, index) => `${String(index)}\\${escape}`).join('');
    expect(displayPath(path)).toBe(expected);
  });

  it('shows a right-to-left override as an escape rather than reordering the path', () => {
    const rendered = displayPath(`invoice${String.fromCodePoint(0x20_2E)}fdp.exe`);
    expect(rendered).toBe(String.raw`invoice\u202efdp.exe`);
    expect(rendered).not.toContain(String.fromCodePoint(0x20_2E));
  });

  it('leaves code points just outside the bidirectional control ranges unchanged', () => {
    const path = [0x20_0D, 0x20_10, 0x20_65, 0x20_6A].map((code) => String.fromCodePoint(code)).join('');
    expect(displayPath(path)).toBe(path);
  });

  it('leaves backslashes, spaces, and non-ASCII letters unchanged', () => {
    expect(displayPath(String.raw`dir\my file é.md`)).toBe(String.raw`dir\my file é.md`);
  });

  it('escapes the path in every formatter', () => {
    const lines = [
      writeSuccessLine('a\nb'),
      editSuccessLine('a\nb', 2),
      matchFailureLine(NO_MATCHING_TEXT_REASON, 'a\nb'),
      matchFailureLine(MULTIPLE_MATCHES_REASON, 'a\nb'),
    ];
    for (const line of lines) {
      expect(line).toContain(String.raw`a\nb`);
      expect(line).not.toContain('\n');
    }
  });
});
