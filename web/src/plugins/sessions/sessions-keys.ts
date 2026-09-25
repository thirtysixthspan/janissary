// Selection and key handling for the sessions list, kept pure so the navigation rules are testable
// without a render. The gestures are the conversations list's, because the two are the same kind of
// thing: a list of addressable records where opening one is a decision, not a hover.

// A click only ever moves the current row unless it lands on the row a previous click already made
// current, so opening with the mouse always takes a second click — including on the first row, which
// is current from the moment the list opens, and on a row the arrow keys moved to.
export function sessionClickSelection(
  clicked: number,
  confirmed: number | null,
): { selected: number; opens: boolean } {
  return { selected: clicked, opens: confirmed === clicked };
}

// Up/Down without wrapping, Home/End to the ends: the rule every plugin record list shares, published
// by the plugin API so this list cannot drift from the conversations and schedules lists.
export { nextListSelection as nextSessionSelection } from '../api';

// What opening a row does. An active, reconnecting, ssh, or navigator row focuses its tab; a
// detached row attaches it; a terminated row does nothing, because there is nothing left out there.
export function openIntentFor(
  state: string, actions: readonly string[],
): 'focus' | 'attach' | undefined {
  if (state === 'detached') return actions.includes('attach') ? 'attach' : undefined;
  if (state === 'terminated') return undefined;
  return actions.includes('focus') ? 'focus' : undefined;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The relative last-activity column. Coarse on purpose: the question a row answers is "recently, or
// a while ago", and a live seconds counter would redraw the list for no information.
export function relativeActivity(activity: number, now: number): string {
  const elapsed = Math.max(0, now - activity);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
