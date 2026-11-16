# Make a cancelled workspace clone remove only its own directory

**Complexity: 3/10** — about 30 added production lines in one file, 5 requirements and 4 test scenarios (p=4.50).

## Goal

A cancelled workspace clone removes only the partial clone it created itself. It can never delete a clone a newer launch has already made under the same name, and it never touches a folder that occupied that name before the attempt started.

## Approach

The clone no longer writes into the name-derived target directory. Each attempt clones into a unique temporary sibling under the workspace base (`<name>.clone-<uuid>`), and only after the clone reports ready is that sibling renamed onto the target. The rename refuses a target that already exists, leaving it untouched and failing the attempt with a clear error. Every clone failure — cancelled or not — removes only the attempt's own temporary sibling, so a failed attempt leaves no new folder and no leftover. `ProvisionHandle.dir` remains the final target, so every caller and `WorkspaceManager` keeps its current path and reference behavior.

## Implementation steps

1. In `src/workspace/index.ts`, derive a unique staging sibling from the target and pass it to `startGitClone` instead of the target.
2. On clone rejection, remove the staging sibling only, then rethrow. Drop the cancellation flag that chose whether to delete the shared target.
3. After the clone resolves, refuse with `A workspace folder already exists at <target>.` when the target is already present, otherwise rename the staging sibling onto the target and clean the sibling if the rename fails.
4. Run `finishProvisioning` on the final target, after the rename, so trust, credential helper, origin rewrite, and scratch behavior are unchanged.
5. Update the regression test in `src/workspace/index.test.ts`: find the staging sibling, cancel attempt A, start attempt B under the same name, let B land before A's rejection settles, assert B's target survives; also pin a pre-existing target left untouched by a cancelled attempt and a clear refusal when the target appears before the rename.

## Tests

- A cancelled attempt removes its own staging sibling and leaves no target directory when no newer launch exists (existing cancellation test, updated to watch the staging sibling).
- Attempt A is cancelled after its partial staging folder exists; attempt B under the same name lands its clone before A's rejection settles; B's target survives with its cloned files and B's `ready` resolves.
- A folder that already occupies the target before a cancelled attempt, with a file in it, still holds that file afterwards.
- A clone that finishes while another folder has appeared at the target rejects with the clear refusal, removes its own staging sibling, and leaves the occupying folder untouched.
- `src/workspace/manager.test.ts` pending and reuse cases and `src/workspace/discard.test.ts` continue to pass.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changes to workspace naming, leftover cleanup, release, or reference counting.
- Cleaning a staging sibling left behind by a killed process; the next launch clears the workspace base already.
- Making post-clone provisioning side effects cancellable.
