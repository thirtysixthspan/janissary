# Clear in-flight suggestion state when a request fails

**Complexity: 2/10** — ~10 added lines in 1 production file, 4 behavioral requirements and 4 test scenarios, one local helper function (p=4.14); a single-hook settle-on-rejection change with no architecture.

## Goal

The in-editor suggestion hook sets `firingRef` before firing an `editorSuggest` request and clears it only inside the success callback. If that request's promise rejects — a dropped request, a transport error, or any other rejection — the flag stays set, `firingLine` stays visible, and the guard at the top of `fireOnLine` refuses every later request for the rest of the tab's life. The fix must clear the in-flight state on *any* settlement so a later request proceeds, and must surface a short failure line through the existing `noSuggestionLine` state so the user sees that the query ended without a suggestion. The persona-list request in the same hook has the same missing rejection path and gets the same guard. No key binding, flag, notification, or message for any other path changes.

## Approach

In `fireOnLine`, extract the three in-flight cleanups (`firingRef.current = false`, `setFiringLine(null)` and clearing `firingCancelledRef.current`) into a local `settle` helper. Attach it with `.finally()` so it runs whether the request fulfills or rejects, and add a rejection handler via `.catch()` that sets `noSuggestionLine` to the query text when the request was not cancelled, mirroring the existing empty-hunks path (the pill then reads `no suggestion`). The success handler keeps its current cancelled check and hunk handling; its only change is that cleanup now happens in `settle` instead of inline. For the persona-list request in the mount effect, add a rejection handler that leaves `personas` empty so a rejected discovery does not produce an unhandled rejection.

## Implementation steps

1. In `web/src/editor/useEditorSuggest.ts`, add the local `settle` helper in `fireOnLine`, move the three cleanup lines out of the success callback into it, guard the success/hunk handling with the existing cancelled check, append `.catch(...)` to surface the failure line when not cancelled, and append `.finally(settle)`. Keep the cancelled-reply behavior and all existing state values byte-for-byte. Run `$janissary/scripts/run.mjs check-diff`.
2. In the same file, give the mount-effect `editorPersonas` request a rejection handler that sets `personas` to `[]`. Run `$janissary/scripts/run.mjs check-diff` once more with the change in place.
3. Confirm `web/src/editor/useEditorSuggest.ts` stays under the 200-line limit.

## Tests

- `web/src/editor/useEditorSuggest.test.ts` — extend `withResolvers` to expose `reject`, and add a case whose `editorSuggest` request rejects after the persona-list reply: assert `firingLine` is null and `noSuggestionLine` equals the query text after the rejection, then call `fireOnLine` again and assert a second `editorSuggest` request is issued (the guard was cleared). Add a case where the query line is closed before the in-flight request rejects and assert no failure line is shown. Add a case where the `editorPersonas` request rejects and assert `personas` ends empty with no unhandled rejection. Keep every existing success, empty-hunks, close-while-in-flight and second-request-guard case passing.

## Spec

- `product/specs/editor-tab.md` — in the "In-editor persona suggestions" section, record that a request whose transport fails or rejects clears the in-flight state so a later request can be sent, and that the query line's status pill reads `no suggestion` for that failed query, the same as an empty reply.

## Out of scope

- Changing the RPC contract, `RequestResult`, or `client.request` — it already settles every failure as a resolved `{ ok: false }` result; this fix only also handles an outright rejected promise.
- Adding a new notification, error message, or pill label; the existing `noSuggestionLine` state and `no suggestion` pill are reused.
- Changing hunk resolution, close-while-in-flight semantics, or the second-request guard while a request is genuinely still pending.
- Updates to help pages, key bindings, or public documentation beyond the behavior already described in the spec.
