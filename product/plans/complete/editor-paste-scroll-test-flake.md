# Flaky EditorTab paste scroll test fails CI

Complexity: 2/10

## Root cause

The CI test run failed on `web/src/editor/EditorTab.test.tsx > paste > does not scroll the body, since the caret has not moved`, which saw one `scrollIntoView({ block: 'nearest' })` call. The test is the only failure in 13957 and passes when run alone. The pull request changes no `web/` file. The call is the editor's one-time initial scroll effect, which fires the first time the loaded buffer is active. `renderLoaded` resolves as soon as the loaded text is in the DOM, but React can still hold that passive effect for a later task. Under CI load the effect runs after the test has cleared the mock, so the initial scroll is counted as a scroll caused by the paste.

## Correct behavior

The test asserts only that the paste itself does not scroll, so everything the load schedules must have run before the mock is cleared.

## Approach

Flush pending effects with `await act(async () => {})` before `mockClear()` in that test.

## Tests

The edited test is the regression test. No new tests.

## Out of scope

Other tests that clear `scrollIntoView` after a wait that also covers a user action (find, line jump) — they pass on the action's own call and are not affected by the initial scroll.
