# Store each suggestion hunk with its resolved flag so a stale index cannot crash the editor

**Complexity: 3/10** — ~14 added lines across 4 production files, 4 requirements, 6 test scenarios, 1 new type (p=4.73)

## Goal

Pending in-editor persona suggestions keep their hunks and their resolved flags in two parallel arrays that are re-paired by position. An accept or decline click carries only a numeric index into those arrays, and nothing bounds that index against the current array length. A stale index reads `resolved[index]` as `undefined`, passes the guard, and reaches `applyHunk` with `undefined`, which dereferences `hunk.anchor` and throws inside the click handler. Store each hunk and its resolved flag as one indivisible entry and bound-check every index so a stale control is a no-op instead of a crash.

## Approach

Introduce a `PendingHunk` type — `{ hunk: SuggestHunk; resolved: boolean }` — in the pure render-plan module `editor-rows.ts`, which is the lowest layer that needs it. `PendingSuggest.hunks` becomes `PendingHunk[]` and drops the parallel `resolved: boolean[]` field. Every consumer reads the flag from the entry it already has, and the accept/decline path guards the index against `hunks.length` before it dereferences anything. Because `buildEditorRows` now receives the single array, every `hunkIndex` it emits is an index that exists in that array. The render plan, the banner counter, and the hook stay in lockstep without a second list to keep in sync.

The bound check belongs in the hook, not the component: `EditorLines` keeps forwarding `row.hunkIndex` unchanged, and the plan guarantees that index is in range at render time; the guard protects against a click from a row rendered before a state change swapped the pending set out from under it.

## Implementation steps

1. In `web/src/editor/editor-rows.ts`, export `PendingHunk = { hunk: SuggestHunk; resolved: boolean }`. Change `buildEditorRows` to take `hunks: PendingHunk[]` instead of `(hunks: SuggestHunk[], resolved: boolean[])`, and map each `{ hunk, resolved }` entry directly to the diff preview (dropping the `resolved.at(index)` lookup). All emitted `hunkIndex` values are positions in this one array, so they are in range by construction.
2. In `web/src/editor/useEditorSuggest.ts`, import `PendingHunk` and change `PendingSuggest` to `{ hunks: PendingHunk[]; acceptedAny: boolean }`, removing the `resolved: boolean[]` field and its comment. In `fireOnLine`, seed `hunks: hunks.map((hunk) => ({ hunk, resolved: false }))`. In `resolveHunk`, guard with `index >= 0 && index < p.hunks.length` plus the existing resolved check, mark only the selected entry resolved by mapping its pair, and finalize when no entry is unresolved. In `acceptHunk`, apply the same bound check before reading `p.hunks[index].hunk` and passing it to `applyHunk`; `declineHunk` keeps delegating to `resolveHunk`, which now carries the guard.
3. In `web/src/editor/EditorLines.tsx`, call `buildEditorRows(state.lines, pending?.hunks ?? [])`, dropping the second `resolved` argument. `row.hunkIndex` still feeds `acceptHunk`/`declineHunk` unchanged.
4. In `web/src/editor/PendingSuggestPanel.tsx`, derive the remaining count from `pending.hunks.filter((entry) => !entry.resolved).length` instead of the removed parallel array. `pending.hunks.length` and the `<= 1` banner gate stay as they are.

## Tests

- `web/src/editor/editor-rows.test.ts` — adapt the `plan` helper to wrap each raw `SuggestHunk` (and optional resolved flags) into a `PendingHunk` before calling `buildEditorRows`; keep every existing case (ordering, overlap, pure insert/delete, resolved skip, anchor mismatch) asserting the same rows. Add a case asserting that every emitted `hunkIndex` is within the passed array's bounds.
- `web/src/editor/useEditorSuggest.test.ts` — update the `pending.hunks` equality assertion to the new entry shape and the three `pending.resolved` assertions to map over `pending.hunks` reading each entry's `resolved` flag. Add a stale-index case: after a hunk is pending, call `acceptHunk` and `declineHunk` with an index at and past `hunks.length` (and a negative one) and assert no throw, no `replace`/`setState` call, and the pending set unchanged. Keep the valid-index accept, decline, out-of-order, and already-resolved cases passing.
- `web/src/editor/handleSuggestKeyDown.test.ts` — update the single `pending` fixture to the new entry shape so the suite typechecks.
- Run `$janissary/scripts/run.mjs check-diff` after the implementation and again after the tests; all lint, typecheck, and web tests must pass.

## Spec updates

- `product/specs/editor-tab.md`, "In-editor persona suggestions" — add one user-visible sentence: an accept/decline control whose change is no longer pending is ignored (it does nothing) rather than disturbing the buffer. No other spec changes; resolved flags and row indices are implementation details, not documented behavior.

## Docs

- No command, flag, or key binding changes, so `help/` needs no update.
- Checked `documentation/user-documentation/tab-types/editor-persona-query.md`: it documents clicking accept/decline in any order, not stale-control handling; the fix changes no documented behavior, so no user-documentation update is needed.

## Out of scope

- The `JanusClient` service-prop pattern in `QuestionPanel.tsx` and `ToastStack.tsx` (separate backlog entry).
- Any change to the server-side suggestion protocol or hunk shape; this is client state only.
- Reworking anchor-mismatch detection or the diff preview rendering.
- Adding a migration for persisted pending sets — suggestions are never persisted.
