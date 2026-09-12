# Drop the dead optional chain on managers.fileNavigator in the sync gate

**Complexity: 2/10** — two operators removed in one source file and one test fixture adjusted so it stops deleting a required manager. No behavior change in production, where the manager is never absent. The number is not lower because the test that forced the operator has to be replaced with a faithful model of the case it was standing in for, not merely deleted.

Work item, verbatim: *"Remove the defensive optional chain this change adds on the required file-navigator manager, which exists only because a test deletes the manager key outright."*

`src/open/file-manager.ts` reaches `this.managers.fileNavigator` through `?.`, but `fileNavigator` is a required member of `Managers` (`src/managers.ts:58`), populated unconditionally in `src/controller/create-managers.ts`. It is the only optional-chained required manager anywhere in `src/`, and the only thing that triggers it is the branch-gate tests' `delete managers.fileNavigator`. If the manager were ever genuinely absent — a partial test double, a future initialization-order change — the gate would silently fall back to the launch-dir classification instead of surfacing the wiring error, and the pattern normalizes optional-chaining away the `Managers` contract.

## Design decisions

- **The contract is the contract.** A required manager is read as required. A wiring error should throw at the point the contract is broken, not degrade into a plausible-looking sync decision.
- **The test models the case it meant, rather than removing the manager.** What the deleted-manager fixture was standing in for is "a label that names no file-navigator tab" — which in production is a present manager answering `undefined` from both `rootOf` and `onPrimaryBranch`. The fixture says exactly that instead.
- **`null` is the fixture's "no navigator tab", not `undefined`.** The stub's root parameter defaults to the launch dir, and a default parameter fires on `undefined` — so an explicit `undefined` would silently restore the default, which is the trap this fixture already sprang once. `null` passes through unambiguously and the stub maps it to the `undefined` the real accessor returns.
- **Both accessors answer, because both are consulted.** The gate reads `rootOf` to decide whether the navigator governs and `onPrimaryBranch` for its answer. A stub that only answered one of them would model a label that half-exists.

## Proposed changes

- `src/open/file-manager.ts` — `governingNavigator` reads `this.managers.fileNavigator.rootOf(label)` and returns `this.managers.fileNavigator`, with no `?.` on either. The containment logic is unchanged: a label that names no navigator tab still yields `undefined` from `rootOf` and still routes the gate to the launch-dir fallback.
- `src/open/file-manager.test.ts` — `makeSyncedManagers`'s root parameter accepts `null` for "this label names no navigator tab", which the stub maps to `undefined`. The "follows the launch dir branch" `it.each` passes that instead of `delete managers.fileNavigator`, and drops the cast the delete required.

## Tests

No new cases. The whole `branch gate` describe must keep passing, with the launch-dir `it.each` now exercising the production shape — a present manager answering `undefined` — rather than an absent key that cannot occur. That case's existing assertions (the launch-dir read and the scheduled refresh both called with the launch dir, and the routing that follows) are unchanged and are what confirm the replacement is faithful.

## Out of scope

- The optional chaining on any other manager access elsewhere in `src/`, which this work does not survey.
- Making `Managers` enforce its own completeness at construction.
- Any change to what the gate decides.

## Verification

- `./scripts/run.mjs check-diff`
