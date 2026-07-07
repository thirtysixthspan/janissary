# Focus command bar when a tab label is pressed

## Problem

Pressing (mousedown) on a tab label selects the tab (`TabItem.tsx:34`, `onMouseDown={() => onSelect(index)}`) but does not move keyboard focus to the command bar. Focus only reaches the command bar indirectly, after the server round-trips the `setActiveTab` RPC and the `activeTab`-driven effect in `App.tsx` (lines 127-134) re-runs — and that effect only fires when `activeTab` actually changes value. So clicking the already-active tab's label, or clicking while the app window itself is being brought forward from another OS window, does not reliably move focus into the command bar.

The sibling case — pressing on the body of an agent tab — is already handled: `App.tsx:174` calls `inputReference.current?.focus()` directly in an `onMouseDown` handler on the `.tab-body` div, following the pattern established in `plans/complete/click-through-unfocused-window.md` (mousedown fires before window focus is granted, so it is delivered reliably even when the window was backgrounded).

## Complexity

2/10 — thread one optional callback prop through `TabItem.tsx` → `TabStrip.tsx` → `App.tsx`, mirroring the existing `.tab-body` mousedown-focus pattern.

## Solution

Add an optional `onFocusCommandBar` callback to `TabItem` and `TabStrip`, called directly in the tab `<div>`'s existing `onMouseDown` handler alongside `onSelect(index)`. `App.tsx` passes `() => inputReference.current?.focus()` down through `TabStrip`. Because this runs on `mousedown` (not `onSelect`'s eventual server round-trip), it fires immediately and reliably even when the window was previously unfocused — consistent with the existing pattern.

The prop is optional (not required) so existing `TabStrip`/`TabItem` call sites and tests that don't pass it keep compiling; harness/shell-PTY tabs still end up correctly focused afterward because the existing `activeTab`-driven effect (`App.tsx:127-134`) runs later and re-focuses the PTY terminal when the newly active tab is a PTY tab, overriding this immediate command-bar focus.

## Changes

### `web/src/TabItem.tsx`
- Add `onFocusCommandBar?: () => void` to `Properties`.
- In the tab `<div>`'s `onMouseDown`, call `onFocusCommandBar?.()` alongside `onSelect(index)`.

### `web/src/TabStrip.tsx`
- Add `onFocusCommandBar?: () => void` to `Properties`.
- Pass it through to each `TabItem`.

### `web/src/App.tsx`
- Pass `onFocusCommandBar={() => inputReference.current?.focus()}` to `TabStrip`.

## Tests

Add to `web/src/TabStrip.test.tsx`:
- `mousedown` on a tab label calls `onFocusCommandBar` (use `fireEvent.mouseDown` from `@testing-library/react` since `userEvent.click` doesn't isolate the `mousedown` phase).
- `mousedown` on a tab label still calls `onFocusCommandBar` when `onFocusCommandBar` is omitted (i.e. no crash — verifies the optional-callback path).

## Spec

Update `specs/tabs.md` to state that pressing a tab label moves keyboard focus to the command bar, alongside the existing statement (if present) about pressing the tab body doing the same.

## Out of scope
- No changes to the `activeTab`-driven focus effect in `App.tsx` (harness/shell PTY focus-on-switch behavior is unchanged).
- No window-level `focus`/`blur` listeners.
- No changes to the close button or rename input's existing `stopPropagation` handlers.
