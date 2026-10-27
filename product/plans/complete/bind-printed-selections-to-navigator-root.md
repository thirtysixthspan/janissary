# Bind printed selections to the captured navigator root

**Complexity: 2/10** — the fix is limited to one asynchronous manager guard, focused race tests, and the file-navigator spec.

## Goal

`files print` uses cursor, anchor, and selected-row replies only when they still belong to the same open navigator state and root captured before the client reply.

## Approach

Capture `state.root` before requesting client selections. Keep the existing state-identity check and require the state's root to remain equal to the captured root before applying the reply. A root change leaves the printed command describing the current tree but omits selection clauses from the stale reply.

## Implementation steps

1. Capture the navigator root before awaiting `requestTreeSelections` and include root equality in the selection validity check in `src/file-navigator/manager.ts`.
2. Add asynchronous regression coverage in `src/file-navigator/manager.test.ts` for both a reroot and an in-place retarget while the reply is pending, asserting stale selection clauses are omitted.
3. Update `product/specs/file-navigator-tab.md` to specify that a rerooted or retargeted tree omits the pending selection reply.

## Tests

- Reroot the target while selection collection is pending and verify the printed command uses the current root without cursor, anchor, or select clauses from the old tree.
- Retarget the same navigator through `openOrRetarget` while selection collection is pending and verify the old tree's selection clauses are omitted.
- Preserve the existing tab-reordering and closed-navigator regressions.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation, test, spec, and backlog change.

## Out of scope

- Changing the selection request protocol or cancelling an outstanding client request.
- Changing how printed commands represent the navigator's current root or view.
- Updating help or user documentation that does not describe this asynchronous root-change edge case.
