import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { CommandInputDropHandle } from './shared/drop-handles';
import { editorDropHandle } from './shared/drop-registry';
import { isTextEntryElement } from './context-menu/default-menu-target';
import { pasteTextInto } from './context-menu/clipboard-commands';

// Putting text at the keyboard caret, wherever the caret is.
//
// A top-level module on purpose. It is the one place free to import the command bar's drop handle,
// the editor's drop registry, the context menu's paste path, and the tab view all at once — the
// feature-directory lint zones stop any single feature from doing that — which is also where the
// `OverlayPluginCapabilities.paste` a plugin receives is built. The plugin never reaches here; the app
// shell constructs this and injects it, so a plugin can act on the world without being able to reach
// any of it.
//
// The order below is the whole decision, and it is why "is some field focused" cannot be the test:
// `isTextEntryElement` is true for the command bar's textarea *and* for an editor's hidden one, so a
// focused field names a surface only by accident. What names it is the marker each surface already
// writes on its own element — `data-command-bar`, and `data-editor-drop` carrying the tab label that
// is also the editor drop registry's key.
//
// A field the user is actually in always beats a tab-level fallback, because pasting into the
// Quick Open box is what they asked for even on a harness tab; the PTY and the command bar are what
// there is left when nothing holds the keyboard, which is exactly the harness-tab case.
//
// `anchor` is the element a right-click landed on, supplied when the overlay was opened from the
// context menu. It wins over focus, because a paste into a field the user right-clicked but had not
// focused has to leave the caret there.

export type PasteCapabilityOptions = {
  client: JanusClient;
  dropRef: React.RefObject<CommandInputDropHandle | null>;
  // The exposed tab, read at paste time rather than captured, so a tab switch between opening the
  // overlay and choosing an entry lands in the tab the user is looking at now.
  currentTab: () => TabView | undefined;
};

function focusedElement(): HTMLElement | null {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

function clickedField(anchor: HTMLElement | null): HTMLElement | null {
  const field = anchor?.closest('input, textarea, [contenteditable]') ?? null;
  return isTextEntryElement(field) ? field : null;
}

// The editor under the pointer or the keyboard, found through the marker it writes and the registry
// it already publishes its drop handle into. A hidden editor publishes nothing, so this can only
// find one that can actually receive the text.
function pasteIntoEditor(from: Element | null, text: string): boolean {
  const label = (from?.closest('[data-editor-drop]') as HTMLElement | null)?.dataset.editorDrop;
  if (!label) return false;
  const handle = editorDropHandle(label);
  if (!handle) return false;
  handle.pasteAtCaret(text);
  return true;
}

// The harness and ssh case: the text is typed into the PTY as terminal input and is *not* submitted.
// `insertIntoCommandLine` draws exactly this line — bare text, no trailing Enter — unlike
// `typeIntoHarness`, which exists to run a command on the user's behalf.
function pasteIntoPty(options: PasteCapabilityOptions, text: string): boolean {
  const ptyId = options.currentTab()?.harness?.ptyId;
  if (!ptyId) return false;
  options.client.send({ method: 'ptyInput', params: { id: ptyId, data: text } });
  return true;
}

function pasteIntoCommandBar(options: PasteCapabilityOptions, text: string): boolean {
  const handle = options.dropRef.current;
  if (!handle) return false;
  handle.insertAtCaret(text);
  return true;
}

export function createPasteCapability(options: PasteCapabilityOptions) {
  return (text: string, anchor: HTMLElement | null): void => {
    const focused = focusedElement();
    const clicked = clickedField(anchor);
    const field = clicked ?? (isTextEntryElement(focused) ? focused : null);

    if (field?.closest('[data-command-bar]') && pasteIntoCommandBar(options, text)) return;
    if (pasteIntoEditor(anchor ?? focused, text)) return;
    if (field) { pasteTextInto(field, text); return; }
    if (pasteIntoPty(options, text)) return;
    pasteIntoCommandBar(options, text);
  };
}
