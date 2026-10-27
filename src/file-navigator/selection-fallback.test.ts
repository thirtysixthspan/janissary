import { describe, expect, it } from 'vitest';
import { selectionAfterCollapse, type CommandSelection } from './selection-fallback.js';

function selection(overrides: Partial<CommandSelection> = {}): CommandSelection {
  return {
    cursor: 'src/deep/a.ts',
    anchor: 'src/deep/a.ts',
    selected: new Set(['src/deep/a.ts', 'visible.ts']),
    cursorNamed: true,
    anchorNamed: true,
    selectionNamed: true,
    anchorToCursor: false,
    ...overrides,
  };
}

describe('selectionAfterCollapse', () => {
  it('keeps visible selections and moves a hidden cursor to its nearest visible ancestor', () => {
    expect(selectionAfterCollapse(selection(), new Set(['src', 'visible.ts']))).toEqual({
      cursor: 'src',
      anchor: 'src',
      selected: new Set(['visible.ts']),
      cursorNamed: true,
      anchorNamed: true,
      selectionNamed: true,
      anchorToCursor: false,
    });
  });

  it('marks a hidden anchor for reset to the tree cursor when the command named no cursor', () => {
    expect(selectionAfterCollapse(selection({ cursorNamed: false, cursor: undefined }), new Set(['src', 'visible.ts'])))
      .toMatchObject({ cursorNamed: false, anchor: undefined, anchorToCursor: true });
  });
});
