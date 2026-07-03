# Cmd+W closes a tab

**Complexity: 3/10** — add a single capture-phase keyboard listener in App.tsx, write tests; no server changes, no new modules.

## Goal

Pressing Cmd+W (or Ctrl+W on Linux/Windows) closes the current tab instead of triggering the browser's default behavior (close the Chrome window/tab).

## Background

The app already has a fully functional `closeTab(index)` RPC on both client and server. Tab strip × buttons and the `close` command both use it. A keyboard shortcut for the same action is the only missing piece.

The QuitDialog in `QuitDialog.tsx` already uses a **capture-phase** window-level `keydown` listener to intercept all keyboard input while the dialog is open. This is the correct pattern for Cmd+W, because:

- Bubble-phase listeners in `App.tsx` won't fire when focus is inside an xterm.js terminal (ShellTab, HarnessTab, TerminalCard) — xterm's `attachCustomKeyEventHandler` intercepts keys at a lower DOM level.
- EditorTab calls `stopPropagation()` on its React `onKeyDown`, blocking bubble-phase handlers.
- Capture-phase listeners fire **before** both xterm's custom handler and React's synthetic event system, so Cmd+W works from every tab type without per-tab changes.

The capture-phase listener must not close tabs while a picker, route chooser, or quit dialog is open.

## Approach

Add a `useEffect` in `App.tsx` that registers a capture-phase `keydown` listener on `globalThis`. When Cmd+W (or Ctrl+W) is pressed AND no picker/route/quit dialog is open, call `e.preventDefault()` and `closeTab(activeTab)`. Use refs for the state snapshot to avoid re-registering the listener on every render.

The QuitDialog's capture-phase listener is already registered first (it mounts/unmounts within the component tree), so Cmd+W is naturally swallowed during quit confirmation without any explicit check.

## Implementation steps

1. **Add Cmd+W capture listener in `App.tsx`** — add a `useEffect` before the window-level bubble-phase `onKey` handler, registering a capture-phase `keydown` listener that checks for Cmd+W (or Ctrl+W) and calls `closeTab(activeTab)`. Skip when `pickerOpen`, `route`, or `quitConfirmOpen` is true. Use refs for the state snapshot.

2. **Write `App.test.tsx`** — tests for Cmd+W behavior covering: closing a tab via Cmd+W, closing a tab via Ctrl+W, not closing when the picker is open, not closing when the route chooser is open, not closing when the quit dialog is open, and cleanup on unmount.

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Testing

- `web/src/App.test.tsx` — new test file:
  - Cmd+W (`metaKey: true, key: 'w'`) sends `closeTab` RPC
  - Ctrl+W (`ctrlKey: true, key: 'w'`) sends `closeTab` RPC
  - Cmd+W does nothing while history picker is open
  - Cmd+W does nothing while route chooser is open
  - Cmd+W does nothing while quit dialog is open
  - Listener is removed on unmount

## Out of scope

- Server-side changes — `closeTab` already exists
- Protocol changes — the `closeTab` RPC is already defined
- Per-tab key handling changes — capture-phase intercepts before any per-tab handler
- QuitDialog changes — its capture-phase listener fires first and swallows Cmd+W

## Verification

`./scripts/run.mjs check-diff` must pass clean.
