# Correct the no-clear-at-launch verification citation in the pull request description

**Complexity: 1/10** — three acceptance requirements bearing on one path token in the pull request body; no production lines, files, tests, or new units (p=2.56).

## Goal

Edge case 9 ("No clear at launch") in the pull request's "How to verify" section sends the reader to `src/activity-log/logger.test.ts` for the assertion "never clears the activity log directory", but that assertion exists only in `src/state/dirs.test.ts`. Correct the attribution so a reviewer following the step can check the claim where it actually lives. The no-clear behavior and its test are already in place, so no code change belongs here.

## Requirements

1. Edge case 9's Expect line attributes the "never clears the activity log directory" assertion to `src/state/dirs.test.ts` (reviewer finding: "points at the logger test instead of the state-directory test").
2. The Expect line keeps its other anchors exactly as written: `src/state/dirs.ts:98`–`:104` and `product/specs/activity-log.md:31` ("keeping that line's src/state/dirs.ts and product/specs/activity-log.md anchors as they are").
3. Every other part of the body — What, Behavior examples, Screenshots, setup, and verification steps 1–8 — stays byte-for-byte unchanged ("leave every other Behavior example, screenshot note, and verification step byte-for-byte unchanged").

## Design decisions

- The assertion's exact title is confirmed from the source: `src/state/dirs.test.ts:140` `it('never clears the activity log directory', () => {`, inside the `clearStateDirectories` describe block, checking that the `activityLog` registry entry has no `clear`.
- The cited claim is true and already pinned by a test; the fix changes only where the reader is sent, so no source, test, spec, help, or documentation file changes.
- Only the one file-path token on the Expect line changes. The quoted assertion title and the two other anchors on that line stay as the author wrote them.
- The correction is applied to the live pull request body after the commit is pushed, with `gh pr edit --body-file ./temp/pr-body.md`, so a failed push never leaves the description describing work absent from the branch. The body file holds the complete body, since `gh pr edit` replaces it wholesale.

## Preserved behavior

None found — the change edits no application behavior; the no-clear-at-launch behavior and its test are already present and untouched.

## Assumptions

1. The assertion's exact title is "never clears the activity log directory", anchored at `src/state/dirs.test.ts:140` `it('never clears the activity log directory', () => {`.
2. The `activityLog` registry entry at `src/state/dirs.ts:102` has no `clear`, which is the behavior that test pins.
3. The pull request body is the authoritative description text, and `gh pr edit --body-file` replaces it wholesale, so the full body must be rebuilt with only the one token changed.

## Existing functionality

1. The `activityLog` state-directory registry entry that has no `clear` — `src/state/dirs.ts:98`–`:104`.
2. The state-directory test asserting that entry has no `clear` — `src/state/dirs.test.ts:140`–`:144`.
3. The description to correct — pull request 2201, "How to verify", edge case 9.

## Implementation steps

1. Confirm the test title in `src/state/dirs.test.ts` (in the `clearStateDirectories` block, `it('never clears the activity log directory', ...)`) and note the exact file-path token to replace. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Read the current body with `gh pr view <reference> --json body`, write the complete body to `./temp/pr-body.md`, and change only the `src/activity-log/logger.test.ts` token on edge case 9's Expect line to `src/state/dirs.test.ts`, leaving every other byte intact. Build command: `$janissary/scripts/run.mjs check-diff`.
3. After the fix plan and backlog removal are committed and pushed, apply the body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then confirm the PR is still OPEN and its `headRefOid` matches local `HEAD`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None — no user interface is added or changed.

## Tests

None. The plan changes no application behavior and introduces no code; the artifact is one path token in a pull request body. The behavior it points at is already pinned by `src/state/dirs.test.ts`, so no test is written.

## Out of scope

- No source, test, spec, help, or other documentation edit.
- No change to any other paragraph, behavior example, screenshot note, or verification step in the pull request body.
- No change to the pull request title, and no merge or close of the pull request.
- No change to the completed activity-log plan's change-set statistics, which a separate backlog entry covers.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` confirms no lint, typecheck, or test regression.

Manual: read `src/state/dirs.test.ts:140`–`:144` to confirm the exact title "never clears the activity log directory" on the `activityLog` entry; then read the live pull request body's edge case 9 Expect line and confirm it cites `src/state/dirs.test.ts` while `src/state/dirs.ts:98`–`:104` and `product/specs/activity-log.md:31` remain, and that every other section reads exactly as before.
