import { describe, expect, it } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { selectionFromRestore, type FileNavigatorSelection } from './navigator-selection';

const rows: FileNavigatorRow[] = [
  { path: 'a', name: 'a', depth: 0, dir: false },
  { path: 'b', name: 'b', depth: 0, dir: false },
];

const current: FileNavigatorSelection = {
  cursor: 'a',
  anchor: 'a',
  selected: new Set(['a', 'b']),
};

describe('selectionFromRestore', () => {
  it('leaves absent parts as they were', () => {
    expect(selectionFromRestore({ revision: 1 }, rows, current)).toEqual(current);
  });

  it('clears parts set to null', () => {
    expect(selectionFromRestore({ revision: 1, cursor: null, anchor: null, selected: null }, rows, current))
      .toEqual({ cursor: null, anchor: null, selected: new Set() });
  });

  it('sets the anchor to the resulting cursor when requested', () => {
    expect(selectionFromRestore({ revision: 1, cursor: 'b', anchorToCursor: true }, rows, current))
      .toEqual({ cursor: 'b', anchor: 'b', selected: new Set(['a', 'b']) });
  });
});
