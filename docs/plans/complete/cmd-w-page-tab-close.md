# Cmd+W closes the tab even when focus is inside an embedded web page (PageTab)

**Complexity: 3/10** — Add a `beforeunload` fallback in `useCmdW`; wire the active tab view into the hook; update tests.

## Goal

Pressing Cmd+W (or Ctrl+W) must close the current application tab even when focus is inside a cross-origin iframe (a PageTab). Currently the capture-phase `keydown` listener in `useCmdW` only works for keyboard events in the main window's document — events inside a cross-origin iframe never reach it, so Chrome's native Cmd+W handler closes the app window instead.

## Background

- `useCmdW.ts` — exists, has a capture-phase `keydown` listener for Cmd+W on `globalThis`. Works for every tab type except PageTab (cross-origin iframe).
- `web/src/App.tsx` — passes `activeTabRef`, `quitConfirmOpenRef`, `pickerOpenRef`, `routeRef` to `useCmdW`.
- `TabView.view` — `'page'` identifies a PageTab (embedded web page iframe).
- `spec/embedded-web-page.md` — spec for page tabs; mentions `close` command but not Cmd+W.

Cross-origin iframes isolate their browsing context: keyboard events inside the iframe never bubble to the parent window's event listeners. The only browser-level hook available is `beforeunload`, which fires whenever the window is about to close. By intercepting `beforeunload` when on a PageTab, we can cancel the window close and close the app tab instead.

## Approach

1. Add an `activeViewRef` parameter to `useCmdW` so the hook can check whether the current tab is a PageTab (`view === 'page'`).
2. Register a `beforeunload` event listener alongside the existing `keydown` capture listener. When the active tab is a PageTab and `beforeunload` fires, call `e.preventDefault()` (which shows the browser's confirmation dialog) and then `closeTab()` to close the app tab via RPC. If the user clicks "Stay" in the dialog, the window stays open and the tab is already closed by the RPC.
3. Use a `let` variable scoped to the effect to guard against re-entrancy (the `bye` → `window.close()` path would otherwise loop).
4. Wire `activeViewRef` in `App.tsx` by adding a ref that tracks `current.view`.

## Implementation steps

1. **Extend `useCmdW.ts`** — add `activeViewRef` parameter. Register `beforeunload` listener. Guard on `activeViewRef.current === 'page'`. Use a re-entrancy guard.
2. **Wire in `App.tsx`** — add `activeViewRef`, set it to the current tab's view, pass to `useCmdW`.
3. **Update tests** — `useCmdW.test.tsx`: add tests for `beforeunload` interception on page tabs.
4. **Update spec** — `spec/keyboard-navigation.md`: document that Cmd+W works from PageTabs.
5. **Run `./scripts/run.mjs check-diff`** after each step.

## Tests

- `web/src/useCmdW.test.tsx` — new tests:
  - `beforeunload` with page tab view calls `closeTab`
  - `beforeunload` with non-page tab view does nothing
  - `beforeunload` while quit dialog is open does nothing
  - `beforeunload` listener does not loop on re-entry

## Out of scope

- Chrome extension changes — the `beforeunload` approach avoids modifying the extension.
- Server-side changes — `closeTab` RPC already exists and works.
- Other iframe interactions (scrolling, clicking, form input) — they continue to work normally.
- The confirmation dialog shown by `beforeunload` is a browser-level UX that cannot be suppressed; it is acceptable for the niche case of closing a window while focus is in a cross-origin iframe.

## Verification

`./scripts/run.mjs check-diff` must pass clean.
