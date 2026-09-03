import { describe, expect, it } from 'vitest';
import { conversationClickSelection, nextConversationSelection } from './conversation-list-keys';

describe('nextConversationSelection', () => {
  it('moves without wrapping past either end', () => {
    expect(nextConversationSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextConversationSelection(3, 2, 'ArrowDown')).toBe(2);
    expect(nextConversationSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextConversationSelection(3, 0, 'ArrowUp')).toBe(0);
    expect(nextConversationSelection(3, 1, 'Home')).toBe(0);
    expect(nextConversationSelection(3, 1, 'End')).toBe(2);
  });

  it('has nothing to move to in an empty list', () => {
    expect(nextConversationSelection(0, null, 'ArrowDown')).toBeNull();
  });
});

describe('conversationClickSelection', () => {
  it('makes the clicked row current without opening it', () => {
    expect(conversationClickSelection(2, null)).toEqual({ selected: 2, opens: false });
    expect(conversationClickSelection(2, 0)).toEqual({ selected: 2, opens: false });
  });

  it('opens only the row a previous click already made current', () => {
    expect(conversationClickSelection(2, 2)).toEqual({ selected: 2, opens: true });
  });

  it('does not open the first row on its first click, even though it starts current', () => {
    expect(conversationClickSelection(0, null)).toEqual({ selected: 0, opens: false });
    expect(conversationClickSelection(0, 0)).toEqual({ selected: 0, opens: true });
  });
});
