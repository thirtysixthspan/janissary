// What a click on a conversation row does. A click only ever moves the current row unless it lands
// on the row a previous click already made current, so opening with the mouse always takes a second
// click — including on the first row, which is current from the moment the list opens, and on a row
// the arrow keys moved to, which clears `confirmed` back to null.
export function conversationClickSelection(
  clicked: number,
  confirmed: number | null,
): { selected: number; opens: boolean } {
  return { selected: clicked, opens: confirmed === clicked };
}

export function nextConversationSelection(
  length: number,
  selected: number | null,
  key: string,
): number | null {
  if (length === 0) return null;
  const index = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(index + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}
