import { describe, expect, it } from 'vitest';
import { GRID_NAVIGATION_KEYS, nextRowSelection } from './sql-keys';

// The grid's keyboard rule on its own. It is `nextListSelection` from the shared list module written
// out, so it keeps that rule's character: the arrows stop at the ends rather than wrapping.

describe('the navigation keys the grid claims', () => {
  it('are the vertical ones, because a run of rows has no column to move along', () => {
    expect(GRID_NAVIGATION_KEYS).toEqual(new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']));
  });

  // Left and right are left to the browser rather than swallowed: a key that moves nothing should
  // not also stop the frame from scrolling the way it otherwise would.
  it('do not include the left and right arrows', () => {
    expect(GRID_NAVIGATION_KEYS.has('ArrowLeft')).toBe(false);
    expect(GRID_NAVIGATION_KEYS.has('ArrowRight')).toBe(false);
  });
});

describe('nextRowSelection', () => {
  it('moves a row at a time', () => {
    expect(nextRowSelection(3, 1, 'ArrowDown')).toBe(2);
    expect(nextRowSelection(3, 1, 'ArrowUp')).toBe(0);
  });

  it('stops at the ends rather than wrapping', () => {
    expect(nextRowSelection(3, 0, 'ArrowUp')).toBe(0);
    expect(nextRowSelection(3, 2, 'ArrowDown')).toBe(2);
  });

  it('reaches the first and last row with Home and End', () => {
    expect(nextRowSelection(10, 5, 'Home')).toBe(0);
    expect(nextRowSelection(10, 5, 'End')).toBe(9);
  });

  it('leaves the row alone for a key it does not answer', () => {
    expect(nextRowSelection(3, 1, 'Enter')).toBe(1);
    expect(nextRowSelection(3, 1, 'a')).toBe(1);
  });

  it('has no row on a page with none', () => {
    expect(nextRowSelection(0, null, 'ArrowDown')).toBeNull();
    expect(nextRowSelection(0, 0, 'Home')).toBeNull();
  });

  it('starts on the first row when nothing was highlighted, and the last for End', () => {
    expect(nextRowSelection(3, null, 'ArrowDown')).toBe(0);
    expect(nextRowSelection(3, null, 'ArrowUp')).toBe(0);
    expect(nextRowSelection(3, null, 'Home')).toBe(0);
    expect(nextRowSelection(3, null, 'End')).toBe(2);
  });
});
