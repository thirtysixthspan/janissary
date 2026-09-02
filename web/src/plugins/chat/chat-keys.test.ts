import { describe, expect, it } from 'vitest';
import { chatClickSelection, nextChatSelection } from './chat-keys';

describe('nextChatSelection', () => {
  it('moves without wrapping past either end', () => {
    expect(nextChatSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextChatSelection(3, 2, 'ArrowDown')).toBe(2);
    expect(nextChatSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextChatSelection(3, 0, 'ArrowUp')).toBe(0);
    expect(nextChatSelection(3, 1, 'Home')).toBe(0);
    expect(nextChatSelection(3, 1, 'End')).toBe(2);
  });

  it('has nothing to move to in an empty list', () => {
    expect(nextChatSelection(0, null, 'ArrowDown')).toBeNull();
  });
});

describe('chatClickSelection', () => {
  it('makes the clicked row current without opening it', () => {
    expect(chatClickSelection(2, null)).toEqual({ selected: 2, opens: false });
    expect(chatClickSelection(2, 0)).toEqual({ selected: 2, opens: false });
  });

  it('opens only the row a previous click already made current', () => {
    expect(chatClickSelection(2, 2)).toEqual({ selected: 2, opens: true });
  });

  it('does not open the first row on its first click, even though it starts current', () => {
    expect(chatClickSelection(0, null)).toEqual({ selected: 0, opens: false });
    expect(chatClickSelection(0, 0)).toEqual({ selected: 0, opens: true });
  });
});
