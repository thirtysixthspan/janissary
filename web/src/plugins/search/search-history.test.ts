import { describe, expect, it } from 'vitest';
import { recordSearch } from './search-history';

describe('recordSearch', () => {
  it('records nothing for a blank term', () => {
    // The bar's debounce already refuses to search an empty term, so a blank one reaching here means
    // it was nothing but whitespace — which is not a search either.
    expect(recordSearch([], '')).toEqual([]);
    expect(recordSearch(['todo'], ' '.repeat(3))).toEqual(['todo']);
  });

  it('records the first term', () => {
    expect(recordSearch([], 'todo')).toEqual(['todo']);
  });

  it('appends after what is already there, oldest first', () => {
    expect(recordSearch(['todo'], 'fixme')).toEqual(['todo', 'fixme']);
  });

  it('records the trimmed term, not the surrounding whitespace', () => {
    // The bar holds whatever was typed, whitespace and all, so a term recalled with its padding would
    // put a cursor somewhere the user did not leave it.
    expect(recordSearch([], '  todo  ')).toEqual(['todo']);
  });

  it('moves a term already in the list to the newest position without leaving a copy', () => {
    // Dedupe by moving rather than by leaving in place, because the walk answers ArrowUp with what
    // was searched most recently and a second copy two positions down is noise to step through.
    expect(recordSearch(['todo', 'fixme', 'wip'], 'todo')).toEqual(['fixme', 'wip', 'todo']);
  });

  it('keeps a term that differs only in case as its own entry', () => {
    // The matcher's own match-case toggle decides whether two spellings are the same search; the
    // history is not in a position to know, so it records what it was given.
    expect(recordSearch(['todo'], 'TODO')).toEqual(['todo', 'TODO']);
  });

  it('leaves the list it was given alone', () => {
    const entries = ['todo'];
    recordSearch(entries, 'fixme');
    expect(entries).toEqual(['todo']);
  });
});
