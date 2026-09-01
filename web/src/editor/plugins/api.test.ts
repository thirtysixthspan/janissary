import { describe, expect, it } from 'vitest';
import * as model from '../model';
import * as offsets from '../offsets';
import {
  selectionBounds, textIn, wordRangeAt, posToOffset, offsetToPos, EDITOR_PLUGIN_API_VERSION,
} from './api';

const LINES = ['const total = 1;', 'return total;'];

// The contract publishes these so a plugin never reaches into the editor's model and offset modules
// for them. Each is the host's own function — the contract republishes behavior, it does not wrap or
// reimplement it, so a plugin importing from `../api` gets exactly what the editor itself runs.
describe('published buffer helpers', () => {
  it.each([
    ['selectionBounds', selectionBounds, model.selectionBounds],
    ['textIn', textIn, model.textIn],
    ['wordRangeAt', wordRangeAt, model.wordRangeAt],
    ['posToOffset', posToOffset, offsets.posToOffset],
    ['offsetToPos', offsetToPos, offsets.offsetToPos],
  ])('%s is the host function itself, not a wrapper', (_name, published, host) => {
    expect(published).toBe(host);
  });
});

// Behavior at the contract's own signatures — a plugin only ever calls them this way.
describe('published helper behavior', () => {
  it('selectionBounds orders an upward selection into start..end', () => {
    expect(selectionBounds({ anchor: { line: 1, col: 6 }, cursor: { line: 0, col: 6 } }))
      .toEqual({ start: { line: 0, col: 6 }, end: { line: 1, col: 6 } });
  });

  it('selectionBounds collapses a caret with no anchor', () => {
    expect(selectionBounds({ anchor: null, cursor: { line: 0, col: 3 } }))
      .toEqual({ start: { line: 0, col: 3 }, end: { line: 0, col: 3 } });
  });

  it('textIn extracts across a line boundary', () => {
    expect(textIn(LINES, { start: { line: 0, col: 6 }, end: { line: 1, col: 6 } })).toBe('total = 1;\nreturn');
  });

  it('wordRangeAt spans the word under the caret', () => {
    expect(wordRangeAt(LINES, 0, 7)).toEqual({ start: { line: 0, col: 6 }, end: { line: 0, col: 11 } });
  });

  it('posToOffset and offsetToPos round-trip a position past a line break', () => {
    const pos = { line: 1, col: 7 };
    expect(offsetToPos(LINES, posToOffset(LINES, pos))).toEqual(pos);
  });
});

describe('contract version', () => {
  // The helpers moved unchanged and their contract signatures were written to match, so publishing
  // them is not a contract change.
  it('stays at 2', () => {
    expect(EDITOR_PLUGIN_API_VERSION).toBe(2);
  });
});
