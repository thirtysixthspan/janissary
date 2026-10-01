import { isTextEntryElement } from './text-entry';

// Where the keyboard was before a floating overlay took it, and how it goes back.
//
// An overlay that takes focus moves `document.activeElement` onto itself, so "where the caret is" has
// to be read once, as the overlay opens, and kept with it. The same element is where focus returns
// when the overlay is put away.

export function focusedElement(): HTMLElement | null {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

// Hands the keyboard back to `origin`. Skipped when the origin has left the document, and when a
// different text field holds focus now: a paste into a right-clicked field leaves the caret in that
// field, and taking it away again would undo what the user asked for.
export function returnFocus(origin: HTMLElement | null): void {
  if (!origin?.isConnected) return;
  const active = focusedElement();
  if (active !== origin && isTextEntryElement(active)) return;
  origin.focus({ preventScroll: true });
}
