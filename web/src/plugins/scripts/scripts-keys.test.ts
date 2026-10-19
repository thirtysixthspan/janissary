import { describe, expect, it } from 'vitest';
import { keyMeaning, nameAfterRemoval, rowIndexOf } from './scripts-keys';

describe('keyMeaning', () => {
  it.each(['ArrowUp', 'ArrowDown', 'Home', 'End'])('maps %s to a move', (key) => {
    expect(keyMeaning(key)).toBe('move');
  });

  it('maps Enter to open', () => {
    expect(keyMeaning('Enter')).toBe('open');
  });

  it.each(['Delete', 'Backspace'])('maps %s to delete', (key) => {
    expect(keyMeaning(key)).toBe('delete');
  });

  it.each(['a', 'Escape', 'Tab', ' '])('maps %j to nothing', (key) => {
    expect(keyMeaning(key)).toBeNull();
  });
});

describe('rowIndexOf', () => {
  const rows = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

  it('returns the index of a listed name', () => {
    expect(rowIndexOf(rows, 'b')).toBe(1);
  });

  it('returns nothing when the name is absent or no name is selected', () => {
    expect(rowIndexOf(rows, 'z')).toBeNull();
    expect(rowIndexOf(rows, null)).toBeNull();
  });

  it('returns nothing for an empty list', () => {
    expect(rowIndexOf([], 'a')).toBeNull();
  });
});

describe('nameAfterRemoval', () => {
  const rows = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

  it('returns the next row for a row removed from the middle', () => {
    expect(nameAfterRemoval(rows, 'b')).toBe('c');
  });

  it('returns the next row for a row removed from the top', () => {
    expect(nameAfterRemoval(rows, 'a')).toBe('b');
  });

  it('returns the previous row for a row removed from the end', () => {
    expect(nameAfterRemoval(rows, 'c')).toBe('b');
  });

  it('returns nothing for the only row', () => {
    expect(nameAfterRemoval([{ name: 'a' }], 'a')).toBeNull();
  });

  it('returns nothing for a name that is not listed', () => {
    expect(nameAfterRemoval(rows, 'z')).toBeNull();
  });
});
