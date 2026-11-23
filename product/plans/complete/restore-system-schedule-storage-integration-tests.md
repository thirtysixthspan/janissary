# Restore the system schedule storage integration tests with a recording sentinel

**Complexity: 2/10** — 7 requirements, 8 test scenarios, no production edits (p=3.85)

## Goal

The pull request deleted `src/schedule/system/storage.integration.test.ts` in full to drop one assertion that used `.janissary/captures/` as a per-run sentinel. That deleted seven unrelated integration checks of schedule-store round-tripping, atomic write failure cleanup, git excludes, tracked targets, preignored rules, and symlink rejection. The goal is to bring the file back from `origin/master` byte-for-byte except for that one test, whose sentinel moves to a directory that still has a launch clear, so the coverage returns without depending on the retention change.

## Requirements

1. `src/schedule/system/storage.integration.test.ts` exists again with all eight integration tests restored from `origin/master`. This is the issue text: "Restore src/schedule/system/storage.integration.test.ts from origin/master unchanged except for the single test 'keeps snapshots and scripts through repeated real startup cleanup cycles'".
2. The seven tests unrelated to capture cleanup stay byte-for-byte identical to the master version, per "Leave the other seven tests byte-for-byte intact".
3. The repeated-startup-cleanup test uses `.janissary/recordings/` as its per-run sentinel, per "replace its .janissary/captures/ sentinel with a directory that still loses its clear, such as .janissary/recordings/".
4. That sentinel directory is initialized with `initHarnessRecordingDirectory` from `src/harness/recording-file.ts`, per the proposal's "through initHarnessRecordingDirectory and clearHarnessRecordingDirectory in src/harness/recording-file.ts".
5. The `initHarnessCaptureDirectory` import is gone from the restored file, per "drop the initHarnessCaptureDirectory import".
6. The repeated-startup-cleanup test still asserts that the persisted schedule file and the runscripts survive `clearStateDirectories()` across both cycles, per "keep the assertions that the persisted schedule file and runscripts survive clearStateDirectories() across both cycles".
7. `src/harness/capture/file.test.ts` and `src/state/dirs.test.ts` keep passing untouched, per "The capture behavior is already pinned by src/harness/capture/file.test.ts and src/state/dirs.test.ts on this branch, so those files must keep passing untouched".

## Design decisions

- Restore the whole file from the master git blob rather than reassembling individual tests, so the seven unrelated tests stay byte-for-byte identical without hand transcription.
- Change only the single cleanup test's import, sentinel path, and directory initialization, keeping `clearStateDirectories()` as the cleanup trigger because the test is about surviving a real startup cleanup.
- Use `.janissary/recordings/` because its registry entry still has a `clear` (Assumption 3), while the capture entry deliberately has none (Assumption 4).
- Leave the two capture-specific test files untouched; the retention behavior they pin is not part of this repair.
- Record the restored integration coverage in `product/specs/testing.md` so the spec set reflects the coverage the branch carries.

## Preserved behavior

1. The capture reaper continues to be exercised against a directory with no launch clear; removing its test or adding a clear back to the registry must not happen. This is pinned by `src/harness/capture/file.test.ts` "reaps .txt files older than the retention window".
2. `clearStateDirectories()` continues to clear exactly the entries that declare a `clear`; the schedule file and runscripts are never among them. This is pinned by `src/state/dirs.test.ts` "clears every entry with a clear on every launch".

## Assumptions

1. The master blob holds 197 lines and eight integration tests: `git show origin/master:src/schedule/system/storage.integration.test.ts` lists them, including the repeated-startup-cleanup test.
2. `clearStateDirectories()` calls every registered entry's clear — `src/state/dirs.ts:135` (`for (const entry of entries) { entry.clear?.(); }`).
3. The recordings entry still clears — `src/state/dirs.ts:36` (`clear: (): void => { clearHarnessRecordingDirectory(); },`).
4. The capture entry deliberately has no clear — `src/state/dirs.ts:27` ("No `clear`, deliberately: captures are kept for the `logRetentionInDays` window").
5. `initHarnessRecordingDirectory` points at `<project>/.janissary/recordings` — `src/harness/recording-file.ts:8` (`recordingDirectory = path.join(projectDirectory, '.janissary', 'recordings');`).
6. The seven unrelated tests are the only integration coverage for those behaviors, as the backlog entry states: "they are the only integration coverage for malformed and future-version stores, atomic replacement failure cleanup, nested paths with spaces in git excludes, tracked targets, already-ignored rules, and symlinked persistent storage".

## Existing functionality

1. The master version of the deleted file, available as a git blob at `origin/master:src/schedule/system/storage.integration.test.ts`.
2. The recording directory init/clear pair — `src/harness/recording-file.ts:7` (`initHarnessRecordingDirectory`) and `src/harness/recording-file.ts:28` (`clearHarnessRecordingDirectory`).
3. The startup cleanup driver — `src/state/dirs.ts:135` (`clearStateDirectories`).
4. The capture tests already on the branch — `src/harness/capture/file.test.ts` and `src/state/dirs.test.ts`.

## Implementation steps

1. Restore `src/schedule/system/storage.integration.test.ts` from the `origin/master` blob. In the one test named `keeps snapshots and scripts through repeated real startup cleanup cycles`, replace the `initHarnessCaptureDirectory` import with `initHarnessRecordingDirectory` from `../../harness/recording-file.js`, set the per-run sentinel directory to `.janissary/recordings/`, and call `initHarnessRecordingDirectory(root)` inside each cycle before writing the sentinel. Keep `clearStateDirectories()`, the sentinel-removal assertion, and the schedule-file and runscript survival assertions in both cycles. Do not touch the other seven tests. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add one short paragraph to `product/specs/testing.md` naming the restored schedule storage integration coverage: the real-project and real-git scenarios plus the repeated-startup-cleanup check and its per-run directory. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change restores one test file and adds a spec note; it adds or changes no user interface.

## Tests

1. Requirements 1 and 2: the restored file's eight tests run in the server project; the seven untouched tests pin snapshot round-tripping, malformed and future-version stores, atomic replacement failure cleanup, space-safe git excludes, tracked-target refusal, preignored rules, and symlink rejection.
2. Requirements 3 through 6: the repeated-startup-cleanup test initializes the recordings directory, writes its sentinel there, and asserts across two `clearStateDirectories()` cycles that the sentinel is gone while the persisted schedule file and runscripts survive.
3. Requirement 7: `$janissary/scripts/run.mjs check-diff` runs the unchanged capture tests and confirms they still pass.

## Out of scope

- No production source change; capture retention and the state-directory registry stay as they are on the branch.
- No edits to `src/harness/capture/file.test.ts`, `src/state/dirs.test.ts`, or any other capture-specific test.
- No correction to the pull request description; that is a separate backlog entry.
- No help page, user documentation, or developer documentation changes.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run `npx vitest run --project server src/schedule/system/storage.integration.test.ts src/harness/capture/file.test.ts src/state/dirs.test.ts` and confirm all tests pass. Finally read `git diff origin/master -- src/schedule/system/storage.integration.test.ts` and confirm the only changes are the import, the sentinel directory path, and its initialization call inside the repeated-startup-cleanup test.
