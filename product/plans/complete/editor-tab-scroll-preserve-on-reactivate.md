# Preserve editor scroll position across tab switches

**Complexity: 3/10** — one `useEffect` in `EditorTab.tsx` gains a "did the cursor actually move" check; one file touched, no new modules.

## Goal

Switching away from an editor tab and back must leave the editor's viewport (scroll position), cursor position, and keyboard focus exactly as the user left them. Today, returning to an editor tab can snap the scroll position back to wherever the caret happens to be, even if the user had deliberately scrolled elsewhere before switching away.

## Background

`web/src/EditorTab.tsx` keeps editor tabs mounted persistently (via `MountedViewLayers`), toggling visibility with `display: none`/`flex` rather than unmounting, specifically so buffer, undo, cursor, and scroll state survive tab switches.

Despite that, this `useEffect` (around line 106) fires a corrective scroll whenever the tab becomes active again, not just when the cursor genuinely moves:

```tsx
const initialScrollDone = useRef(false);
useEffect(() => {
  if (!active || !state) return;
  if (!initialScrollDone.current) {
    initialScrollDone.current = true;
    caretRef.current?.scrollIntoView({ block: editor.line === undefined ? 'nearest' : 'center' });
    return;
  }
  caretRef.current?.scrollIntoView({ block: 'nearest' });
}, [active, state?.cursor.line, state?.cursor.col]);
```

Because `active` is in the dependency array, the effect re-runs every time the tab is reactivated (`active: false -> true`), even when the cursor position hasn't changed since the tab was last visible. `scrollIntoView({ block: 'nearest' })` is a no-op only when the caret is already within the *current* scroll viewport; if the user had manually scrolled the editor body away from the caret before switching tabs, reactivating the tab snaps the viewport back to the caret, discarding the user's scroll position.

Keyboard focus is already restored correctly by a separate effect (`if (active && loaded) textareaRef.current?.focus()`), and the native scroll offset of `.editor-body` (an `overflow-y: auto` container) is preserved automatically by the browser while the element is merely hidden via `display: none` rather than unmounted — so no fix is needed there.

## Approach

Only call `scrollIntoView` when the cursor's `(line, col)` has actually changed since the effect last ran — not merely because `active` flipped to `true`. Track the last-seen cursor position in a ref; compare against it inside the effect and skip the corrective scroll when the cursor is unchanged.

## Implementation steps

1. **`web/src/EditorTab.tsx`** — add a `lastCursorRef` (`{ line: number; col: number } | null`, initialized to `null`) alongside `initialScrollDone`. In the effect:
   - Keep the existing initial-load branch unchanged (it always scrolls on first load), and record the cursor into `lastCursorRef` there too.
   - In the follow-up branch, compare the current `state.cursor.{line,col}` against `lastCursorRef.current`; only call `scrollIntoView({ block: 'nearest' })` when they differ (or `lastCursorRef.current` is `null`). Always update `lastCursorRef.current` to the current cursor position before returning, so the next activation compares correctly.
2. Run `./scripts/run.mjs check-diff` after the change.

## Tests

- `web/src/EditorTab.test.tsx` — new test: after the editor is active and loaded, deactivating the tab (`rerender` with `active={false}`) and then reactivating it (`rerender` with `active`) without moving the cursor does **not** call `scrollIntoView` again (mock cleared before reactivating; assert not called).
- `web/src/EditorTab.test.tsx` — existing test `'scrolls the caret into view when the cursor moves'` continues to pass unchanged, confirming genuine cursor moves while active still scroll.

## Out of scope

- Restoring scroll position for non-persistently-mounted tab types (page, markdown, files, notifications).
- Any change to how `.editor-body`'s native scroll offset is preserved (already correct).
- The keyboard-focus-restoration effect (already correct).
- Other issues in `product/backlog/issues.md`.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open a long file in the editor, scroll away from the caret, switch to another tab, then switch back — the scroll position should remain where it was left, not jump to the caret.
