# Close last tab quits app even when sidebar tabs are docked

## Problem

When a file navigator is docked in a sidebar, the app's tab-count checks include it. Closing the last non-docked tab (e.g. janus) should quit the app, but the `tabs.length` comparisons see 2 instead of 1 and skip the quit path. The user is left with a docked file navigator and an empty center — the app stays open.

## Complexity

3/10 — filter out docked tabs from length checks in two files (server + client). The `dock` property already exists on every `Tab`/`TabView`.

## Solution

In every place that checks "is this the last tab?" to decide whether to quit, count only non-docked tabs (tabs where `dock` is `undefined`/`null`):

1. **`src/tab-manager.ts`** — `closeTab()`: compute the non-docked count and use it for both `closeTabResources(…, nonDockedCount)` and the `<= 1` quit check.
2. **`web/src/App.tsx`** — quit confirmation dialog trigger: use `tabs.filter(t => !t.dock).length === 1` to decide whether typing `close`/`exit` should show the quit dialog.
3. **`src/tab-cleanup.ts`** — no change needed; it already receives `tabsLength` from the caller and the corrected count is correct.

## Changes

### `src/tab-manager.ts`
- In `closeTab()`, compute `nonDockedCount = this.tabs.filter(t => !t.dock).length`.
- Pass `nonDockedCount` to `closeTabResources` instead of `this.tabs.length`.
- Compare `nonDockedCount <= 1` instead of `this.tabs.length <= 1`.

### `web/src/App.tsx`
- Change `tabs.length === 1` on the quit-confirmation line to `tabs.filter(t => !t.dock).length === 1`.

## Tests

- `src/controller.test.ts`: "closing the last tab quits the app even when a file navigator is docked in a sidebar" — dock a file tree tab, then close the janus tab and assert the exit sink is called.
- `src/controller.test.ts`: update "closing the last tab quits the app" if needed.

## Spec

Update `specs/tabs.md` to clarify that sidebar-docked tabs are excluded from the "last tab" count for quit purposes. Update `specs/sidebars.md` to state that a docked file navigator does not prevent app quit.

## Out of scope
- No changes to how Cmd+W / Ctrl+W works (it uses the same server path).
- No changes to close-by-name flow.
- No changes to save-before-close modal behavior.
