import { describe, it, expect } from 'vitest';
import type { SuggestHunk } from '@shared/protocol';
import { buildEditorRows } from './editor-rows';

const lines = ['one', 'two', 'three', 'four'];

function plan(hunks: SuggestHunk[], resolved: boolean[] = hunks.map(() => false)) {
  return buildEditorRows(lines, hunks, resolved);
}

describe('buildEditorRows', () => {
  it('plans one buffer row per line when nothing is pending', () => {
    expect(plan([])).toEqual([
      { kind: 'buffer', index: 0 },
      { kind: 'buffer', index: 1 },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
    ]);
  });

  it('interleaves the removed and added rows of a replaced hunk at its position', () => {
    expect(plan([{ anchor: 'two', replacement: 'TWO' }])).toEqual([
      { kind: 'buffer', index: 0 },
      { kind: 'removed', index: 1 },
      { kind: 'added', hunkIndex: 0, text: 'TWO', position: 0, last: true },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
    ]);
  });

  it('plans no removed rows for a pure insertion', () => {
    expect(plan([{ anchor: '', replacement: '\nfive' }])).toEqual([
      { kind: 'buffer', index: 0 },
      { kind: 'buffer', index: 1 },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
      { kind: 'added', hunkIndex: 0, text: 'five', position: 0, last: true },
    ]);
  });

  it('plans no added rows for a pure deletion', () => {
    expect(plan([{ anchor: 'two\n', replacement: '' }])).toEqual([
      { kind: 'buffer', index: 0 },
      { kind: 'removed', index: 1 },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
    ]);
  });

  it('marks only the last added row of a hunk for the accept/decline controls', () => {
    const added = plan([{ anchor: 'two', replacement: 'A\nB' }])
      .filter((row) => row.kind === 'added');
    expect(added).toEqual([
      { kind: 'added', hunkIndex: 0, text: 'A', position: 0, last: false },
      { kind: 'added', hunkIndex: 0, text: 'B', position: 1, last: true },
    ]);
  });

  it('skips a hunk that is already resolved', () => {
    const rows = plan([{ anchor: 'one', replacement: 'ONE' }, { anchor: 'three', replacement: 'THREE' }], [true, false]);
    expect(rows.filter((row) => row.kind === 'added')).toEqual([
      { kind: 'added', hunkIndex: 1, text: 'THREE', position: 0, last: true },
    ]);
  });

  it('previews hunks in start-line order regardless of the order they arrived', () => {
    expect(plan([{ anchor: 'three', replacement: 'THREE' }, { anchor: 'one', replacement: 'ONE' }])).toEqual([
      { kind: 'removed', index: 0 },
      { kind: 'added', hunkIndex: 1, text: 'ONE', position: 0, last: true },
      { kind: 'buffer', index: 1 },
      { kind: 'removed', index: 2 },
      { kind: 'added', hunkIndex: 0, text: 'THREE', position: 0, last: true },
      { kind: 'buffer', index: 3 },
    ]);
  });

  it('skips a hunk that overlaps the previous one', () => {
    const rows = plan([{ anchor: 'one\ntwo', replacement: 'X' }, { anchor: 'two', replacement: 'TWO' }]);
    expect(rows).toEqual([
      { kind: 'removed', index: 0 },
      { kind: 'removed', index: 1 },
      { kind: 'added', hunkIndex: 0, text: 'X', position: 0, last: true },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
    ]);
  });

  it('drops a hunk whose anchor no longer matches', () => {
    expect(plan([{ anchor: 'missing', replacement: 'X' }])).toEqual([
      { kind: 'buffer', index: 0 },
      { kind: 'buffer', index: 1 },
      { kind: 'buffer', index: 2 },
      { kind: 'buffer', index: 3 },
    ]);
  });
});
