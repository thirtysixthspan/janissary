# A default Copy/Paste context menu for surfaces that define none

**Complexity: 4/10** — one new feature directory in the web app holding a pure module, a clipboard module, a hook, and a thin component, plus one mount point in `AppShell`. No protocol change, no server change, and no change to any menu a surface already defines.

Right-clicking in the file navigator raises the app's own menu (`web/src/file-navigator/use-file-navigator-row-events.ts` → `ContextMenu`). Right-clicking anywhere else — an editor tab, a terminal, the command bar — falls through to the browser's own menu, which looks nothing like the rest of the app. The backlog item asks for an app-drawn default menu offering Copy and Paste wherever no surface has defined a menu of its own.

`web/src/ContextMenu.tsx` already draws a positioned, keyboard-navigable menu from caller-supplied groups and knows nothing about what its items do, so the whole of this change is deciding *when* a default menu appears, *what* it offers, and *what its two entries do*.

## Goal

A right-click that no surface claims raises the app's own menu with Copy and Paste, drawn in the same visual language as the file navigator's. A right-click a surface does claim is untouched.

## Design decisions

**The claim signal is `defaultPrevented`, not a registry.** The file navigator's row handler already calls `event.preventDefault()` on its `contextmenu` event. React attaches its listeners at the root container, so a native listener on `document` runs afterwards and sees `defaultPrevented === true` for exactly those events a surface has claimed. That is a signal every future surface gets for free by doing the one thing it must already do to suppress the browser menu — no registration, no list of exempt selectors to keep in sync.

**Nothing to offer means no menu at all.** When neither entry applies, the listener returns without calling `preventDefault()`, so the browser's own menu still appears rather than an empty box. An entry that does not apply is omitted, never greyed out — the convention `fileNavigatorMenuItems` already follows.

**Copy is offered only when there is selected text**, taken from the window selection at the moment the menu opens (the menu takes focus when it renders, so the text is captured up front rather than read back later).

**Paste is offered only when there is somewhere to paste.** The target is the text-entry element the click landed in (`closest('input, textarea, [contenteditable]')`), and failing that the focused text-entry element. The fallback is what makes the editor work: an editor tab's keystrokes go to a hidden textarea, so a right-click on a rendered line lands on a line element while the textarea holds focus. Terminals are the same shape. Where nothing text-entry is focused and the click hit no field — the file navigator's empty space, a transcript — Paste is simply absent.

**Paste is delivered as a `paste` event, with an `insertText` fallback.** Dispatching a `paste` `ClipboardEvent` carrying the clipboard text is what reaches surfaces that own their own paste handling: the editor cancels the event and inserts into its model (`useEditorInteractions.onPaste`), and xterm does the same for a terminal. When nothing cancels the event, the target is an ordinary field, and `document.execCommand('insertText', …)` inserts at the caret — which produces the real input event a React-controlled field needs, where writing `.value` directly would not. Both APIs are feature-detected: jsdom implements neither, and the modules must not throw where they are absent.

**Focus goes back where it was.** The menu takes keyboard focus while open, so the hook records what was focused when it opened and restores it on close — otherwise dismissing the menu would leave the app's key handling pointed at `body`.

**A feature directory, layered.** `web/src/context-menu/` holds the decision rules as a pure module, the clipboard work as a React-free module, the listener and state as a hook, and a component thin enough to read as markup — per `react-code-organization.md` §5–§8. It imports the shared `ContextMenu` and no feature.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The drawn menu, its placement, keyboard handling, and blur-to-dismiss | `web/src/ContextMenu.tsx` |
| The `.context-menu` / `.picker-row` styling | `web/src/theme.css` |
| The omit-an-unavailable-entry convention | `web/src/file-navigator/file-navigator-menu-items.ts` |
| The surface that claims its own right-click | `web/src/file-navigator/use-file-navigator-row-events.ts` |
| An editor paste handler that reads `clipboardData` and cancels the event | `web/src/editor/useEditorInteractions.ts` |
| `navigator.clipboard.writeText` already used for copy | `web/src/editor/applyKeyAction.ts` |
| The root layout every surface renders inside | `web/src/AppShell.tsx` |

## Implementation steps

1. **`web/src/context-menu/default-menu-target.ts`** (pure). Export `DefaultMenuTarget` (`selectionText`, `pasteTarget`, `restoreFocus`), `isTextEntryElement(element)` — a text-ish `input`, a `textarea`, or an element with `isContentEditable` — `resolveDefaultMenuTarget(event)` building the target from a `contextmenu` event's target, window selection, and `document.activeElement`, and `defaultMenuGroups(target, actions)` returning the `ContextMenuItem[][]` with Copy and Paste included only when they apply.

2. **`web/src/context-menu/clipboard-commands.ts`** (no React). `copyText(text)` writes through `navigator.clipboard` when it exists. `pasteInto(element)` focuses the element, reads the clipboard text, dispatches a cancelable `paste` `ClipboardEvent` carrying it when `ClipboardEvent`/`DataTransfer` exist, and falls back to `document.execCommand('insertText', false, text)` when the event went uncancelled.

3. **`web/src/context-menu/useDefaultContextMenu.ts`** (hook). Registers a `contextmenu` listener on `document`; ignores an event whose default is already prevented; resolves the target; returns without preventing when the target yields no entries; otherwise prevents the default and stores the pending menu. Exposes `pending` and a `close()` that restores focus.

4. **`web/src/context-menu/DefaultContextMenu.tsx`** (component). Calls the hook and renders `ContextMenu` with the groups from step 1, wiring Copy to `copyText` and Paste to `pasteInto`.

5. **`web/src/AppShell.tsx`**: render `<DefaultContextMenu />` inside the root `.app` element, so one listener serves every surface.

## Tests

- `web/src/context-menu/default-menu-target.test.ts` — `isTextEntryElement` accepts a text input, a textarea, and a contenteditable element and rejects a plain div and a checkbox; `resolveDefaultMenuTarget` takes the clicked field as the paste target, falls back to the focused field when the click landed elsewhere, and yields none when neither exists; `defaultMenuGroups` omits Copy with no selected text, omits Paste with no target, returns both when both apply, and its entries call the supplied actions.
- `web/src/context-menu/clipboard-commands.test.ts` — `copyText` writes through `navigator.clipboard` and does not throw when the API is absent; `pasteInto` focuses the element and dispatches a `paste` event carrying the clipboard text; it falls back to `execCommand('insertText', …)` only when nothing cancelled the event; an empty clipboard inserts nothing.
- `web/src/context-menu/DefaultContextMenu.test.tsx` — a right-click on a focused textarea with selected text opens a menu offering Copy and Paste; a right-click whose default a surface already prevented opens nothing; a right-click with neither entry applicable opens nothing and leaves the event's default intact so the browser menu still shows; activating Copy writes the selected text; closing the menu restores focus to the element that had it.

## Out of scope

- **Cut, Select All, or any third entry.** The backlog item names Copy and Paste.
- **Copying a terminal's selection.** xterm holds its selection outside the DOM, so a terminal offers no Copy from this menu; its existing `Cmd+C` / `Ctrl+Shift+C` copy path is unchanged.
- **Letting surfaces contribute entries to the default menu.** This menu exists for surfaces that define none; a surface with entries of its own defines its own menu, as the file navigator does.
- **Changing the file navigator's menu**, the editor's key bindings, or any existing copy/paste path.
