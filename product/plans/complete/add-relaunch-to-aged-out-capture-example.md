# Add the relaunch to the aged-out capture example

**Complexity: 1/10** — 8 requirements on prose in one PR-body transcript, no production edits, tests, or new units (p=3.13)

## Goal

The "After — an old capture is aged out, a current one stays, other entries are left alone" transcript in the pull request body's Behavior examples backdates a capture, takes a new one, and immediately lists the directory without the old file. The sweep that removes old captures runs only at launch, so the transcript as written shows a deletion that cannot happen. The goal is to insert an explicit stop and relaunch between the setup commands and the final listing, name the code that performs the deletion and its single launch-time call, and show the backdated capture's removal only after that relaunch. No source, test, spec, or help file changes.

## Requirements

1. The aged-out transcript shows a stop of the app: "insert an explicit stop and relaunch of the app".
2. The aged-out transcript shows a relaunch of the app after the stop: "an explicit stop and relaunch of the app".
3. The stop and relaunch sit between the backdate and new-capture commands and the final directory listing: "insert an explicit stop and relaunch of the app between the backdate and new-capture commands and the final directory listing in that transcript".
4. The transcript names the deletion code: "state beside it that the deletion is performed by reapHarnessCaptures in src/harness/capture/file.ts".
5. The transcript names the single launch-time call: "from its single launch-time call in src/main.ts".
6. The final listing appears only after the relaunch, so the backdated capture's removal is an outcome of that relaunch: "Include the backdated capture's removal among the listed outcomes only after that relaunch".
7. The other transcripts' sequence is unchanged: "leave the other transcripts' sequence intact".
8. Every other paragraph of the PR body — including corrections from earlier findings — and the title stay byte-for-byte unchanged: "Correct the PR description only when the work item requires it" and "preserving everything else exactly".

## Design decisions

- Edit only the third transcript in "Behavior examples"; the Before transcript, the capture-survives transcript, the retention-0 transcript, Screenshots, and every How to verify step stay byte-for-byte.
- Place the stop then relaunch immediately after the `# in a harness tab: harness capture review` line and before the `$ ls .janissary/captures/` line, so the sweep's launch-time cutoff is established before the listing.
- Name `reapHarnessCaptures` in `src/harness/capture/file.ts` and its single unawaited launch call in `src/main.ts` in a comment beside the relaunch, so a reviewer can check the claim.
- Keep the existing listing output as-is: it already shows the new capture, `notes.md`, and `nested/` while omitting the backdated capture, and once it follows the relaunch that omission is the correct, launch-triggered removal.
- Apply the body edit only after the plan and backlog commit are pushed, because the description is a live GitHub artifact while file edits are not published until the push lands.
- Keep change-set statistics out of the prose; do not mention counts of commits, files, or lines.

## Preserved behavior

1. Capture reaping keeps its launch-time cutoff, so a file last modified at or after launch survives. This is pinned by `src/harness/capture/file.test.ts` "reaps .txt files older than the retention window".
2. The single unawaited launch call stays in the boot path. This is pinned by `src/main.ts:82` (`void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`).

## Assumptions

1. The sweep runs only at launch: `src/main.ts:82` (`void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`) is its only call site.
2. The deletion is done by `reapHarnessCaptures`: `src/harness/capture/file.ts:29` (`export async function reapHarnessCaptures(launchedAt: number, days: number): Promise<void>`) and its `reapFilesOlderThan` call at `src/harness/capture/file.ts:32`.
3. The transcript's new capture (`review-...txt`) has a current modification time, so it survives a relaunch whose cutoff is earlier than that time: `src/harness/capture/file.ts:31` ("The cutoff is `days` days before launch").
4. The storage-integration and zero-retention paragraphs in the current body are corrections from earlier findings and must survive unchanged.

## Existing functionality

1. The current PR body, read with `gh pr view <reference> --json body`, the only artifact this plan changes.
2. The capture reaper — `src/harness/capture/file.ts:29` (`reapHarnessCaptures`) — whose name the corrected transcript must cite.
3. The unawaited launch call — `src/main.ts:82` (`void reapHarnessCaptures(...)`) — which establishes that the sweep is launch-only.
4. The existing third transcript's listing, whose output already shows the new capture, `notes.md`, and `nested/` while omitting the backdated capture.

## Implementation steps

1. Read the current body with `gh pr view <reference> --json body` and copy it verbatim into `./temp/pr-body.md`. In the third Behavior examples transcript only, insert `node bin/janus.mjs stop /path/to/scratch-project` and `node bin/janus.mjs --no-open /path/to/scratch-project` after the `# in a harness tab: harness capture review` line and before the `$ ls .janissary/captures/` line. Add a comment line beside the relaunch stating that `reapHarnessCaptures` in `src/harness/capture/file.ts` performs the deletion from its single launch-time call in `src/main.ts`. Leave the backdate command, the new-capture command, and the listing output otherwise unchanged, so the listing now follows the relaunch and the backdated capture's absence is its outcome. Confirm every other paragraph and the title are byte-for-byte identical. No repository file is edited. Build command: `$janissary/scripts/run.mjs check-diff`.
2. After the plan and backlog removal are committed and pushed, apply the revised body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then confirm the PR is still open and its head commit matches `git rev-parse HEAD`. Do not merge, close, force-push, or touch the title. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change corrects prose in the pull request body; it adds or changes no user interface.

## Tests

None. The plan changes no application behavior and introduces no code, so no test is added. Requirements 1 through 7 are checked by reading the revised transcript; requirement 8 by comparing the body against the original and by the repository diff. Tests of documentation and of GitHub prose are not introduced.

## Out of scope

- No source, test, spec, or help file change.
- No correction to the other three transcripts, the Screenshots statement, any How to verify step, or the paragraphs corrected by earlier findings.
- No change to the PR title, no merge, no close, and no force-push.
- No new tests: this is a prose correction with no behavior to exercise.

## Verification

`$janissary/scripts/run.mjs check-diff` after the changes. Then read `gh pr view <reference> --json body` and confirm the aged-out transcript shows the stop and relaunch between the new-capture command and the final `ls`, names `reapHarnessCaptures` in `src/harness/capture/file.ts` and its single launch-time call in `src/main.ts`, and lists the backdated capture as removed only after that relaunch, while the other transcripts, every other paragraph (including earlier corrections), and the title match the original word for word. Finally read `git status --short` and `git diff origin/master -- src` and `git diff origin/master -- web/src` to confirm no source or test file was touched by this work item.
