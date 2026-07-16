# Shift+←/→ should select text in the editor tab, like Shift+↑/↓

**Complexity: 2/10** — remove one early-return guard in `EditorTab.tsx` that was deliberately
added to avoid shadowing the app-wide tab-switch binding, now that the recently-added
`Cmd+Shift+[`/`Cmd+Shift+]` binding (see `product/plans/complete/cmd-shift-bracket-tab-switch.md`)
gives users a way to switch tabs from the editor without needing `Shift+←/→` for it.

## Goal

While focused on the editor tab's text area, `Shift+←` / `Shift+→` extend the selection by one
character, exactly like `Shift+↑` / `Shift+↓` already extend it by one line/row. This matches how
every native text input behaves and removes an inconsistency where three of the four
Shift+Arrow combos select text but the horizontal pair silently does nothing.

## Root cause / current behavior

`EditorTab.tsx`'s `onKeyDown` (`:155-166`) has a deliberate early-return guard, predating the
`Cmd+Shift+[/]` binding:
```ts
const onKeyDown = (e: React.KeyboardEvent) => {
  if (e.nativeEvent.isComposing) return;
  // Shift+Left/Right switches tabs everywhere else in the app (see useWindowKeys); let it
  // bubble there instead of extending the selection, so the editor doesn't shadow that binding.
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
  e.stopPropagation();
  const action = actionForKey(e);
  ...
```
Returning early here skips `e.stopPropagation()` and `actionForKey(e)`/`api.apply(...)`
entirely, so the keydown bubbles up to `useWindowKeys`'s window-level listener, which treats it
as the app-wide tab-switch shortcut instead.

`web/src/editor/keys.ts`'s `plainAction` already handles all four arrow directions uniformly —
`{ kind: 'move', dir, extend: e.shiftKey }` — so `Shift+←/→` would already extend the selection
correctly if the event ever reached `actionForKey`. **No change is needed there or in the motion/
selection logic** — this is purely about the one guard in `EditorTab.tsx` that stops the event
before it gets that far.

There is already a working precedent for the editor locally shadowing an app-wide Shift+Arrow
binding: `Shift+↑/↓` is bound app-wide to scrolling the transcript (`useWindowKeys`'s
`handleScrollKey`), but the editor's `onKeyDown` calls `e.stopPropagation()` for those keys today
(no special-case guard), so the editor's own selection-extend action wins and the scroll binding
never fires while the editor has focus. Removing the `Shift+←/→` guard makes all four directions
consistent with that existing precedent.

## Approach

Delete the early-return guard. `Shift+←/→` then falls through to the same
`stopPropagation()` → `actionForKey(e)` → `api.apply(...)` path every other handled key already
takes, extending the selection and preventing the keystroke from reaching the window-level
tab-switch handler — exactly like `Shift+↑/↓` today. Tab switching from inside the editor is
still available via `Cmd+Shift+[` / `Cmd+Shift+]` (untouched by this guard, since it only ever
matched `ArrowLeft`/`ArrowRight`).

## Implementation steps

1. **`web/src/EditorTab.tsx`** — remove the guard and its comment from `onKeyDown` (`:155-159`):
   ```ts
   const onKeyDown = (e: React.KeyboardEvent) => {
     if (e.nativeEvent.isComposing) return;
     // Nothing typed in the editor may reach App's global bindings (Ctrl+T, Ctrl+R, Ctrl+arrows).
     e.stopPropagation();
     const action = actionForKey(e);
     if (!action) return;
     e.preventDefault();
     api.apply(action, pageLines(), resolveVertical);
   };
   ```

## Tests

- **`web/src/EditorTab.test.tsx`** — two existing tests encode the old behavior and must be
  flipped:
  - `:240-249` ("does not consume Shift+ArrowLeft/Right, so it can reach the window-level
    tab-switch shortcut") — replace with a test asserting the keydown listener on `window` is
    **not** called for `Shift+ArrowLeft`/`Shift+ArrowRight` (the editor now consumes them, same
    as it already does for `Shift+ArrowUp`/`Shift+ArrowDown`).
  - `:251-256` ("Shift+ArrowRight no longer extends the in-editor selection") — replace with a
    test asserting `container.querySelector('.editor-sel')` is **not** null after
    `Shift+ArrowRight`, i.e. it now does extend the selection.
  - Add the mirror case for `Shift+ArrowLeft` extending the selection (typing some text first so
    there's a character to select backward over).

## Out of scope

- `web/src/editor/keys.ts` / `web/src/editor/motion.ts` / selection-state logic — already correct
  for all four arrow directions; nothing to change there.
- The `Cmd+Shift+[`/`Cmd+Shift+]` binding itself — already implemented and unaffected, since it's
  a different key (`[`/`]`) never matched by the guard being removed.
- Any other tab type's Shift+←/→ handling (harness/shell full-tab terminals, `TerminalCard`) —
  unrelated to the editor tab, not touched.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected web tests.
- Manual: not practical to drive real keyboard events against the built app in this environment;
  covered by the updated/added unit tests above instead.
