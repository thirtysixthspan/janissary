import { describe, it, expect } from 'vitest';
import { nextSelection } from './schedules-keys';

describe('nextSelection', () => {
  it('ArrowDown moves forward by one and clamps at the last index', () => {
    expect(nextSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextSelection(3, 2, 'ArrowDown')).toBe(2);
  });

  it('ArrowUp moves back by one and clamps at zero', () => {
    expect(nextSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextSelection(3, 0, 'ArrowUp')).toBe(0);
  });

  it('ArrowDown/ArrowUp with no prior selection start from index 0', () => {
    expect(nextSelection(3, null, 'ArrowDown')).toBe(1);
    expect(nextSelection(3, null, 'ArrowUp')).toBe(0);
  });

  it('Home jumps to the first index, End jumps to the last', () => {
    expect(nextSelection(5, 3, 'Home')).toBe(0);
    expect(nextSelection(5, 1, 'End')).toBe(4);
  });

  it('an unrelated key returns the selection unchanged', () => {
    expect(nextSelection(5, 2, 'a')).toBe(2);
    expect(nextSelection(5, null, 'a')).toBeNull();
  });

  it('length 0 always returns null regardless of key', () => {
    expect(nextSelection(0, 2, 'ArrowDown')).toBeNull();
    expect(nextSelection(0, null, 'Home')).toBeNull();
  });
});
