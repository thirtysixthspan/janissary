# Bring the recording-retention pull request's launch-sweep wording and proofs up to date with startLaunchSweeps

**Complexity: 1/10** — no production lines or files, 13 requirements, no test scenarios (p=3.44)

## Goal

After the refactor that folded the four launch sweeps into `startLaunchSweeps` and the day arithmetic into `reapFilesOlderThanDays`, the description of pull request #2199 still describes the old shape. Its What section says `reapHarnessRecordings` is started from `src/main.ts` beside the other sweeps and reuses `reapFilesOlderThan`, and it never says that each directory is now swept on its own so one failure cannot stop the others. Three `Proof:` lines (Behavior example 1, How to verify step 5, and step 7) say the unawaited, `logEnabled`-independent start is untested and checked by hand only, although `src/launch-sweeps.test.ts` now pins it. A reviewer checking those proofs looks for sweep calls in `boot` that are gone and does a manual check for behavior a test already covers. This plan rewrites the one What sentence and the three proof sentences to match the code, and changes nothing else in the description.

## Requirements

1. "the recordings registry entry loses its launch `clear`": the rewritten What sentence still says the recordings entry loses its launch `clear`.
2. "`reapHarnessRecordings` in `src/harness/recording-file.ts` delegates to `reapFilesOlderThanDays` in `src/state/retention.ts`": the What section names that delegation.
3. "the one owner of the day-to-cutoff rule that captures and both transcript kinds now share": the What section says captures and both transcript kinds share that rule.
4. "`boot` in `src/main.ts` starts all four sweeps through one unawaited `startLaunchSweeps` call in `src/launch-sweeps.ts`": the What section names that single unawaited call.
5. "each with its own swallowing rejection handler so a failure in one directory does not stop the others": the What section states the per-sweep isolation.
6. "under Behavior example 1, replace ... with a pointer to `startLaunchSweeps` and `src/launch-sweeps.test.ts` "starts every sweep once with the launch time and retention days"": that proof cites the test by its exact title.
7. "keeping a note that `boot`'s own call to it is checked by hand only": the Behavior example 1 proof still says `boot`'s call is checked by hand only.
8. "in How to verify step 5, cite `src/launch-sweeps.test.ts` "returns without waiting for a sweep to finish" for the sweep not delaying startup": step 5's proof cites that test by its exact title.
9. "again leaving only `boot`'s call as checked by hand": step 5's proof keeps a by-hand note limited to `boot`'s call.
10. "in step 7, cite the same "starts every sweep once with the launch time and retention days" test for the sweep being started with only the launch time and day count, which is what makes it independent of `logEnabled`": step 7's proof cites that test and says why it shows `logEnabled` independence.
11. "Before applying, `grep -n` each quoted title in `src/launch-sweeps.test.ts` and confirm an exact `it(` match": both cited titles match an `it(` line exactly.
12. "leave every other paragraph, proof, and the four pinned screenshot links byte-for-byte unchanged": only the four named sentences differ from the body read before the edit.
13. The rewritten sentences state no commit, file, or line counts and cite no commit SHA.

## Design decisions

- The What rewrite replaces only the sentence beginning "On the server, the recordings registry entry loses its launch `clear`". The following sentences about the recorder factories, the shell gate, and the `recordingOff` flag stay as written, since the entry does not name them.
- Each of the three proofs keeps its claim and swaps only the sentence that calls the start untested. The test now covers `startLaunchSweeps`, not `boot`, so each proof keeps a narrower by-hand note for `boot`'s single call (Assumption 5).
- Step 5's sentence "It runs `reapFilesOlderThan` in `src/state/reaper.ts`" stays. It is still true through `reapFilesOlderThanDays` (Assumption 2), and the entry does not name it.
- Step 7's `logEnabled` independence is argued from the sweep signature: `startLaunchSweeps` hands each sweep only the launch time and day count (Assumption 4), which the cited test asserts.
- The description is edited only after the plan commit is pushed, per Step 8 of `ai/tasks/feature/work-pull-request-issue.md`.

## Preserved behavior

None found

## Assumptions

1. `reapHarnessRecordings` delegates to the shared rule: `src/harness/recording-file.ts:32` `await reapFilesOlderThanDays(recordingDirectory, '.cast', launchedAt, days);`.
2. The shared rule turns days into a cutoff and calls the reaper: `src/state/retention.ts:7` `await reapFilesOlderThan(directory, extension, launchedAt - days * DAY_MS);`.
3. Captures and both transcript kinds use the same rule: `src/harness/capture/file.ts:28`, `src/harness/transcript-file.ts:25`, and `src/shell/transcript/transcript-file.ts:25`, each `await reapFilesOlderThanDays(`.
4. Each sweep is started unawaited with its own handler and only the launch time and days: `src/launch-sweeps.ts:9` `for (const sweep of SWEEPS) void sweep(launchedAt, days).catch(() => {});`.
5. `boot` makes one untested call: `src/main.ts:80` `startLaunchSweeps(Date.now(), config.logRetentionInDays);`.
6. The start is pinned by `src/launch-sweeps.test.ts:28` `it('starts every sweep once with the launch time and retention days'`.
7. Not waiting is pinned by `src/launch-sweeps.test.ts:36` `it('returns without waiting for a sweep to finish'`.
8. Per-sweep isolation is pinned by `src/launch-sweeps.test.ts:42` `it('swallows a sweep that rejects without stopping the others'`.

## Existing functionality

1. The recordings registry entry with no `clear`: `src/state/dirs.ts:37` `name: 'harnessRecording',`.

## Implementation steps

1. **Record the plan and remove the backlog entry.** Move this plan to `product/plans/complete/` and remove the only entry from `product/backlog/pull-request.md`, restoring the master comment-and-heading skeleton. Commit and push to `feature/recording-retention-reaper`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Edit the description.** Read the current body with `gh pr view 2199 --json body`. In the What paragraph that begins "The change touches both server and web", replace the sentence about `reapHarnessRecordings` being started from `src/main.ts` and reusing `reapFilesOlderThan` with sentences naming `reapFilesOlderThanDays` in `src/state/retention.ts` as the shared day-to-cutoff rule and `startLaunchSweeps` in `src/launch-sweeps.ts` as the single unawaited start with per-sweep isolation. In the Behavior example 1 proof, How to verify step 5, and step 7, replace the sentence calling the start untested with a citation of the matching `src/launch-sweeps.test.ts` test and a note that only `boot`'s call is checked by hand. `grep -n` both cited titles in `src/launch-sweeps.test.ts`. Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file ./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. The change is to the pull request description on GitHub; no application surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The behavior the rewritten sentences describe is already pinned by the three tests in Assumptions 6 to 8.

## Out of scope

- Any source, test, spec, or help change.
- Step 5's `reapFilesOlderThan` sentence and every other proof, paragraph, and screenshot link.
- The pull request title.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read the updated description with `gh pr view 2199 --json body` and diff it against the body read before the edit. The only differences should be the What sentence beginning "On the server, the recordings registry entry loses its launch `clear`" and one sentence in each of the Behavior example 1 proof, How to verify step 5's proof, and step 7's proof. Confirm `grep -n` finds `it('starts every sweep once with the launch time and retention days'` and `it('returns without waiting for a sweep to finish'` in `src/launch-sweeps.test.ts`. A failure looks like any other changed line, a changed screenshot link, or "That call has no test of its own" or "Nothing tests that boot does not wait on it" still present.
