import { describe, expect, it } from 'vitest';
import { nextResultSelection } from './result-keys';

// Row 0 is the first match, at the bottom edge of a window that stacks upward, so a higher index is
// further up the page.
describe('nextResultSelection', () => {
  it('ArrowUp moves up the page to a later match and stops at the last', () => {
    expect(nextResultSelection(3, 0, 'ArrowUp')).toBe(1);
    expect(nextResultSelection(3, 2, 'ArrowUp')).toBe(2);
  });

  it('ArrowDown moves down the page to an earlier match and stops at the first', () => {
    expect(nextResultSelection(3, 2, 'ArrowDown')).toBe(1);
    expect(nextResultSelection(3, 0, 'ArrowDown')).toBe(0);
  });

  it('Home and End still go to the first and the last match', () => {
    expect(nextResultSelection(5, 3, 'Home')).toBe(0);
    expect(nextResultSelection(5, 1, 'End')).toBe(4);
  });

  it('an empty list has no selection', () => {
    expect(nextResultSelection(0, null, 'ArrowUp')).toBeNull();
    expect(nextResultSelection(0, null, 'ArrowDown')).toBeNull();
  });

  it('an unrelated key leaves the selection where it was', () => {
    expect(nextResultSelection(5, 2, 'a')).toBe(2);
    expect(nextResultSelection(5, null, 'PageDown')).toBeNull();
  });
});
