// Whether an element is a place typed text can go. Shared because three features ask it: the context
// menu deciding whether to offer Paste, the paste capability deciding where clipboard text lands, and
// the contributed-overlay seam deciding whether a paste already put the caret somewhere.

const TEXT_ENTRY_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
]);

// A place typed text can go: a text-ish input, a textarea, or anything contenteditable. A checkbox,
// a button, and a plain div are not, so a right-click on one of them offers no Paste.
export function isTextEntryElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TEXT_ENTRY_INPUT_TYPES.has(element.type);
  return element.isContentEditable;
}
