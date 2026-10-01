# Give the clipboard-history popup the keyboard, and hand it back on the way out

**Complexity: 5/10** — focus moves between three surfaces with their own key handling (command bar, editor buffer, terminal), and the paste capability has to stop reading "where the caret is" from the live focus. Each change is small; the care is in the order of paste, close, and focus return.

## Goal

The pull request backlog asks:

- When the popup opens, keyboard focus moves to it, so `↑`/`↓` move its selection on every tab. Today the keyboard stays where it was, so in an editor buffer the arrows move the editor's caret and Return types a newline, and in a terminal the keys go to the PTY.
- With the popup focused, Escape and Tab close it and Return pastes the selected entry.
- After any of those, focus returns to the visible tab.

## Approach

Once focus leaves the surface the user was in, "where the caret is" can no longer be read from `document.activeElement` at paste time. That element is now the popup itself. So the element that held focus when the overlay opened becomes part of the overlay's open state, which the shared seam already owns.

1. **The seam records where focus came from.** `openContributedOverlay` captures the focused element as the overlay's focus origin. `contributedOverlayFocusOrigin()` answers it for the open overlay.
2. **The paste capability reads the origin.** `createPasteCapability` uses the open overlay's focus origin in place of the live focus whenever an overlay is open, so the command bar, an editor buffer, or a field still receives the paste. A field inside a terminal is not treated as a text field. That field is xterm's hidden input, and a paste event there would go through xterm's own paste handling and then be inserted again by `insertText`. The harness case keeps going to the PTY as `ptyInput`, which is what the spec describes.
3. **The popup takes focus.** The popup's root is focusable (`tabIndex={-1}`) and focuses itself on mount. Its keys then bubble to the window key handler, which already routes them to the open contributed overlay's `onKey`.
4. **Tab closes it.** The plugin's `onKey` closes on a plain Tab and prevents the browser's focus move, ahead of the shared picker rule (arrows, Return, Escape). Shift+Tab stays the section-navigation chord, which a capture-phase handler claims first.
5. **Focus returns on a plugin close.** `closeContributedOverlay`, the close the plugin calls after Return, a click, Escape, or Tab, hands focus back to the origin when it is still in the document. The one exception is a paste that put the caret in a different text field. A popup opened from the right-click menu pastes into the field that was clicked, and the caret has to stay there. Closing every overlay on a tab switch does not return focus, because the tab switch has its own focus rule.

The text-field predicate `isTextEntryElement` is needed by the seam, a shared module that may not import a feature, so it moves from `context-menu/default-menu-target.ts` into `shared/text-entry.ts`. The context menu and the paste capability import it from there, and its tests move with it.

## Implementation steps

1. Move `isTextEntryElement` and its input-type set to `web/src/shared/text-entry.ts`; update `context-menu/default-menu-target.ts` and `paste-into-surface.ts` to import it; move its tests to `web/src/shared/text-entry.test.ts`.
2. `web/src/shared/terminal/terminal/selection.ts` — export `isInsideTerminal(target)` from the existing registry resolution.
3. `web/src/shared/overlay-focus.ts` (new) — `focusedElement()` and `returnFocus(origin)`, the latter skipping when another text field now holds focus or the origin is disconnected.
4. `web/src/shared/contributed-overlays.ts` — store `focusOrigin` per registration; capture it in `openContributedOverlay`; clear it on close; `closeContributedOverlay` calls `returnFocus`; export `contributedOverlayFocusOrigin()`.
5. `web/src/paste-into-surface.ts` — use `contributedOverlayFocusOrigin() ?? focusedElement()` and skip a field inside a terminal.
6. `web/src/overlay-plugins/clipboard-history/Popup.tsx` — focusable root that focuses itself on mount with `preventScroll`.
7. `web/src/overlay-plugins/clipboard-history/index.tsx` — close on Tab.
8. `web/src/theme.css` — no focus outline on the popup root.

## Tests

- `shared/contributed-overlays.test.ts`: opening captures the focused element as the origin; closing returns focus to it; closing does not return focus when another text field holds it; closing all overlays does not return focus; a disconnected origin is left alone.
- `paste-into-surface.test.ts`: with an overlay open, a paste reaches the editor that held focus when it opened even though focus is elsewhere; a focused terminal textarea goes to the PTY rather than being pasted into.
- `shared/terminal/terminal/selection.test.ts` (or the closest existing test): `isInsideTerminal` is true inside a registered container and false outside.
- `overlay-plugins/clipboard-history/Popup.test.tsx`: the popup holds focus once rendered; Tab closes the overlay and prevents the default.
- `shared/text-entry.test.ts`: the moved predicate tests.

## Spec and docs

- `product/specs/clipboard-history.md` — replace the paragraph saying the editor buffer keeps its own focus under the popup with the new rule: the popup takes the keyboard on every tab; Tab closes it like Escape; focus returns to where it was afterwards, except when the paste went to a right-clicked field.
- `documentation/user-documentation/command-bar/clipboard.md` — add Tab beside Escape and say the keyboard goes back where it was.

## Out of scope

- Focus behavior of the built-in pickers.
- Changing how a paste reaches the PTY (bracketed paste and the like).
