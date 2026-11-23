# Rename the append-only log spec to Activity Log and update the config and state-directory specs

**Complexity: 1/10** — 2 spec-file requirements, no added production code, no production files edited, no tests (p=2.35)

Source plan: `./product/plans/complete/activity-logs.md`. Depends on `./product/plans/ready/activity-logs-3-reap-at-launch.md` and, through it, on `./product/plans/ready/activity-logs-1-rename-and-move.md` and `./product/plans/ready/activity-logs-2-gate-and-lazy-create.md`. This subplan documents behavior those three already deliver and adds no application code.

## Goal

The feature text asks for the spec title "Append-only Log" → "Activity Log". The specs still describe a log at `.janissary/log/` that is never reaped, initialized at startup, and ungoverned by `logEnabled`. This subplan renames and rewrites that spec and updates the two rows and one sentence in `application-config.md` and `state-directory.md` so the written behavior matches the implemented behavior. Nothing here changes what the app does; it changes only what the specs say it does.

## Requirements

1. The spec file is `product/specs/activity-log.md` (user answer: "All the names").
2. The spec is titled `# Activity Log` ("rename the spec title "Append-only Log" → "Activity Log"").

## Design decisions

- Rename `product/specs/append-only-log.md` to `product/specs/activity-log.md` and retitle it `# Activity Log`; no other spec, help page, or `ai/` file links to `append-only-log`, so the rename needs no inbound reference updates (Assumption 1).
- Replace every current-location reference to `.janissary/log/` with `.janissary/logs/activity/` and "append-only log" with "activity log" throughout the renamed spec, keeping the storage-format table and coverage description intact (Assumption 2). The one sentence stating that files already in the old `.janissary/log/` are left in place keeps the old path deliberately; a blind find-and-replace that erases that distinction would misstate the behavior. The record shape and the two-entry-per-command coverage are unchanged behavior, only renamed.
- Rewrite § Log rotation around the actual behavior: a new file starts each local day, matching `getDateStr`, not UTC today as the stale spec says (Assumption 3). The launch sweep deletes files last modified more than `logRetentionInDays` days before launch, whatever `logEnabled` says, and files left in the old `.janissary/log/` are neither moved nor reaped.
- Rewrite § Lifecycle around the actual behavior: `ActivityLogger` in `src/activity-log/logger.ts` is constructed at startup, replacing the stale `initLogDir in src/logger.ts` citation; the directory is created on the first written entry; the directory is never cleared; with `logEnabled` false nothing is written and no directory is created; the first failed write prints the one dedicated stderr line and stops logging for the run.
- In `product/specs/application-config.md`, add activity logs under `.janissary/logs/activity/` to the `logEnabled` row's list of what is written and to the `logRetentionInDays` row's list of what is kept, and widen the row's "considers only regular `.txt` files directly inside each directory" to name regular `.txt` files, and `.json` files for activity logs (Assumption 4). Keep the rest of both rows, including the `0` meaning and the launch-time cutoff.
- In `product/specs/state-directory.md:5`, add activity logs under `.janissary/logs/activity/` to the kept-and-swept sentence and cite `[[activity-log]]` (Assumption 5). The link resolves in this same subplan because the spec rename lands before the sentence is edited.
- The ready plan `product/plans/ready/recording-retention-reaper.md` also edits the `logEnabled` and `logRetentionInDays` rows of `application-config.md` and the kept-and-swept sentence of `state-directory.md:5`. Whichever plan lands second must keep both sets of additions in each of those places. Neither plan depends on the other.

## Preserved behavior

None found. This subplan changes only spec files; no application behavior is added or altered, and no existing test pins a spec's wording.

## Assumptions

1. No spec, help page, or `ai/` file links to the old spec: `product/specs/append-only-log.md:1` `# Append-only Log` is the only title, and a grep of `product/` finds `append-only-log` only in this source plan, its own file, and unrelated `complete/` plans.
2. The spec currently names the old directory and term: `product/specs/append-only-log.md:3` "append-only JSON files stored in `.janissary/log/`".
3. The spec's rotation section claims UTC naming and no retention: `product/specs/append-only-log.md:27` "A new file is created each UTC day" and "There is no retention or rotation beyond daily file naming", while the code uses local fields at `src/datetime.ts:3` `const y = now.getFullYear();` and the sweep delivered by the third subplan ages files out.
4. The two config rows are `product/specs/application-config.md:16` (the `logEnabled` row, opening "Whether harness and shell session transcript files under") and `product/specs/application-config.md:17` (the `logRetentionInDays` row, containing "considers only regular `.txt` files directly inside each directory").
5. The kept-and-swept sentence is `product/specs/state-directory.md:5` "Harness capture files under `.janissary/captures/`, along with harness and shell transcripts under ... are kept across launches and swept by age at launch instead".
6. The lifecycle paragraph cites a module that does not exist: `product/specs/append-only-log.md:31` "The log directory is initialized at startup (`initLogDir` in `src/logger.ts`)".

## Existing functionality

1. The spec cross-reference convention used to link related behavior: `product/specs/application-config.md:3` `See [[application-commands]] for the file format, fallback behavior, and edit rules.`
2. The existing config rows to extend rather than duplicate: `product/specs/application-config.md:16` `| `logEnabled` |` and `product/specs/application-config.md:17` `| `logRetentionInDays` |`.
3. The existing kept-and-swept sentence to extend: `product/specs/state-directory.md:5`.

## Implementation steps

1. Rename `product/specs/append-only-log.md` to `product/specs/activity-log.md` with `git mv`, retitle it `# Activity Log`, and replace the old directory and term throughout. Rewrite § Log rotation and § Lifecycle as stated in Design decisions, keeping the storage-format example and the entry-field table. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/application-config.md`, extend the `logEnabled` and `logRetentionInDays` rows with activity logs and widen the extension wording; in `product/specs/state-directory.md`, extend the kept-and-swept sentence with activity logs and a `[[activity-log]]` link. Preserve the recording plan's additions if that plan has already landed on those lines. No source file changes in this subplan, so the file set sufficient for a green build is just these three spec files. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This subplan changes only spec text and introduces no user interface surface.

## Tests

No tests are introduced. This subplan changes no application behavior and adds no code; per the plan template, nothing here needs a regression test. Requirements 1 and 2 are confirmed by the reading-based check in Verification.

## Out of scope

- No application code, config behavior, or test changes; all behavior was delivered by the first three subplans.
- No migration or cleanup of files already in `.janissary/log/` (user answer: "Leave them").
- No change to the server log's stale `.janissary/log/server.log` paths in `ai/tasks/` and `ai/guidelines/sandbox-e2e-browser.md`; those are left for the server-log backlog item (user answer: "Leave for server-log").
- No user-documentation page changes; user docs are owned by `update-documentation.md`, not by this plan.
- No edits to the recording plan or its spec changes.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read `product/specs/activity-log.md` and confirm its title is `# Activity Log`, that it names `.janissary/logs/activity/` and nowhere `.janissary/log/` as the current location, that § Log rotation says local days and age-based sweeping, and that § Lifecycle names `ActivityLogger` in `src/activity-log/logger.ts`, first-write directory creation, no clear, the `logEnabled` gate, and the one-line failure message. Read `product/specs/application-config.md` rows 16 and 17 and `product/specs/state-directory.md:5` and confirm each names activity logs under `.janissary/logs/activity/`, that the config row names `.json` files for activity logs alongside `.txt` files, and that the state-directory sentence cites `[[activity-log]]`. Also confirm no spec still titled `Append-only Log` remains. Failure looks like a stale path, a stale `initLogDir` citation, a missing `[[activity-log]]` link, or a config row that names only `.txt` files.
