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

// Arrow/Home/End movement is the rule every plugin record list shares, published by the plugin API.
export { nextListSelection as nextConversationSelection } from '../api';
