# Clear a reveal hint's focus member in place

**Complexity: 2/10** — ~1 added line, 1 file, 4 requirements (p=3.88); a one-line substitution replacing an object literal with an in-place delete.

## Goal

`clearRevealFocus` in `src/file-navigator/reveal-editor.ts` currently acknowledges a reveal by assigning a freshly written restore hint that names `revision`, `cursor`, `anchor`, `anchorToCursor`, and `selected` one by one. That duplicates the member list of `FileNavigatorRestoreHint` in `src/tab/types.ts`, turns an absent optional member — today `anchorToCursor` on a reveal hint — into an own property holding `undefined`, and silently drops any member the type gains later, which is exactly how `focus` itself arrived.

The clear should delete the `focus` member in place and leave every other member exactly as the hint writer left it.

## Approach

The existing guard already narrows `state.restore` to a hint that exists, matches the requested revision, and carries `focus`, so the only work left is removing that one member. `delete state.restore.focus;` keeps `revision` unchanged — it is never bumped — and preserves `cursor`, `anchor`, `anchorToCursor`, and `selected` with their original `null` and `undefined` values, including absent members staying absent. The `port.rebuild(navigatorLabel)` call after it is unchanged, so the client sees the same repaint it does today.

Deleting an optional member in place is the pattern the codebase already uses in `src/tab/visibility.ts`, `src/tab/rename.ts`, and `src/acp/record-feed.ts`. The six `clearRevealFocus` cases pass unchanged because their `toEqual` assertions treat an absent member and a member holding `undefined` alike; the `not.toHaveProperty('focus')` assertions are satisfied by the deletion directly.

## Implementation steps

1. In `src/file-navigator/reveal-editor.ts`, inside `clearRevealFocus`, replace the `state.restore = { ... }` object literal with `delete state.restore.focus;`. Keep the guard and the `port.rebuild(navigatorLabel)` call exactly as they are.
2. Run `$janissary/scripts/run.mjs check-diff`.

No other production file changes. `revealEditorFile`, the manager delegation in `src/file-navigator/manager.ts`, the controller wrapper in `src/controller/file/navigator.ts`, the adapter in `src/controller/file/navigator-adapter.ts`, the RPC wiring, and `FileNavigatorRestoreHint` itself stay untouched.

## Tests

Expected new tests: none. The six cases under `describe('clearRevealFocus')` in `src/file-navigator/reveal-editor.test.ts` already cover the matching revision with every member populated, a hint holding only `revision` and `focus`, a revision mismatch, a hint without `focus`, a navigator with no hint, and a label with no navigator state. They must pass unchanged.

Check whether `FileNavigatorRestoreHint` gains a member while this lands. Today its members are `revision`, `cursor`, `anchor`, `anchorToCursor`, `selected`, and `focus`, and the matching-revision case names every non-focus member, so there is nothing to extend. If one is added before this lands, extend that case so it asserts the new member survives the clear.

Verify with:

```
$janissary/scripts/run.mjs check-diff
npx vitest run --project server src/file-navigator/reveal-editor.test.ts src/controller/file/navigator.test.ts src/message/handler.test.ts
```

The two wrapper cases in `src/controller/file/navigator.test.ts` and the routing case in `src/message/handler.test.ts` prove the delegation and the `ok` reply did not move.

Then confirm by reading the diff that a matching acknowledgement leaves `state.restore` without a `focus` property and with every other member unchanged.

## Spec updates

None. This is an internal representation change with no user-visible behavior difference; no spec describes the restore hint or how its focus member is cleared.

## Docs

None needed. No `help/` page or `documentation/user-documentation/` page describes the restore hint or the reveal acknowledgement.

## Out of scope

- `revealEditorFile` and how a reveal hint is written, including its `focus: true` member.
- The manager delegation, controller wrapper, controller adapter, and RPC method wiring.
- `FileNavigatorRestoreHint` and the client's handling of an applied or dropped reveal.
- Any refactor of the guard or the rebuild call.
