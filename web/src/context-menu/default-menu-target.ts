import type { ContextMenuItem } from '../shared/ContextMenu';

// What a right-click that no surface claimed has to work with: the text a Copy would write, the
// element a Paste would land in, the element focus belongs to once the menu closes again, and the
// element the click itself landed on. `selectionSource` records whether text belongs to the DOM, the
// editor, or an xterm terminal. Copy and a contributed entry can both use every source.
export type DefaultMenuTarget = {
  selectionText: string;
  selectionSource?: 'dom' | 'editor' | 'terminal';
  pasteTarget: HTMLElement | null;
  restoreFocus: HTMLElement | null;
  // What the pointer was over, before it was narrowed to a text-entry field. A right-click on a
  // terminal or a rendered transcript line lands on something that cannot take a paste, but it is
  // still the best answer to "where would the user want this to go", so it is kept.
  clicked: HTMLElement | null;
};

export type DefaultMenuActions = {
  copy: (text: string) => void;
  paste: (element: HTMLElement) => void;
  // Opens the clipboard-history popup, anchored at the element the right-click landed on. Offered
  // whether or not a paste target resolved, which is what makes this the entry that can appear on a
  // surface where the other two cannot.
  pasteFromClipboard: (anchor: HTMLElement | null) => void;
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

export function editorSelectionText(clicked: Element | null): string {
  if (!(clicked instanceof HTMLElement)) return '';
  return clicked.closest<HTMLElement>('[data-editor-selection]')?.dataset.editorSelection ?? '';
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
  selectionSource: 'dom' | 'editor' | 'terminal' = 'dom',
): DefaultMenuTarget {
  const pasteTarget = resolvePasteTarget(clicked, focused);
  // Focus returns to the field a paste would have landed in, not to whatever held it before: a
  // paste into a field the user right-clicked but had not focused must leave the caret there.
  const previous = focused instanceof HTMLElement ? focused : null;
  return {
    selectionText, selectionSource, pasteTarget, restoreFocus: pasteTarget ?? previous,
    clicked: clicked instanceof HTMLElement ? clicked : null,
  };
}

// The default menu's single group. An entry that cannot act is omitted rather than greyed out,
// matching the file navigator's menu — with one deliberate exception, `Paste from clipboard…`, which
// can always act and therefore always appears. It is the entry that makes the menu answer on a surface
// with nothing selected and no field to type into, such as a terminal, which used to open no menu at
// all.
export function defaultMenuGroups(
  target: DefaultMenuTarget, actions: DefaultMenuActions,
): ContextMenuItem[][] {
  const { selectionText, selectionSource, pasteTarget, clicked } = target;
  const copyEntry: ContextMenuItem[] = selectionText === ''
    ? []
    : [{ label: 'Copy', onActivate: () => actions.copy(selectionText) }];
  // A live terminal copy region withholds Paste even when a field elsewhere holds focus and would
  // otherwise resolve as the paste target — the drag committed to Copy, not to pasting into
  // whatever had focus before it started.
  const isTerminalCopyRegion = selectionSource === 'terminal' && selectionText !== '';
  const pasteEntry: ContextMenuItem[] = pasteTarget && !isTerminalCopyRegion
    ? [{ label: 'Paste', onActivate: () => actions.paste(pasteTarget) }]
    : [];
  const historyEntry: ContextMenuItem[] = [
    { label: 'Paste from clipboard…', onActivate: () => actions.pasteFromClipboard(clicked) },
  ];
  const items = [...copyEntry, ...pasteEntry, ...historyEntry];
  return items.length > 0 ? [items] : [];
}
