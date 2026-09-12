# Stop the PDF late-rejection test racing its own render call

**Complexity: 2/10** — a single test case in one file; no production code changes.

## Goal

`web/src/plugins/pdf/PdfTab.test.tsx > PdfTab failure > ignores a late rejection after zoom` fails intermittently on master with `TypeError: reject is not a function` at the line that rejects the pending render. It passes when the file, or even the whole `client` project, runs on its own, and failed inside a full two-project run where the machine was loaded.

The failure is in the test's own setup, not in the plugin. The case captures its `reject` from inside a `mockImplementationOnce`, so `reject` exists only once `renderPage` has actually been called — and `renderPage` is only called after the page's `IntersectionObserver` effect has been registered and the test's `onScreen(...)` callback has reached it. The test notifies the observer once, immediately after mount, and then assumes the render is already in flight. When the effect that registers that observer has not been flushed at that moment, the notification reaches nobody, `renderPage` is never called, and the `reject` the next line calls is still `undefined`. Nothing in the test waits for, or asserts, the render call it depends on, so the symptom is an opaque `TypeError` rather than a statement about what went wrong.

Make the case deterministic, and make it state what it depends on.

## Approach

Two changes to the one case, both in the test:

1. **Create the pending render's rejector up front**, not as a side effect of the mock being called: build the promise (and capture `reject`) in the test body, and have `mockImplementationOnce` hand that same promise back. `reject` is then a function from the first line of the test onwards, whatever the render does, so the `TypeError` cannot recur.
2. **Wait until the render has actually started**, re-notifying the observer while waiting: `await waitFor(() => { onScreen({ 0: 1 }); expect(document_.renderPage).toHaveBeenCalled(); })`. Re-sending the notification is what makes this robust — if the page's observer was not registered on the first pass, a later pass reaches it, and `onScreen` is idempotent because it only drives the page from not-near to near. If the render genuinely never starts, the case now fails on an assertion naming `renderPage`, not on a `TypeError` about the test's own variable.

The scenario the case exists for is unchanged: a render is in flight, the tab is closed or zoomed, the render then rejects, and no `load-failed` intent is reported.

## Implementation steps

1. **`web/src/plugins/pdf/PdfTab.test.tsx`** — in `ignores a late rejection after %s`, build the pending promise and its `reject` in the test body and return it from `mockImplementationOnce`.
2. **Same case** — replace the bare `onScreen({ 0: 1 })` with the `waitFor` that re-notifies and asserts `renderPage` was called.

## Tests

The change is to a test. The case keeps both of its parameterisations (`close`, `zoom`) and its existing assertion that no intent is reported, and gains the `renderPage` call assertion. Verification is that `web/src/plugins/pdf/PdfTab.test.tsx` passes repeatedly, including under a full `client` project run.

## Out of scope

- The other `onScreen(...)` call sites in the same file. They either wrap the notification in `act` and assert afterwards, or follow it with a `findBy*` that retries, so none of them turns a missed notification into a `TypeError`. Reworking them would be a broader change to a file this fix does not otherwise touch.
- Any change to `PdfPage`, `PdfStage`, or the render-cancellation handling. The production behaviour under test is correct and is not what failed.
