# Keep the overlay-plugin host stable across renders

**Complexity: 4/10** — one `useCallback` at the call site, one ref inside the hook, and the first test
that renders the hook at all.

## Summary

`useOverlayPlugins` builds its host in a `useMemo` that lists the caller's `currentTab` option as a dependency, and
`App` passes that option as an inline arrow. A fresh identity every render means a new host every render, and the
effect cleanup that calls `host.dispose()` fires against the previous one — which disposes every loaded plugin module,
so `disposeHistory` runs, clearing the recorded entries and dropping the copy subscription.

`App` re-renders constantly and re-renders *because of this feature*: the hook subscribes to the seam's version with
`useSyncExternalStore`, and the version bumps the moment a plugin registers. So the popup's own activation is enough
to dispose it.

## Design decisions

### Fix it in the hook, and at the call site

Both halves are needed and neither is sufficient alone.

The hook's `useMemo` exists to build one session-scoped host, and every value it legitimately depends on is stable:
`client`, `dropRef`, and `onDisabled`. `currentTab` is the exception because it is a *reader* of state that changes,
not a value that changes — the host wants "the current tab at the moment a paste happens", which is exactly what the
existing `maxEntriesRef` pattern already does for the cap. So `currentTab` joins `maxEntriesRef`: read through a ref
inside the memo body, and drop it from the dependency list. That makes the hook correct for *any* caller, including one
that cannot be edited.

`App` still gets the `useCallback`, because an inline arrow at the call site is the trap itself and the hook's own
comment should not have to explain why the option is safe to pass inline.

### The test has to render the hook

Every existing test constructs a host directly, which is why nothing caught this: the bug is in the hook's memo
lifecycle, and no test mounts the hook. `web/src/useOverlayPlugins.test.tsx` is therefore new, and it is the real
deliverable of this entry rather than an extra assertion.

## Proposed changes

### 1. `web/src/useOverlayPlugins.ts`

- Add `currentTabRef` beside `maxEntriesRef`, assigned on each render the same way.
- Pass `currentTab: () => currentTabRef.current` to `createPasteCapability` inside the memo.
- Remove `currentTab` from the memo's dependency list.
- Update the file's comment to say why: the host is session-scoped, so every dependency must be stable, and a
  caller-supplied closure that reads current state belongs behind a ref.

### 2. `web/src/App.tsx`

- Wrap the `currentTab` argument in a `useCallback` with an empty dependency list. `App` already imports
  `useCallback`.

### 3. `web/src/useOverlayPlugins.test.tsx` (new)

Renders the hook with `renderHook` and a stub client. Cases:

- Rerendering with a **new** `currentTab` identity returns the **same** host object. This is the assertion that fails
  today.
- A plugin registered on the seam before the rerender is still registered after it — the user-visible half, since a
  disposed host takes the overlay off the seam.
- Unmounting disposes the host, withdrawing its claims, so nothing answers afterwards.
- The cap reaches the plugin through the ref: rerendering with a different `maxEntries` keeps the same host and the
  new value is still readable by a capability.

## Tests

All of the above live in the new `web/src/useOverlayPlugins.test.tsx`. No existing test needs to change; none of them
mount this hook.

## Out of scope

- The `.picker-row` ellipsis and the thirteen other pickers.
- A second concurrent `activate` calling `start` twice.
- The reserved-chord list duplicating the core bindings.

## Verification

- `./scripts/run.mjs check-diff`.
- `./scripts/run.mjs pr-check-gate`.
