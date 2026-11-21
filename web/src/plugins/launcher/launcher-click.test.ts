import { describe, expect, it } from 'vitest';
import { commandClickSelection, tabClickSelection } from './launcher-click';

describe('commandClickSelection', () => {
  it('highlights a clicked row without opening it', () => {
    expect(commandClickSelection(2, null)).toEqual({ selected: 2, opens: false });
    expect(commandClickSelection(2, 0)).toEqual({ selected: 2, opens: false });
  });

  it('opens a repeat click on the same row', () => {
    expect(commandClickSelection(2, 2)).toEqual({ selected: 2, opens: true });
  });

  it('does not open the first row on its first click, even though it starts current', () => {
    expect(commandClickSelection(0, null)).toEqual({ selected: 0, opens: false });
    expect(commandClickSelection(0, 0)).toEqual({ selected: 0, opens: true });
  });
});

describe('tabClickSelection', () => {
  it('does not open an active tab row on click', () => {
    expect(tabClickSelection(1, true)).toEqual({ selected: 1, opens: false });
  });

  it('opens an inactive tab row on click, moving the selection to it', () => {
    expect(tabClickSelection(1, false)).toEqual({ selected: 1, opens: true });
    expect(tabClickSelection(3, false)).toEqual({ selected: 3, opens: true });
  });
});
