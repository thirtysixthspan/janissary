import type { ContextMenuItem } from '../ContextMenu';

// What a right-click that no surface claimed has to work with: the text a Copy would write, the
// element a Paste would land in, and the element focus belongs to once the menu closes again.
export type DefaultMenuTarget = {
  selectionText: string;
  pasteTarget: HTMLElement | null;
  restoreFocus: HTMLElement | null;
};

export type DefaultMenuActions = {
  copy: (text: string) => void;
  paste: (element: HTMLElement) => void;
};

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

// The field a paste should reach: the one the click landed in, or — when the click landed on
// something else — whichever field holds the keyboard. The fallback is what makes an editor tab
// work, since its keystrokes go to a hidden textarea while a right-click lands on a rendered line.
function resolvePasteTarget(clicked: Element | null, focused: Element | null): HTMLElement | null {
  const field = clicked?.closest('input, textarea, [contenteditable]') ?? null;
  if (isTextEntryElement(field)) return field;
  return isTextEntryElement(focused) ? focused : null;
}

export function resolveDefaultMenuTarget(
  clicked: Element | null, focused: Element | null, selectionText: string,
): DefaultMenuTarget {
  const pasteTarget = resolvePasteTarget(clicked, focused);
  // Focus returns to the field a paste would have landed in, not to whatever held it before: a
  // paste into a field the user right-clicked but had not focused must leave the caret there.
  const previous = focused instanceof HTMLElement ? focused : null;
  return { selectionText, pasteTarget, restoreFocus: pasteTarget ?? previous };
}

// The default menu's single group. An entry that cannot act is omitted rather than greyed out,
// matching the file navigator's menu, so a target that supports neither yields no entries at all —
// which is the caller's signal to leave the right-click alone entirely.
export function defaultMenuGroups(
  target: DefaultMenuTarget, actions: DefaultMenuActions,
): ContextMenuItem[][] {
  const { selectionText, pasteTarget } = target;
  const copyEntry: ContextMenuItem[] = selectionText
    ? [{ label: 'Copy', onActivate: () => actions.copy(selectionText) }]
    : [];
  const pasteEntry: ContextMenuItem[] = pasteTarget
    ? [{ label: 'Paste', onActivate: () => actions.paste(pasteTarget) }]
    : [];
  const items = [...copyEntry, ...pasteEntry];
  return items.length > 0 ? [items] : [];
}
