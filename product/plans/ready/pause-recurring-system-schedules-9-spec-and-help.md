# Document pause and resume in the scheduling spec and keys help

**Complexity: 1/10** — docs only: 2 requirements, no code or test scenarios (p=2.353)

## Goal

Bring the in-repo behavior spec and the app's key help in line with the pause and resume feature. `product/specs/scheduling.md` is the authoritative behavior record and `help/keys.md` is the in-app help for key bindings. This change describes the new store version, the two verbs and their exact messages, the paused row control, and the Schedules tab keys. It adds no code and changes no behavior; it records what the earlier subplans deliver.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-4-pause-command.md`, `pause-recurring-system-schedules-5-resume-command-and-list.md`, `pause-recurring-system-schedules-6-completion.md`, `pause-recurring-system-schedules-7-wire-plugin-topics.md`, and `pause-recurring-system-schedules-8-schedules-tab-ui.md`.

## Requirements

1. "`product/specs/scheduling.md` describes pause and resume, the version-2 store, the new verbs and messages, and the row control" (`ai/guidelines/architecture-principles.md` §10).
2. "`help/keys.md` gains a Schedules tab controls table" (user answer: "Space or p toggles"; see UI design 12 of the source plan).

## Design decisions

- Edit only `product/specs/scheduling.md` and `help/keys.md`. No source file, test, or user-documentation page under `documentation/user-documentation/` is named as a requirement here.
- In the spec, update the Durable system schedules, System schedule firing, Scheduling tab, and `schedule` command sections so they describe Requirements 1 to 45 of the source plan. State the exact messages verbatim, per `ai/guidelines/developer-documentation.md`: `Paused <name> in system.`, `Resumed <name> in system.`, `No recurring scheduled command "<name>" in system.`, `No paused scheduled command "<name>" in system.`, `Could not save system schedules.`, the `(paused)` list cell, and the full usage line.
- Change the spec's "a versioned snapshot" wording to say this build writes version 2 and reads versions 1 and 2, that `paused: true` is valid only in a version-2 recurring entry, and that a newer version blocks saving.
- Describe the row icon and the `Space`/`p` toggle with the same observable behavior the UI subplan implements, including that one-shots and tab rows have no control and that a failed save is silent.
- In `help/keys.md`, add a Schedules tab controls table listing the list's keys: arrows, Home/End, Enter, Backspace/Delete, and `Space` or `p`, matching the asciicast tab's play/pause key description. Place it alongside the existing help tables in the same house style.
- Keep the spec's `[[name]]` cross-reference style and exact error-message convention. Do not introduce implementation code or code fences that paste a type or function body.

## Assumptions

1. `product/specs/` is the authoritative behavior record and a behavior change updates it in the same change: `ai/guidelines/architecture-principles.md:75` `product/specs/` is declared authoritative ("when behavior is ambiguous, the spec is the source of truth")`.
2. The scheduling spec already has Durable system schedules, System schedule firing, Scheduling tab, and `schedule` command sections to extend.
3. `help/keys.md` is the in-app key help and is not under `documentation/user-documentation/`, so it is in scope for a feature plan; user docs under that directory are owned by a separate documentation task.
4. The exact messages and the version-2 format are delivered by the earlier command and store subplans and are pinned by their tests.

## Existing functionality

1. `product/specs/scheduling.md` already describes the versioned system schedule store and the `schedule system` grammar, providing the sections to extend.
2. `help/keys.md` already has per-tab key tables, including the asciicast play/pause keys, providing the table style to match.
3. `src/commands/schedule.ts` and `src/schedule/usage.ts` hold the literal messages the spec must quote, so the text can be copied from the code rather than invented.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Edit `product/specs/scheduling.md` in the Durable system schedules section: state that every save writes version 2, that versions 1 and 2 load, that `paused: true` is valid only on a recurring version-2 entry, that loading never rewrites the store, and that a newer version blocks saving. Keep the existing statements about duplicate ids, opaque keys, and atomic writes.
2. Edit the System schedule firing section to state that a paused entry does not fire, is not reported or advanced during startup recovery, keeps its key and recurrence, and that a pause committed while a tick waits on the shell stops that firing while already-queued shell lines still run. Describe resume as the first occurrence strictly after the resume moment with no replay of the paused period.
3. Edit the Scheduling tab and `schedule` command sections to describe the Pause/Resume icon and `Space`/`p` toggle, the two verbs, their exact success, idempotent, not-found, and failed-save messages, the `(paused)` list cell, the state-aware completion, and that cancel and clear still remove paused rows. Quote the full usage line verbatim from `src/schedule/usage.ts`.
4. Add a Schedules tab controls table to `help/keys.md` beside the asciicast table at `help/keys.md:88`, using the same `| Key | Action |` layout and the exact `| \`Space\` or \`p\` | Play / pause |` row at `help/keys.md:92`. List arrows, Home/End, Enter, Backspace/Delete, and `Space` or `p`. Add no other page.
5. Run `$janissary/scripts/run.mjs check-diff`; it is the build command for every step above and must leave the tree green. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan edits prose only; the control it documents is implemented and verified in `pause-recurring-system-schedules-8-schedules-tab-ui.md`.

## Tests

- No new tests. The behavior these documents describe is already covered by the tests in the subplans they follow, and documentation-only changes introduce no test target. Existing tests must still pass under `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- No code, test, config, or behavior change.
- No page under `documentation/user-documentation/`; a user-facing page is a separate documentation feature candidate and is carried as an Open item, not written into this plan.
- No change to the spec's other commands or to any other help page.
- No `pause until`, pause-all, or notification documentation, because those features do not exist.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete reading-based check: read the Durable system schedules, System schedule firing, Scheduling tab, and `schedule` command sections of `product/specs/scheduling.md` and confirm each names version 2, `paused: true`, the two verbs, the exact messages quoted from `src/schedule/usage.ts` and `src/commands/schedule.ts`, and the row control; then read the Schedules tab controls table in `help/keys.md` and confirm it lists arrows, Home/End, Enter, Backspace/Delete, and `Space` or `p`. A missing verb, a paraphrased error message, or an absent table row means the change was not made correctly.
