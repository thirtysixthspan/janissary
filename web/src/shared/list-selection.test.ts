import { describe, it, expect } from 'vitest';
import { nextListSelection } from './list-selection';

describe('nextListSelection', () => {
  it('ArrowDown moves forward by one and clamps at the last index', () => {
    expect(nextListSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextListSelection(3, 2, 'ArrowDown')).toBe(2);
  });

  it('ArrowUp moves back by one and clamps at zero', () => {
    expect(nextListSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextListSelection(3, 0, 'ArrowUp')).toBe(0);
  });

  it('ArrowDown/ArrowUp with no prior selection start from index 0', () => {
    expect(nextListSelection(3, null, 'ArrowDown')).toBe(1);
    expect(nextListSelection(3, null, 'ArrowUp')).toBe(0);
  });

  it('Home jumps to the first index, End jumps to the last', () => {
    expect(nextListSelection(5, 3, 'Home')).toBe(0);
    expect(nextListSelection(5, 1, 'End')).toBe(4);
    expect(nextListSelection(5, null, 'End')).toBe(4);
  });

  it('an unrelated key returns the selection unchanged', () => {
    expect(nextListSelection(5, 2, 'a')).toBe(2);
    expect(nextListSelection(5, null, 'PageDown')).toBeNull();
  });

  it('an empty list returns null for every key', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'a']) {
      expect(nextListSelection(0, 2, key)).toBeNull();
      expect(nextListSelection(0, null, key)).toBeNull();
    }
  });

  it('a single-row list keeps every navigation key on row 0', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(nextListSelection(1, 0, key)).toBe(0);
    }
  });
});
