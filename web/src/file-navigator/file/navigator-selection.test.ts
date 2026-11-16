import { describe, expect, it } from 'vitest';
import type { FileNavigatorRestoreHint, FileNavigatorRow } from '@shared/protocol';
import { focusHintStatus, selectionFromRestore, type FileNavigatorSelection } from './navigator-selection';

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

describe('focusHintStatus', () => {
  it('waits for the cursor row to appear, then reports ready', () => {
    const hint: FileNavigatorRestoreHint = { revision: 2, focus: true, cursor: 'c', anchor: 'c', selected: ['c'] };
    expect(focusHintStatus(hint, rows, '/root', '/root', undefined, false)).toBe('pending');
    expect(focusHintStatus(hint, [...rows, { path: 'c', name: 'c', depth: 0, dir: false }], '/root', '/root', undefined, false))
      .toBe('ready');
  });

  it('reports nothing for a hint without focus', () => {
    expect(focusHintStatus({ revision: 2, cursor: 'missing' }, rows, '/root', '/root', undefined, false)).toBe('none');
  });

  it('reports nothing for a revision already acted on, even when its row exists', () => {
    const hint: FileNavigatorRestoreHint = { revision: 2, focus: true, cursor: 'a' };
    expect(focusHintStatus(hint, rows, '/root', '/root', 2, false)).toBe('none');
  });

  it('drops the hint only when the root differs from the one it was first seen under', () => {
    const hint: FileNavigatorRestoreHint = { revision: 2, focus: true, cursor: 'a' };
    expect(focusHintStatus(hint, rows, '/root', '/root', undefined, false)).toBe('ready');
    expect(focusHintStatus(hint, rows, '/other', '/root', undefined, false)).toBe('dropped');
  });

  it('drops a pending hint once the user has moved', () => {
    const hint: FileNavigatorRestoreHint = { revision: 2, focus: true, cursor: 'missing' };
    expect(focusHintStatus(hint, rows, '/root', '/root', undefined, true)).toBe('dropped');
  });

  it('drops a focus hint that names no cursor instead of holding it forever', () => {
    expect(focusHintStatus({ revision: 2, focus: true }, rows, '/root', '/root', undefined, false)).toBe('dropped');
  });
});
