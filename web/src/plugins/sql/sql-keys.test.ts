import { describe, expect, it } from 'vitest';
import { nextCellSelection } from './sql-keys';

// The grid's keyboard rule on its own. The rule is two-dimensional where the shared list rule is one,
// so it is its own module — but it keeps that rule's character, which is that the arrows stop at the
// ends rather than wrapping.

const at = (row: number, cell: number) => ({ row, cell });

describe('nextCellSelection', () => {
  it('moves along the row and down the column', () => {
    expect(nextCellSelection(3, 2, at(0, 0), 'ArrowRight')).toEqual(at(0, 1));
    expect(nextCellSelection(3, 2, at(0, 1), 'ArrowLeft')).toEqual(at(0, 0));
    expect(nextCellSelection(3, 2, at(0, 0), 'ArrowDown')).toEqual(at(1, 0));
    expect(nextCellSelection(3, 2, at(1, 0), 'ArrowUp')).toEqual(at(0, 0));
  });

  it('stops at the ends rather than wrapping', () => {
    expect(nextCellSelection(3, 2, at(0, 0), 'ArrowLeft')).toEqual(at(0, 0));
    expect(nextCellSelection(3, 2, at(0, 1), 'ArrowRight')).toEqual(at(0, 1));
    expect(nextCellSelection(3, 2, at(0, 0), 'ArrowUp')).toEqual(at(0, 0));
    expect(nextCellSelection(3, 2, at(2, 0), 'ArrowDown')).toEqual(at(2, 0));
  });

  it('jumps to the ends of the row with Home and End', () => {
    expect(nextCellSelection(3, 2, at(1, 1), 'Home')).toEqual(at(1, 0));
    expect(nextCellSelection(3, 2, at(1, 0), 'End')).toEqual(at(1, 1));
  });

  it('leaves the position alone for a key it does not answer', () => {
    expect(nextCellSelection(3, 2, at(1, 1), 'Enter')).toEqual(at(1, 1));
    expect(nextCellSelection(3, 2, at(1, 1), 'a')).toEqual(at(1, 1));
  });

  it('has no selection on an empty grid, whatever the key', () => {
    expect(nextCellSelection(0, 2, null, 'ArrowRight')).toBeNull();
    expect(nextCellSelection(3, 0, null, 'ArrowRight')).toBeNull();
    expect(nextCellSelection(0, 0, at(0, 0), 'Home')).toBeNull();
  });

  it('starts at the first cell when nothing was selected yet', () => {
    expect(nextCellSelection(3, 2, null, 'ArrowRight')).toEqual(at(0, 1));
    expect(nextCellSelection(3, 2, null, 'End')).toEqual(at(0, 1));
  });
});
