# Correct the description's account of the schedule storage integration test

**Complexity: 1/10** — 7 requirements, no production edits, tests, or new units (p=3.04)

## Goal

The pull request body says `src/schedule/system/storage.integration.test.ts` was removed because its one capture-sentinel assertion no longer holds. The file has since been restored with all eight integration tests and only its per-run sentinel repointed from `.janissary/captures/` to `.janissary/recordings/`, which still has a launch clear. The goal is to bring the description's single obsolete paragraph in line with the restored file and with capture retention: only the repeated-startup-cleanup test depended on captures, the other seven tests still provide their integration coverage, and capture aging is exercised by the dedicated reaper tests. No source, test, spec, or help file changes.

## Requirements

1. The PR body no longer states that `src/schedule/system/storage.integration.test.ts` was removed: "The old paragraph saying the file was removed is now obsolete; rewrite or remove it."
2. The PR body states the file is present again with all eight tests, judged "against the code as it now stands on the branch."
3. The PR body states that only the repeated-startup-cleanup test depended on captures, per "only the repeated-startup-cleanup test depended on captures", and that its sentinel is now `.janissary/recordings/`.
4. The PR body states where that coverage lives after the change and names the seven other areas, per "State where that coverage lives after the change": snapshot round-tripping, malformed and future-version stores, atomic write failure cleanup, space-safe git excludes, tracked targets, preignored rules, and symlinked storage.
5. The PR body pairs the correction with the restored-test work rather than implying "the deletion was scoped to one assertion", and points capture-aging claims at the reaper tests.
6. Every other paragraph of the PR body and the PR title stay byte-for-byte unchanged: "Keep the rest of the PR description byte-for-byte unchanged unless another backlog entry names it."
7. No source file is changed: "Do not change any source file here."

## Design decisions

- Edit only the single obsolete paragraph; leave the Behavior examples, Screenshots, and How to verify paragraphs untouched because other backlog entries own them.
- Describe the restored test from the code as it now stands on the branch, not from the original finding that recorded the deletion.
- State the restoration and the surviving coverage explicitly so the disclosure no longer reads as a one-assertion deletion paired with a silent loss of seven tests.
- Point capture-aging claims at the reaper tests by path, and keep change-set statistics out of the corrected paragraph.
- Apply the body edit only after the plan and backlog commit are pushed, because the description is a live GitHub artifact while the file edit is not published until the push lands.

## Preserved behavior

1. The restored integration suite keeps exercising real startup cleanup: the sentinel is removed while persisted schedules and runscripts survive both cycles. This is pinned by `src/schedule/system/storage.integration.test.ts` "keeps snapshots and scripts through repeated real startup cleanup cycles".
2. Capture aging continues to use the launch-time cutoff so a capture modified at or after launch survives even at zero retention. This is pinned by `src/harness/capture/file.test.ts` "uses launch as the cutoff when retention is zero".

## Assumptions

1. The restored file holds eight tests: `src/schedule/system/storage.integration.test.ts:172` (`it('keeps snapshots and scripts through repeated real startup cleanup cycles', ...)`).
2. The per-run sentinel moved to recordings: `src/schedule/system/storage.integration.test.ts:182` (`path.join(root, '.janissary', 'recordings')`).
3. The recordings directory is initialized at `<project>/.janissary/recordings`: `src/harness/recording-file.ts:8` (`recordingDirectory = path.join(projectDirectory, '.janissary', 'recordings');`).
4. Recordings still get a launch clear: `src/state/dirs.ts:36` (`clear: (): void => { clearHarnessRecordingDirectory(); },`).
5. Captures deliberately have no launch clear: `src/state/dirs.ts:27` ("No `clear`, deliberately: captures are kept for the `logRetentionInDays` window").
6. The capture sweep starts unawaited at launch: `src/main.ts:82` (`void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`).
7. The reaper tests pin capture retention: `src/harness/capture/file.test.ts:67` ("uses launch as the cutoff when retention is zero") and `src/state/reaper.test.ts:48` ("keeps files whose mtime is at or after the cutoff").
8. The testing spec already records the restored integration coverage: `product/specs/testing.md:11` ("System schedule storage integration checks run against real scratch projects and real git repositories").

## Existing functionality

1. The current PR body, read with `gh pr view <reference> --json body`, which is the only artifact this plan changes.
2. The restored integration file — `src/schedule/system/storage.integration.test.ts:26` (`describe('system schedule storage integration', ...)`) — which supplies the coverage being described.
3. The capture reaper and its tests — `src/harness/capture/file.ts` and `src/harness/capture/file.test.ts` — which own the capture-aging claims.
4. The restore commit's plan — `product/plans/complete/restore-system-schedule-storage-integration-tests.md` — which documents the sentinel repointing this correction must reflect.

## Implementation steps

1. Read the current body with `gh pr view <reference> --json body` and copy it verbatim into `./temp/pr-body.md`. Replace only the paragraph beginning "`src/schedule/system/storage.integration.test.ts` was removed." with a paragraph that says the file is retained with all eight tests, that only the repeated-startup-cleanup test used captures and now points its per-run sentinel at `.janissary/recordings/` which startup cleanup still clears while schedules and runscripts survive, that the other seven tests cover snapshot round-tripping, malformed and future-version stores, atomic write failure cleanup, space-safe git excludes, tracked targets, preignored rules, and symlinked storage, and that capture aging is pinned by the reaper tests. Confirm every other paragraph and the title are byte-for-byte identical. No repository file is edited. Build command: `$janissary/scripts/run.mjs check-diff`.
2. After the plan and backlog removal are committed and pushed, apply the revised body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then confirm the PR is still open and its head commit matches `git rev-parse HEAD`. Do not merge, close, force-push, or touch the title. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change corrects prose in the pull request body; it adds or changes no user interface.

## Tests

None. The plan changes no application behavior and introduces no code, so no test is added. Requirements 1 through 5 are checked by reading the revised body; requirement 6 by comparing it against the original; requirement 7 by the repository diff. Tests of documentation and of GitHub prose are not introduced.

## Out of scope

- No source file, test file, spec file, or help page change.
- No correction to the Behavior examples, Screenshots, or How to verify paragraphs; those belong to other backlog entries.
- No change to the PR title, no merge, no close, and no force-push.
- No new tests: this is a prose correction with no behavior to exercise.

## Verification

`$janissary/scripts/run.mjs check-diff` after the changes. Then read `gh pr view <reference> --json body` and confirm the obsolete "was removed" paragraph is gone, that the new paragraph names the restored file and its recordings sentinel, the seven surviving coverage areas, and the reaper tests, and that every other paragraph matches the original body word for word. Finally read `git diff origin/master -- src/schedule/system/storage.integration.test.ts` and confirm the test file is present with its single sentinel change, and `git status --short` to confirm no source file was touched by this work item.
