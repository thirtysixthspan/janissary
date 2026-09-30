// The shared list selection comes through the client plugin API, not by reaching into the host —
// the boundary rule forbids the direct import, and the API is where it is published.
import { nextListSelection } from '../api';

// The result window stacks upward, so the next match is the row above on screen. The shared rule
// reads a list top-down, and handing it the keys as pressed would walk the window the wrong way.
const SCREEN_KEYS = new Map([['ArrowUp', 'ArrowDown'], ['ArrowDown', 'ArrowUp']]);

// The shared arrow/Home/End rule, with the arrows turned to match the screen: `ArrowUp` moves to a
// later match and `ArrowDown` to an earlier one. Home and End keep meaning the first and the last
// match, and the ends still clamp rather than wrap.
export function nextResultSelection(length: number, selected: number | null, key: string): number | null {
  return nextListSelection(length, selected, SCREEN_KEYS.get(key) ?? key);
}
