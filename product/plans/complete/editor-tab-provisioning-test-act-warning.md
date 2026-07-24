# Fix act() warning in the provisioning-tab EditorTab test

**Complexity: 2/10** — one test is missing an `await` that lets a mount-time promise resolve inside
`act()`; no production code changes.

## Goal

`web/src/EditorTab.test.tsx`'s `renders the provisioning sync status icon for a synced tab not yet
filled in, without loading content` test no longer prints the React `act(...)` warning to stderr
during `npm run test`.

## Root cause

`useEditorSuggest` (`web/src/editor/useEditorSuggest.ts:86-91`) fires an `editorPersonas` request
on mount and calls `setPersonas` in its `.then()`. Every other `EditorTab` test that calls `render`
directly follows it with an `await waitFor(...)` (or `await renderLoaded`), which keeps React
Testing Library's `act()` scope open long enough for that mocked, promise-based `client.request`
(`makeClient`'s `request = vi.fn().mockResolvedValue(...)` in the same test file) to resolve and
apply `setPersonas` inside `act()`.

The provisioning-tab test is the one exception: it calls `render(...)` and then asserts
synchronously with no following `await`, so the test function returns before the mocked request's
`.then()` callback runs. That callback's `setPersonas` call lands after the test (and its implicit
`act()` wrapping) has already exited, which is exactly what triggers React's "not wrapped in
act(...)" warning.

## Approach

Give this test the same shape as its neighbors: keep a handle on the render result and await a
`waitFor` assertion (using the two expectations already being made) before making the rest of the
assertions. This flushes the pending `editorPersonas` promise inside `act()`, matching every other
direct-`render` test in the file, without touching any production code.

## Implementation steps

1. In `web/src/EditorTab.test.tsx`, update the
   `renders the provisioning sync status icon for a synced tab not yet filled in, without loading
   content` test (around line 361) to `await waitFor(...)` on the provisioning-icon assertion
   before making the remaining synchronous assertions.

## Tests

No new test cases — this only changes an existing test's structure so it no longer produces a
console warning. Verify via `./scripts/run.mjs check-diff` (or `npm run test:client` for the full
file) that:
- The test still passes.
- The `act(...)` warning no longer appears in stderr output for this test.

## Out of scope

- Any change to `useEditorSuggest.ts` or other production code — the mount-time persona fetch is
  correct application behavior; only the test's missing `await` caused the warning.
- Auditing other test files for the same pattern; this plan only covers the specific warning named
  in the issue.
