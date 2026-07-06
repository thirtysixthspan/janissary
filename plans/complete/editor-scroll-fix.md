# Editor scroll position fix

**Complexity: 2/10** — one dependency expression in a `useEffect` changed from an object reference to primitive values; one source file touched, no new modules.

## Goal

When the user types in the editor, the scroll position stays where it is. Currently, after typing, the scroll bar can reset to the top of the document.

## Background

In `web/src/EditorTab.tsx:58`, a `useEffect` calls `scrollIntoView({ block: 'nearest' })` on the caret element whenever the cursor changes:

```tsx
useEffect(() => { if (active) caretRef.current?.scrollIntoView({ block: 'nearest' }); }, [active, state?.cursor]);
```

The dependency `state?.cursor` is an object `{ line, col }`. Every state change (typing, deleting, moving the cursor) creates a brand-new `EditorState` and therefore a brand-new `cursor` object. Since React compares `useEffect` dependencies with `Object.is`, and a new object is never `===` to the old one, this effect fires on **every keystroke**, not just when the cursor actually moves.

During React reconciliation, `contentSegments` in `render.tsx` unmounts the old caret span and mounts a new one at the updated column. During this ref transition, `caretRef.current` may briefly be `null`. If the effect fires when the ref is null, `scrollIntoView` is silently skipped (optional chaining). Without a corrective scroll, the browser may independently reset the scroll position after the layout shift from text insertion.

## Approach

Change the dependency from the `cursor` object to its primitive fields (`line` and `col`). React will compare number values with `===`, so the effect only fires when the cursor actually moves to a different line or column.

## Implementation steps

1. **Change the `useEffect` dependency** — in `web/src/EditorTab.tsx:58`, replace `state?.cursor` with `state?.cursor.line, state?.cursor.col` in the dependency array.
2. **Run `./scripts/run.mjs check-diff`** after the change.

## Testing

- `web/src/EditorTab.test.tsx` — add a test that verifies `scrollIntoView` is called when the cursor line or column changes, but **not** called on every keystroke when the cursor remains on the same line (e.g., typing at the end of a line moves the cursor by one column, which should trigger a scroll; typing in the middle of a line also moves the cursor, so the effect should fire on any meaningful cursor change). The key assertion is that the effect reacts to cursor position changes and that the scroll call happens after a render cycle.

## Out of scope

- Rewriting the `contentSegments` ref attachment logic in `render.tsx`.
- Adding scroll position tracking or restoration logic.
- Changing the CSS scroll container behavior.
- Addressing other issues in `docs/small-issues.md`.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open an editor tab, type text until the document scrolls, then continue typing in the middle of the document and observe that the scroll position does not jump to the top.
