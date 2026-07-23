# Escape while a query request is in flight must fully cancel it, not just hide the query line

**Complexity: 3/10** — one new ref-based cancellation flag in an existing hook, checked at the one call site that resolves an async request. No new state shape, no protocol change.

## Goal

Pressing Escape while the ephemeral persona query line is open closes the query line's own row immediately, but if a request was already fired (Enter/Ctrl+Enter/pill-click) and is still in flight, the server's reply lands later and unconditionally opens the pending hunk-review panel (`product/specs/editor-tab.md` "In-editor persona suggestions") — reappearing as an unrequested review surface the user cannot dismiss with Escape (the pending state swallows all keys; resolution is click-only). Per the backlog request, Escape must cancel and remove the *entire* query line interaction, including a request already sent, not just the visible row.

## Approach

`web/src/editor/useEditorSuggest.ts`'s `fireOnLine` (lines 75-96) sets `firingRef.current = true`, sends the `editorSuggest` request, and its `.then()` unconditionally calls `setPendingBoth(...)` (or `setNoSuggestionLine`) once the reply arrives — with no awareness of whether the query line that spawned it has since been closed. `closeQueryLine` (line 69) only clears `queryLine`/`pillFocused` local state; it never touches `firingRef` or the in-flight promise.

The fix adds a `firingCancelledRef` alongside the existing `firingRef`: `closeQueryLine` sets it when a request is still in flight at the moment of closing, and the `.then()` callback checks it first — if set, it clears the flag, resets `firingRef`/`firingLine` as it already does, and returns without ever opening the pending set or the no-suggestion state. This is the same pattern already used for `firingRef`/`pendingRef` (plain refs read inside the async callback, since hook closures over `useState` values would be stale by the time the promise resolves).

## Implementation steps

1. In `web/src/editor/useEditorSuggest.ts`, add `const firingCancelledRef = useRef(false);` alongside the existing `firingRef` (near line 56).
2. Update `closeQueryLine` (line 69) to mark the in-flight request cancelled when one is outstanding:
   ```ts
   const closeQueryLine = () => {
     if (firingRef.current) firingCancelledRef.current = true;
     setQueryLine(null);
     setPillFocused(false);
   };
   ```
3. In `fireOnLine`'s `.then()` callback (lines 86-95), check the flag first and short-circuit before touching `pending`/`noSuggestionLine`:
   ```ts
   .then((res) => {
     firingRef.current = false;
     setFiringLine(null);
     if (firingCancelledRef.current) { firingCancelledRef.current = false; return; }
     const hunks = res?.hunks ?? [];
     if (hunks.length > 0) {
       setPendingBoth({ hunks, resolved: hunks.map(() => false), acceptedAny: false });
     } else setNoSuggestionLine(lineText);
   });
   ```

## Tests

- `web/src/editor/useEditorSuggest.test.ts` — add a test: open the query line, type a valid request, call `fireOnLine`, then call `closeQueryLine()` before the request's promise resolves (mirror the existing `makeClient`/`typeQuery` helpers, using a deferred/manually-resolved promise or awaiting the mock's resolution after closing), then assert that once the promise resolves, `pending` stays `null`, `noSuggestionLine` stays `null`, `firingLine` is `null`, and `queryLine` stays `null` (does not reopen). Mirror the existing style of `'fires an editorSuggest request from the query text and opens the pending set'` (lines 45-63) but close instead of awaiting normally.
- `web/src/EditorTab.test.tsx` — in the `'in-editor agent query line'` describe block (~line 477+), add an integration test: fire a request (Enter on a valid `> persona prompt` line), then immediately press Escape before the mocked client resolves, then let the promise resolve, and assert no `.editor-diff-add`/pending-panel banner appears and the query row stays gone.
- Run `./scripts/run.mjs check-diff` after each step; all suites must pass.

## Spec updates

- `product/specs/editor-tab.md:236-237` ("Escape closes the query line at any point, discarding whatever was typed...") — add a clause that Escape also cancels a request already sent, so its reply is discarded and no pending review opens: append "...if a request had already been sent and is still awaiting a reply, that reply is discarded when it arrives and does not open a review panel."

## Docs

- Checked `help.md` — no mention of Escape/query-line/pending-review interaction. No update needed.
- Checked `documentation/user-documentation/` — no page describes this interaction. No update needed.

## Out of scope

- The query line's bracket-free pill text and placeholder span (already fixed, separate plan).
- The query line's gutter line number (separate backlog issue).
- The query line's modality relative to buffer editing (separate backlog issue).
- Making the pending hunk-review panel itself Escape-dismissable once it has actually opened from a reply that arrived *before* Escape was pressed — that panel's click-only resolution is existing, intentional behavior per the spec and is not part of this fix.
