import { describe, expect, it } from 'vitest';
import { modesFrom, sameModes } from './saved-modes.js';

describe('modesFrom', () => {
  it('reads the three saved modes', () => {
    expect(modesFrom({ regex: true, matchCase: true, wholeWord: false }))
      .toEqual({ regex: true, matchCase: true, wholeWord: false });
  });

  it('turns off each missing mode on its own', () => {
    expect(modesFrom({ wholeWord: true })).toEqual({ regex: false, matchCase: false, wholeWord: true });
    expect(modesFrom({})).toEqual({ regex: false, matchCase: false, wholeWord: false });
  });

  it('turns off a mode whose saved value is not a boolean', () => {
    expect(modesFrom({ regex: 'yes', matchCase: 1, wholeWord: true }))
      .toEqual({ regex: false, matchCase: false, wholeWord: true });
  });

  it('takes nothing but the modes from a search request', () => {
    expect(modesFrom({ query: 'todo', include: 'src', regex: true }))
      .toEqual({ regex: true, matchCase: false, wholeWord: false });
  });
});

describe('sameModes', () => {
  const off = { regex: false, matchCase: false, wholeWord: false };

  it('holds for identical modes', () => {
    expect(sameModes(off, { ...off })).toBe(true);
  });

  it('fails when any one mode differs', () => {
    expect(sameModes(off, { ...off, regex: true })).toBe(false);
    expect(sameModes(off, { ...off, matchCase: true })).toBe(false);
    expect(sameModes(off, { ...off, wholeWord: true })).toBe(false);
  });
});
