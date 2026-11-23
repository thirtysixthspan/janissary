# Anchor the description's verification claims to the code that proves them

**Complexity: 2/10** — 18 prose requirements on the PR body, no production lines or files, no test scenarios or new units (p=3.65)

## Goal

The pull request body makes six kinds of verification claim — four Behavior examples transcripts, the Screenshots statement, and the twelve Do/Expect lines under How to verify — without pointing a reviewer at the code that establishes any of them. The goal is to place a concrete code reference beside each of those claims, using the anchors named in the recorded finding: `reapHarnessCaptures` in `src/harness/capture/file.ts` and its launch-time call in `src/main.ts` for capture survival and aging, `reapFilesOlderThan` in `src/state/reaper.ts` and `src/state/reaper.test.ts` for the direct regular `.txt` restriction, `STATE_DIRECTORY_ENTRIES` in `src/state/dirs.ts` and `src/state/dirs.test.ts` for keeping the init while dropping the clear, and the empty diff under `web/src/` for the no-web-UI statement. The implementation, tests, specs, and help are already correct; this change edits only the live PR description.

## Requirements

1. The "Before — a capture was erased on the next launch" transcript carries a reference to `STATE_DIRECTORY_ENTRIES` in `src/state/dirs.ts` (no `clear` for `harnessCapture`, pinned by `src/state/dirs.test.ts`) and to `reapHarnessCaptures` in `src/harness/capture/file.ts` with its call in `src/main.ts`.
2. The "After — the capture survives the relaunch" transcript carries a reference to `reapHarnessCaptures` in `src/harness/capture/file.ts` and to `STATE_DIRECTORY_ENTRIES` in `src/state/dirs.ts` / `src/state/dirs.test.ts`.
3. The "After — an old capture is aged out, a current one stays, other entries are left alone" transcript keeps its existing `reapHarnessCaptures`/`src/main.ts` comment and gains a reference to `reapFilesOlderThan` in `src/state/reaper.ts` and `src/state/reaper.test.ts` for the other-entries claim.
4. The "With retention 0, every capture from earlier runs is removed" transcript carries a reference to the launch-minus-days cutoff in `reapHarnessCaptures` at `src/harness/capture/file.ts` and its unawaited call in `src/main.ts`.
5. The Screenshots statement carries a reference to the absence of changes under `web/src/`.
6. Verification step 1's Do line carries a `STATE_DIRECTORY_ENTRIES` / `src/state/dirs.test.ts` reference.
7. Verification step 1's Expect line carries a `reapHarnessCaptures` / `src/main.ts` reference.
8. Verification step 2's Do line carries a `reapHarnessCaptures` / `src/main.ts` reference.
9. Verification step 2's Expect line carries a cutoff / `src/state/reaper.test.ts` reference.
10. Verification step 3's Do line carries a `reapFilesOlderThan` / `src/state/reaper.ts` reference.
11. Verification step 3's Expect line carries a `reapFilesOlderThan` / `src/state/reaper.test.ts` reference.
12. Verification step 4's Do line carries a cutoff / `src/main.ts` reference.
13. Verification step 4's Expect line carries a `reapHarnessCaptures` / `src/main.ts` reference.
14. Verification step 5's Do line carries a `src/main.ts` unawaited-call reference.
15. Verification step 5's Expect line carries a `src/harness/capture/file.ts` sweep-and-write reference.
16. Verification step 6's Do line carries a `reapHarnessCaptures` / `src/main.ts` reference.
17. Verification step 6's Expect line keeps the `reapHarnessCaptures` / `src/main.ts` reference an earlier finding already added, without rewriting it.
18. Every other paragraph of the PR body, including all earlier corrections, and the PR title stay byte-for-byte unchanged, and no source, test, spec, or help file changes: "Leave the substance of each claim untouched except where earlier findings already corrected it."

## Design decisions

- Add references only to the three named surfaces: the Behavior examples transcripts, the Screenshots statement, and the Do/Expect lines of How to verify; the `What` prose and the Setup/closing prose are untouched.
- Append the reference beside each claim rather than replacing its wording, so no claim's substance changes and earlier corrections survive verbatim.
- Use the exact anchors the finding names — `reapHarnessCaptures`/`src/main.ts`, `reapFilesOlderThan`/`src/state/reaper.test.ts`, `STATE_DIRECTORY_ENTRIES`/`src/state/dirs.test.ts`, and the empty `web/src/` diff — with the verified line positions as a convenience, not as new claims.
- The step 6 Expect line and the third transcript already carry `reapHarnessCaptures`/`src/main.ts` references from earlier findings; keep them and only add the still-uncovered anchor to that transcript.
- Leave change-set statistics out of the added references and keep the PR title untouched.
- Apply the body edit only after the plan and backlog commit are pushed: the description is a live GitHub artifact while file edits are not published until the push lands.

## Preserved behavior

1. Capture reaping still fixes the cutoff at launch time minus `logRetentionInDays` days, so a file last modified at or after launch survives even at zero retention; it must not change the cutoff arithmetic or the unawaited call. This is pinned by `src/harness/capture/file.test.ts` "uses launch as the cutoff when retention is zero".
2. The state-directory registry still keeps the capture init with no `clear`, so a fresh start does not wipe captures; it must not gain a `clear` for `harnessCapture`. This is pinned by `src/state/dirs.test.ts` "never clears the harness capture directory".
3. The reaper still deletes only direct regular files whose names end with the extension and whose mtime is before the cutoff; it must not broaden to subdirectories, symbolic links, or other extensions. This is pinned by `src/state/reaper.test.ts` "leaves subdirectories and their contents untouched".

## Assumptions

1. The capture sweep is `reapHarnessCaptures`: `src/harness/capture/file.ts:29` (`export async function reapHarnessCaptures(launchedAt: number, days: number)`).
2. The cutoff arithmetic is launch minus days: `src/harness/capture/file.ts:32` (`launchedAt - days * DAY_MS`).
3. The sweep starts unawaited at launch with the configured days: `src/main.ts:82` (`void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`).
4. The direct regular `.txt` restriction is in the reaper: `src/state/reaper.ts:16` (`if (!entry.isFile() || !entry.name.endsWith(extension)) continue;`) with cases in `src/state/reaper.test.ts:56` ("leaves subdirectories and their contents untouched") and `src/state/reaper.test.ts:71` ("keeps symbolic links and their targets").
5. The capture registry entry has an init but no clear: `src/state/dirs.ts:25` (`export const STATE_DIRECTORY_ENTRIES = [`) with the `harnessCapture` entry at `src/state/dirs.ts:30` and the pin at `src/state/dirs.test.ts:122` ("never clears the harness capture directory").
6. No web surface changed on this branch: `git diff master...HEAD -- web/src/` is empty.
7. The existing body's storage-integration paragraph and the two already-added `reapHarnessCaptures`/`src/main.ts` references are earlier findings' corrections and must survive unchanged.

## Existing functionality

1. The current PR body, read with `gh pr view <reference> --json body` — the only artifact this plan changes.
2. The capture reaper — `src/harness/capture/file.ts:29` (`reapHarnessCaptures`) — which supplies the survival and aging anchors.
3. The unawaited launch call — `src/main.ts:82` (`void reapHarnessCaptures(...)`) — which the survival, aging, and zero-retention claims cite.
4. The direct-entry reaper — `src/state/reaper.ts:7` (`reapFilesOlderThan`) and `src/state/reaper.test.ts:41` (its test suite) — which the non-candidate and cutoff claims cite.
5. The state-directory registry — `src/state/dirs.ts:25` (`STATE_DIRECTORY_ENTRIES`) and `src/state/dirs.test.ts:122` ("never clears the harness capture directory") — which the survival claim cites.
6. The absence of a `web/src/` diff on this branch, which the Screenshots claim cites.

## Implementation steps

1. Read the current body with `gh pr view <reference> --json body` and copy it verbatim into `./temp/pr-body.md`. Append a code reference to each of the four Behavior examples transcripts: the first two cite `STATE_DIRECTORY_ENTRIES` in `src/state/dirs.ts` with its no-clear pin in `src/state/dirs.test.ts` and `reapHarnessCaptures` in `src/harness/capture/file.ts` with its call in `src/main.ts`; the third keeps its existing `reapHarnessCaptures`/`src/main.ts` comment and gains `reapFilesOlderThan` in `src/state/reaper.ts` with `src/state/reaper.test.ts`; the fourth cites the launch-minus-days cutoff at `src/harness/capture/file.ts` and its unawaited call at `src/main.ts`. Append a reference to the Screenshots statement naming the empty `web/src/` diff. Confirm no other paragraph or the title changed. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `./temp/pr-body.md`, append a code reference to each Do and Expect line of How to verify steps 1 through 6 using the same four anchors, leaving step 6's Expect line untouched because an earlier finding already anchored it, and leaving every other paragraph byte-for-byte. No repository file is edited. Build command: `$janissary/scripts/run.mjs check-diff`.
3. After the plan and backlog removal are committed and pushed, apply the revised body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then confirm the PR is still open and its head commit matches `git rev-parse HEAD`. Do not merge, close, force-push, or touch the title. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change adds code references to prose in the pull request body; it adds or changes no user interface.

## Tests

None. The plan changes no application behavior and introduces no code, so no test is added. Requirements 1 through 17 are checked by reading the revised body, and requirement 18 by comparing it against the original and by the repository diff. Tests of documentation and of GitHub prose are not introduced.

## Out of scope

- No source, test, spec, or help file change.
- No correction to the `What` prose, the Setup/closing prose of How to verify, or the storage-integration paragraph corrected by an earlier finding.
- No change to the PR title, no merge, no close, and no force-push.
- No change-set statistics in the added references.
- No new tests: this is a prose annotation with no behavior to exercise.

## Verification

`$janissary/scripts/run.mjs check-diff` after the changes. Then read `gh pr view <reference> --json body` and confirm every Behavior examples transcript, the Screenshots statement, and every Do and Expect line carries a reference naming one of the four anchors, that step 6's Expect line and the third transcript retain their earlier `reapHarnessCaptures`/`src/main.ts` comments, and that every other paragraph — including the earlier storage-integration correction — and the title match the original word for word. Finally read `git status --short` and `git diff master...HEAD -- src/` and `git diff master...HEAD -- web/src/` to confirm no source, test, or web file was touched by this work item.
