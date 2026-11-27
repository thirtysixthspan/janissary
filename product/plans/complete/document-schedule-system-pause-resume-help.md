# Document the schedule system pause and resume verbs in the schedule help page

**Complexity: 1/10** — help-only edit to one Markdown file; no production code, no behavior change, no new tests (p=1.578).

PR 2253 backlog item: *"Close the documentation gap that leaves the in-app schedule help page without the new system pause and resume verbs."*

`help/schedule.md` lists the system management forms `schedule system list`, `schedule system cancel <name>`, and `schedule system clear`, and its use-case bullet says you can "Schedule, list, cancel, or clear project-owned schedules that run existing runscripts and persist across restarts." It says nothing about the `schedule system pause <name>` and `schedule system resume <name>` verbs this branch adds, even though `product/specs/scheduling.md` and `help/keys.md` already describe them. A reader who opens in-app help to stop a recurring project schedule sees no pause verb and cancels the entry instead.

## Goal

Make `help/schedule.md` an accurate description of the system-management grammar this branch implements. The Usage block, the project-schedule use case, and the Examples must surface `pause` and `resume` beside the existing management forms, with the exact replies the command prints and the reserved-word rule, so a reader who opens in-app help finds the non-destructive way to stop a recurring schedule.

## Requirements

1. The Usage block shows `schedule system pause <name>` ("add `schedule system pause <name>` ... to the Usage block beside the existing system management forms").
2. The Usage block shows `schedule system resume <name>` ("add ... `schedule system resume <name>` to the Usage block beside the existing system management forms").
3. The two new usage lines sit beside the existing system management forms in list, cancel, pause, resume, clear order ("beside the existing system management forms").
4. The project-owned-schedule use-case bullet names pausing ("extend the use-case bullet ... to include pausing and resuming recurring ones").
5. The same use-case bullet names resuming recurring schedules ("include pausing and resuming recurring ones").
6. The Examples carry one example for the pause verb ("add one example for each verb").
7. The Examples carry one example for the resume verb ("add one example for each verb").
8. The pause example reproduces the exact reply `Paused nightly in system.` (`src/commands/schedule.ts:114` `Paused ${parsed.id} in system.`).
9. The resume example reproduces the exact reply `Resumed nightly in system.` (`src/commands/schedule.ts:89` `Resumed ${parsed.id} in system.`).
10. A use-case note states that `pause` and `resume` are reserved management words immediately after `schedule system` ("note that `pause` and `resume` are reserved management words immediately after `schedule system`, as product/specs/scheduling.md now states").

## Design decisions

- Edit only `help/schedule.md`; change no source, test, spec, or other help file.
- Treat the parser, the command, and their colocated tests as the source of truth for grammar and exact messages, because the backlog Proposal was written by a reviewer who did not run the tests.
- Reproduce the command's success replies verbatim rather than paraphrasing them, matching `ai/guidelines/user-documentation.md:100` ("Name the actual error/usage message a reader will see, verbatim").
- Keep the existing Usage / Use cases / Examples shape, backticked one-line forms, and `<angle brackets>` notation, and keep the system forms in the order of `src/schedule/usage.ts:5-6`.
- Do not add help for behavior that was not previously documented: the verbs already exist in this branch's code and spec.

## Preserved behavior

1. The command still prints `Paused ping in system.` when it pauses matching recurring system entries, so the help must not present a different or invented success reply for `pause`. Pinned by `src/commands/schedule.test.ts` › `pauses every recurring system entry with the exact name and prints the success line`.
2. The command still prints `Resumed ping in system.` when it resumes matching paused entries, so the help must not present a different or invented success reply for `resume`. Pinned by `src/commands/schedule.test.ts` › `resumes every paused system entry with the exact name and prints the success line`.
3. A stored system entry named `pause` still loads and can be cancelled, so the reserved-word note must not claim such a name becomes unusable everywhere. Pinned by `src/commands/schedule.test.ts` › `still cancels a stored system entry named pause`.
4. The system usage string still lists create, list, cancel, pause, resume, and clear in that order, so the help Usage block must not reorder or drop the existing forms. Pinned by `src/schedule/index.test.ts` › `uses the exact system usage line with pause and resume`.

## Assumptions

1. The system parser already accepts both verbs: `src/schedule/index.ts:69` `if (action === 'pause' && second !== undefined && rest.length === 0)`.
2. The words are reserved immediately after `schedule system`: `src/schedule/index.ts:75` `if (['list', 'clear', 'cancel', 'pause', 'resume'].includes(action)) return { error: SYSTEM_SCHEDULE_USAGE };`.
3. The usage string already names both forms in list/cancel/pause/resume/clear order: `src/schedule/usage.ts:6` `| schedule system cancel <name> | schedule system pause <name> | schedule system resume <name> | schedule system clear`.
4. The command prints the success replies verbatim: `src/commands/schedule.ts:114` `Paused ${parsed.id} in system.` and `src/commands/schedule.ts:89` `Resumed ${parsed.id} in system.`.
5. The spec already states the reserved-word rule: `product/specs/scheduling.md:121` "The words `pause` and `resume` are reserved immediately after `schedule system`".
6. The app help pages are the intended home for command grammar: `ai/guidelines/documentation.md:85` "Help Command Table" and `src/commands.test.ts` reads `help/` pages.
7. The four affected regions are `help/schedule.md:33-37` (system usage lines), `help/schedule.md:44` (project-owned schedules use case), `help/schedule.md:50` (reserved names use case), and `help/schedule.md:63-66` (Examples).

## Existing functionality

1. `src/schedule/index.ts:60` `function parseSystemSchedule` already parses the pause and resume forms.
2. `src/schedule/usage.ts:5` `SYSTEM_SCHEDULE_USAGE` already lists `schedule system pause <name>` and `schedule system resume <name>`.
3. `src/commands/schedule.ts:81-115` already dispatches pause and resume to the system owner and appends the success replies.
4. `product/specs/scheduling.md:121-127` already describes both verbs, their replies, and the reserved-word rule.
5. `src/commands/schedule.test.ts:305-399` already covers the success, already-paused, no-match, save-failure, and reserved-name paths.
6. `help/commands.md:112` already carries the `schedule system` row, so the Commands table needs no edit.

## Implementation steps

1. In `help/schedule.md`, add backticked usage lines `schedule system pause <name>` and `schedule system resume <name>` between `schedule system cancel <name>` and `schedule system clear`, in the same one-line style as the surrounding lines and in the order of `src/schedule/usage.ts:5-6`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Extend the project-owned-schedules use-case bullet at `help/schedule.md:44` so it names pausing and resuming recurring schedules while keeping its existing scheduling, listing, cancelling, and clearing wording. Add a use-case bullet beside `help/schedule.md:50` stating that `pause` and `resume` are reserved management words immediately after `schedule system`, without claiming stored entries under those names become uncancellable. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add one example per verb between the existing `schedule system cancel nightly` and `schedule system clear` examples at `help/schedule.md:65-66`, using the exact replies `Paused nightly in system.` and `Resumed nightly in system.` from `src/commands/schedule.ts:114` and `src/commands/schedule.ts:89`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Reread the edited page against `src/schedule/usage.ts:5-6`, `src/schedule/index.ts:60-84`, `src/commands/schedule.ts:81-115`, and `product/specs/scheduling.md:121-127`, confirming the forms, order, reserved-word rule, and exact replies match. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None — this change edits the in-app help page's Markdown prose only. It creates no new page, control, key binding, or interactive behavior.

## Tests

This plan changes no application behavior and introduces no code, so no tests are added, and tests of documentation are not introduced. The colocated tests named under Preserved behavior already pin the command's exact replies and the reserved-name behavior and are left untouched. `$janissary/scripts/run.mjs check-diff` runs the help check (`test:help`, `src/commands.test.ts`) for the changed help Markdown and confirms no regression.

## Out of scope

- Any source or test file, including `src/commands/schedule.ts`, `src/schedule/index.ts`, `src/schedule/usage.ts`, and `src/commands/schedule.test.ts`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- `product/specs/scheduling.md`, which already describes both verbs; no spec change is needed.
- `help/commands.md` and `help/keys.md`: the `schedule system` row and the schedules key table already exist, and no command, flag, or key binding changes.
- Verbatim no-match and save-failure replies; the examples name only the two success replies.
- The pull request title and description: the named work item calls for no description correction.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read `help/schedule.md` and compare it with `src/schedule/usage.ts:5-6`, `src/schedule/index.ts:69-75`, `src/commands/schedule.ts:81-115`, and `product/specs/scheduling.md:121-127`. Confirm the Usage block lists `schedule system pause <name>` and `schedule system resume <name>` between cancel and clear; the project-schedule use case names pausing and resuming recurring schedules; a use-case bullet names `pause` and `resume` as reserved immediately after `schedule system`; and one example per verb shows `Paused nightly in system.` and `Resumed nightly in system.` verbatim. A page that still lists only three management forms, omits the reserved-word note, or paraphrases the replies shows the change was not made correctly.
