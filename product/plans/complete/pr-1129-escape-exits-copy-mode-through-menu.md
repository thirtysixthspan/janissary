# PR 1129 — Escape closes the drag-opened menu and exits copy mode together

Complexity: 5/10

## Goal

Releasing a Shift+drag over a non-empty pick opens the default Copy/Paste menu automatically and
moves keyboard focus onto it. Pressing Escape at that point closes the menu — `ContextMenu`'s own
`onKeyDown` handles it and calls `onClose`, which restores focus to the terminal — but the frozen
selection overlay is left standing, because `useSelectionLayer`'s own Escape handling only runs
for a keydown the terminal's container itself receives, and the menu lives outside that container
in the DOM. A user who presses Escape right after a drag sees the menu vanish but the terminal
still frozen behind a highlight, and has to press Escape a second time to actually leave copy mode.
The fix is to make the one Escape that closes the auto-opened menu also clear the selection it was
opened for.

## Approach

`ContextMenu`'s `onClose` already fires from three places — Escape, an activated item, and blur —
and only the Escape path should reach into the terminal's selection. Widen `onClose` to take an
optional reason and pass `'escape'` from the `Escape` case only; the blur handler's call site
changes from `onBlur={onClose}` to `onBlur={() => onClose()}` so it keeps passing no reason
instead of the `FocusEvent` React would otherwise hand it positionally. `useDefaultContextMenu`'s
`close` reads the reason: when it is
`'escape'` and the pending menu's `selectionSource` is `'terminal'`, it clears the selection the
terminal registered under `terminal-selection.ts`'s registry — the same registry the menu already
reads to resolve what a right-click's Copy would send. That registry needs a `clear` alongside its
existing `hasSelection`/`getSelection`, which `useXterm` supplies from the selection layer's own
`clear()`. Activating Copy or Chat about this, or blurring the menu another way, is unaffected —
those keep leaving the pick held, matching the existing "same pick can be used twice" design.

## Implementation steps

1. `web/src/shared/terminal/terminal-selection.ts`: add `clear: () => void` to `TerminalAccess`;
   export `clearTerminalSelection(target: Element | null): void`, sharing the innermost-container
   resolution `terminalSelectionText` already does, and calling the resolved registration's
   `clear()` when one is found.
2. `web/src/shared/terminal/useXterm.ts`: pass `clear: () => selectionRef.current.clear()` in the
   `registerTerminalSelection` call alongside `hasSelection`/`getSelection`.
3. `web/src/shared/ContextMenu.tsx`: widen the `onClose` prop to `(reason?: 'escape') => void`;
   call `onClose('escape')` from the `Escape` case; change `onBlur={onClose}` to
   `onBlur={() => onClose()}` so it keeps passing no reason.
4. `web/src/context-menu/useDefaultContextMenu.ts`: change `close` to `close(reason?: 'escape')`;
   when `reason === 'escape'` and `pending?.selectionSource === 'terminal'`, call
   `clearTerminalSelection(pending.restoreFocus)` before restoring focus.

## Tests

- `web/src/shared/terminal/terminal-selection.test.ts`: `clearTerminalSelection` calls the
  innermost registered container's `clear()`, and does nothing when no registration contains the
  target.
- `web/src/context-menu/useDefaultContextMenu` behavior via `DefaultContextMenu.test.tsx` (or a
  harness-level test in `HarnessTab.test.tsx` alongside the existing drag/menu coverage): Escape
  on the menu that a completed drag opened for a terminal selection also clears the frozen overlay
  (`.terminal-selection-overlay` is gone after the Escape); Escape on a menu opened for a DOM/editor
  selection, and Copy/Chat-about-this activation on a terminal-sourced menu, leave the terminal
  selection untouched exactly as before.

## Spec updates

- `product/specs/harness.md`: the paragraph stating "an Escape pressed anywhere else — another
  tab, a menu, a dialog — never touches the selection at all" needs to carve out the menu the
  drag's own release opens: Escape there now closes the menu and clears the selection together.
- `product/specs/keyboard-navigation.md`: the matching sentence, "An Escape pressed anywhere other
  than the terminal that holds the selection never touches it," needs the same exception.

## Out of scope

- The other pull-request backlog entry (selection layer color/spacing fidelity to harness
  content) — separate, higher-complexity work.
- Any change to what Copy, Paste, or Chat about this do when activated from this menu, or to
  Escape's behavior on a menu opened by an ordinary right-click when nothing is frozen.
