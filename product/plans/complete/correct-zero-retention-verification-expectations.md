# Correct the zero-retention verification expectations

**Complexity: 1/10** — 8 requirements on prose in one PR-body section, no production edits, tests, or new units (p=3.13)

## Goal

Steps 4 and 6 of the pull request body's "How to verify" section expect a capture left in place before a relaunch to survive a `logRetentionInDays` of `0`. The sweep's cutoff is the new launch time, so a capture last modified before that relaunch is deleted. The goal is to correct those two steps so the capture that must survive is one written after the relaunch, while the backdated and carried-in captures are expected to be gone, and to name the code that fixes the cutoff in step 6's rationale. The implementation and its tests are already correct; no source, test, spec, or help file changes.

## Requirements

1. Step 4 no longer expects the carried-in current capture to remain: "with a retention of 0 the capture that must survive is one written after the relaunch, not one carried in from the earlier run".
2. Step 4 expects the backdated and carried-in captures to be gone: "the backdated and carried-in captures are expected to be gone".
3. Step 4 expects a new `zero-*.txt` file written during this run, after the relaunch, to exist.
4. Step 6 takes the `live` capture after the relaunch, so its modification time is at or after the current launch.
5. Step 6's Expect names the current launch's cutoff from `reapHarnessCaptures` in `src/harness/capture/file.ts`: "the current launch's cutoff from reapHarnessCaptures in src/harness/capture/file.ts".
6. Step 6's Expect names that `src/main.ts` calls it unawaited with `config.logRetentionInDays`: "called unawaited with config.logRetentionInDays from src/main.ts".
7. Step 6's Expect keeps the general rule that "a file last modified at or after the current launch is never reaped".
8. Every other paragraph of the PR body — including corrections from earlier findings — and the PR title stay byte-for-byte unchanged, and no source or test file changes: "The code and its tests are already correct; do not change source or tests."

## Design decisions

- Edit only steps 4 and 6 of "How to verify"; the Behavior examples, Screenshots, other verification steps, and the storage-integration paragraph corrected by an earlier finding stay byte-for-byte.
- Describe the cutoff from the code as it now stands, not from the original expectation: with `logRetentionInDays` of `0` the cutoff is the current launch time, so only captures written before that launch are swept.
- Name the code path in step 6's rationale — `reapHarnessCaptures` in `src/harness/capture/file.ts` and its unawaited call with `config.logRetentionInDays` in `src/main.ts` — so a reviewer can check the claim.
- Keep change-set statistics out of the corrected prose, and keep the general launch-time rule intact.
- Apply the body edit only after the plan and backlog commit are pushed, because the description is a live GitHub artifact while file edits are not published until the push lands.

## Preserved behavior

1. Capture reaping still uses the launch-time cutoff, so a file last modified at or after launch survives even at zero retention. This is pinned by `src/harness/capture/file.test.ts` "uses launch as the cutoff when retention is zero".
2. The reaper still keeps every file whose mtime is at or after the cutoff, including equal and newer stamps. This is pinned by `src/state/reaper.test.ts` "keeps files whose mtime is at or after the cutoff".

## Assumptions

1. The cutoff is launch time minus `days * DAY_MS`: `src/harness/capture/file.ts:31` ("The cutoff is `days` days before launch...") and `src/harness/capture/file.ts:32` (`launchedAt - days * DAY_MS`).
2. With zero retention the cutoff equals launch time: `src/harness/capture/file.ts:32` and `src/harness/capture/file.test.ts:67` ("uses launch as the cutoff when retention is zero", expecting `launchedAt`).
3. The sweep starts unawaited at launch with the configured days: `src/main.ts:82` (`void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`).
4. Files at or after the cutoff are kept: `src/state/reaper.test.ts:48` ("keeps files whose mtime is at or after the cutoff") and `src/state/reaper.ts` (`reapFilesOlderThan`).
5. The existing body's paragraph about the restored schedule storage integration test is an earlier finding's correction and must survive unchanged.

## Existing functionality

1. The current PR body, read with `gh pr view <reference> --json body`, the only artifact this plan changes.
2. The capture reaper — `src/harness/capture/file.ts:29` (`reapHarnessCaptures`) — which supplies the cutoff the corrected prose must name.
3. The unawaited launch call — `src/main.ts:82` (`void reapHarnessCaptures(...)`) — which the rationale must cite.
4. The two tests — `src/harness/capture/file.test.ts:67` and `src/state/reaper.test.ts:48` — which already pin the behavior and must not be edited.

## Implementation steps

1. Read the current body with `gh pr view <reference> --json body` and copy it verbatim into `./temp/pr-body.md`. Rewrite only step 4 so its Do leaves a backdated capture and a carried-in capture before the relaunch and takes the `zero` capture after the relaunch, and its Expect says the backdated and carried-in captures are gone while a new `zero-*.txt` written during this run exists. Rewrite only step 6 so its Do takes the `live` capture after the relaunch, and its Expect says `live-*.txt` is present because `reapHarnessCaptures` in `src/harness/capture/file.ts` fixes the cutoff at the current launch time minus `logRetentionInDays` days (the launch time itself when it is `0`), that `src/main.ts` calls it unawaited with `config.logRetentionInDays`, and that a file last modified at or after the current launch is never reaped. Confirm every other paragraph and the title are byte-for-byte identical. No repository file is edited. Build command: `$janissary/scripts/run.mjs check-diff`.
2. After the plan and backlog removal are committed and pushed, apply the revised body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then confirm the PR is still open and its head commit matches `git rev-parse HEAD`. Do not merge, close, force-push, or touch the title. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change corrects prose in the pull request body; it adds or changes no user interface.

## Tests

None. The plan changes no application behavior and introduces no code, so no test is added. Requirements 1 through 7 are checked by reading the revised body; requirement 8 by comparing it against the original and by the repository diff. Tests of documentation and of GitHub prose are not introduced.

## Out of scope

- No source, test, spec, or help file change.
- No correction to the Behavior examples, the Screenshots statement, the other verification steps, or the storage-integration paragraph corrected by an earlier finding.
- No change to the PR title, no merge, no close, and no force-push.
- No new tests: this is a prose correction with no behavior to exercise.

## Verification

`$janissary/scripts/run.mjs check-diff` after the changes. Then read `gh pr view <reference> --json body` and confirm step 4 expects the carried-in and backdated captures gone and a `zero-*.txt` written after the relaunch present, step 6 takes `live` after the relaunch and names `reapHarnessCaptures` in `src/harness/capture/file.ts`, its unawaited call with `config.logRetentionInDays` in `src/main.ts`, and the at-or-after-launch rule, and that every other paragraph — including the earlier storage-integration correction — and the title match the original word for word. Finally read `git status --short` and `git diff origin/master -- src/harness/capture/file.test.ts src/state/reaper.test.ts` to confirm no source or test file was touched by this work item.
