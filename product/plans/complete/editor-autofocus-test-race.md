# Stabilize the editor autofocus test

**Complexity: 2/10** — one existing client test needs to synchronize with the passive autofocus effect that already implements the specified behavior. No product code or visible behavior changes.

## Root cause

`renderLoaded()` waits until loaded text is rendered, but React can commit that render before the `EditorTab` passive effect focuses its hidden textarea. The autofocus test asserts synchronously in that interval, causing the intermittent CI failure.

## Correct behavior

Once an active editor has loaded its file, keyboard focus lands in its textarea. The test must wait for that asynchronous effect rather than treating the first rendered line as proof that it has completed.

## Reproduction

Local focused runs passed, including twenty repeats. PR #1074 reproduced the CI failure in the full test job: `web/src/editor/EditorTab.test.tsx > EditorTab > auto-focuses the textarea once the file has loaded` observed `document.body` rather than the textarea as the active element.

## Approach

Keep the existing autofocus implementation and make its regression test wait for the already-required post-load focus state.

## Implementation steps

1. Update the autofocus case in `web/src/editor/EditorTab.test.tsx` to use Testing Library's `waitFor` around the active-element assertion.
2. Run the diff-scoped check and the focused client test to confirm the test is stable and the behavior remains guarded.

## Regression test

`EditorTab > auto-focuses the textarea once the file has loaded` in `web/src/editor/EditorTab.test.tsx` waits until the post-load focus effect completes and asserts that the textarea owns focus.

## Specs and documentation

`product/specs/editor-tab.md` already states that focus lands in the buffer once content loads. No specification or public-documentation wording changes are needed.

## Out of scope

- Changing editor focus behavior.
- Addressing the unrelated controller timeout that motivated the CI-trigger PR.
