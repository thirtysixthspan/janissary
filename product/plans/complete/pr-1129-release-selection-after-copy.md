# PR 1129 — release the selection after copy

Complexity: 4/10

## Goal

The Shift+drag selection layer's two copy paths — the Cmd+C/Ctrl+Shift+C chord in `useXterm.ts`
and the context menu's "Copy" entry — write the pick to the clipboard but deliberately leave the
frozen overlay standing afterward, so the only way to dismiss a held selection is Escape. The
reviewer's request is that copying should release the selection it just copied: select, copy,
and the overlay clears itself.

## Approach

Both copy paths already have a reference to the selection layer's `clear()` at the point they
write to the clipboard — they simply don't call it. Call it right after the clipboard write, and
only for the terminal selection layer's own held pick (not xterm's native selection fallback,
which is a different, pre-existing mechanism this PR doesn't touch).

- `useXterm.ts`: in the custom key handler, once `layerHeld` is true and the copy chord fires,
  clear the layer after `navigator.clipboard.writeText`. Update the surrounding comment, which
  currently documents the opposite behavior ("the same pick can be used twice").
- Context menu: `DefaultContextMenu.tsx` already knows `pending.selectionSource` and
  `pending.restoreFocus`. Wrap the `copy` action passed to `defaultMenuGroups` so that, after
  `copyText`, it also calls `clearTerminalSelection(pending.restoreFocus)` when the source is
  `'terminal'`. This reuses the same `clearTerminalSelection` helper the Escape path already
  calls in `useDefaultContextMenu.ts`.

## Implementation steps

1. `web/src/shared/terminal/useXterm.ts`: clear `selectionRef.current` after the clipboard write
   when `layerHeld`; rewrite the comment to describe the new behavior.
2. `web/src/context-menu/DefaultContextMenu.tsx`: import `clearTerminalSelection`; wrap the
   `copy` action so a terminal-sourced selection is cleared after the clipboard write.

## Tests

- `web/src/harness/HarnessTab.test.tsx`:
  - Update "copies the layer selection on the copy chord and leaves it held" to assert the
    overlay is cleared after the chord instead of asserting it survives.
  - Update "leaves the selection held when the menu closes another way" (context-menu Copy) to
    assert the overlay clears after the click.
- `web/src/context-menu/DefaultContextMenu.test.tsx`: add a case that registers a terminal
  selection access object (via `registerTerminalSelection`), right-clicks inside it, activates
  Copy, and asserts both the clipboard write and the terminal's `clear()` were called — proving
  the context-menu path only clears a terminal-sourced pick, not a dom/editor one.

## Out of scope

- xterm's own native selection fallback (`term.hasSelection()` / `term.getSelection()`), which is
  unrelated to the Shift+drag layer this PR adds.
- Any change to Escape's existing clear-on-close behavior.
