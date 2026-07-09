# Task Picker Scroll Into View

**Complexity: 1/10** — purely client-side, no new dependencies, no wire changes, no server touches. Follows the exact `useEffect` + `scrollIntoView` pattern already used by `FileTreeTab.tsx`.

## Summary

Pressing ArrowDown/ArrowUp in the task picker (the `Ctrl+A` / `tasks` overlay) changes the `selected` index but the scrollable `.picker` container never auto-scrolls to keep the selected row visible. When the list has more items than fit, the selection can scroll off-screen while the keyboard navigates below or above the visible area. The fix adds a `useEffect` that calls `scrollIntoView({ block: 'nearest' })` on the newly-selected row whenever `selected` changes, matching the exact pattern in `FileTreeTab.tsx:41-46`.

## Decisions

1. **`scrollIntoView({ block: 'nearest' })` rather than `scrollIntoView()` or a manual `scrollTop` calculation.** `block: 'nearest'` avoids unnecessary scrolling when the element is already visible — only scrolls the minimum needed to bring an out-of-view row into view. This matches the `FileTreeTab` precedent and is the standard approach for keyboard-navigated lists.
2. **Ref on the container div, query for `.picker-row.selected`.** The container ref avoids re-querying the DOM from global selectors. The `.selected` class is already present on the selected row, so no markup change is needed — just a `useRef` on the container and a `querySelector` in the effect.
3. **Only the task picker (TaskPicker).** The issue specifically mentions the "action picker" — the `Ctrl+A` task picker is the action/task selection popup. Other pickers (`HistoryPicker`, `QueuePicker`, `TabNavPicker`, `ThemePicker`) have the same behavior but are not in scope for this issue.

## Verified codebase facts that shape the design

- **`FileTreeTab.tsx:41-46` is the exact pattern to replicate:**
  ```tsx
  useEffect(() => {
    if (selected === null) return;
    containerRef.current?.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  ```
- **The `.picker` container already has `overflow-y: auto`** (`theme.css:236`), so `.scrollIntoView` will trigger a scroll on the correct scrollport.
- **`.selected` is already a class on the active row** (`picker-row.selected` in `TaskPicker.tsx:21`), so no markup changes are required.
- **`TaskPicker.tsx` is 32 lines** (well under the 200-line limit) and uses `import React from 'react'` — adding a `useRef` and `useEffect` import keeps it clean.

## Proposed changes

### 1. `web/src/TaskPicker.tsx`

- Add `useEffect, useRef` to the React import.
- Add a `containerRef = useRef<HTMLDivElement>(null)` at the top of the component body.
- Add a `useEffect` that runs when `selected` changes: query the container for `.picker-row.selected` and call `.scrollIntoView({ block: 'nearest' })`.
- Attach `ref={containerRef}` to the root `<div className="picker">`.

### 2. Tests: `web/src/TaskPicker.test.tsx`

- Mock `Element.prototype.scrollIntoView` (same pattern as `FileTreeTab.test.tsx:9`, `EditorTab.test.tsx:34`, `Sidebar.test.tsx:9`).
- Test that a non-visible selected row triggers `scrollIntoView`.
- Test that scrollIntoView is not called when there are no rows.

### 3. Specs: no change needed

The `specs/task-picker.md` already documents "Up / Down | Move the selection" — the scrolling behavior is an implementation detail of how selection movement works, not a user-visible behavioral contract change.

## Implementation order

1. Edit `web/src/TaskPicker.tsx` — add the ref, effect, and container ref.
2. Edit `web/src/TaskPicker.test.tsx` — add the scroll-into-view test.
3. Run `./scripts/run.mjs check-diff` — verify lint, typecheck, and tests pass.

## Out of scope

- Other pickers (history, queue, tab-nav, theme) — each has the same gap but the issue is scoped to the action picker only.
- Scroll restoration when opening the picker (it always opens at index 0, which is visible).
- Any server-side changes, wire changes, or CSS changes.

## Verification

- `./scripts/run.mjs check-diff` passes after each implementation step.
- The existing TaskPicker tests continue to pass (the new effect is side-effect-free in tests when `scrollIntoView` is mocked).
- Manual: open the task picker with enough tasks to overflow, press ArrowDown past the visible area, confirm the selected row scrolls into view.
