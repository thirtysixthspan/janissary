# Fix stale system-schedule completion test options

**Complexity: 1/10** — test fixtures only: 3 requirements, 0 production files or new units (p=2.555)

## Goal

Bring the remaining `systemSchedule` options fixtures in `src/completion/index.test.ts` in line with the widened `SystemScheduleCompletions` contract. After pause/resume added required `activeRecurringNames` and `pausedNames` fields, a handful of test call sites still pass the old two-field `{ names, scripts }` shape. They rely on the completer's empty-list fallbacks, so the tests pass while quietly violating the declared contract. Updating those fixtures removes the debt without changing what the tests exercise.

## Requirements

1. "the six literals in the runscript-completion tests covering execute and edit" pass `activeRecurringNames: []` and `pausedNames: []` in their seventh-argument options object, so every such object carries all four contract fields.
2. "the scripts object in the disabled-command guard test's cases loop" passes `activeRecurringNames: []` and `pausedNames: []`, so that object also carries all four contract fields.
3. "Leave each object's existing names and scripts values unchanged so those tests keep exercising the same runscript completion" — the `names` and `scripts` values at every touched call site stay byte-for-byte the same.

## Design decisions

- Change only test fixtures. No production module, type, or completion behavior is modified; the contract in `src/completion/system-schedule.ts` already requires all four fields.
- Add empty arrays (`[]`) for the two new fields rather than realistic names, because the touched tests target runscript name completion and the disabled-command guard, not pause/resume name completion (that is covered by the dedicated system-schedule grammar suite, whose options object already has all four fields).
- Update the shared `scripts` object in the guard test once, at its declaration, so every iteration of the cases loop receives the completed shape.
- Edit no spec, help page, user/developer documentation, PR description, or backlog file other than removing the resolved pull-request entry.

## Preserved behavior

1. Runscript name completion for `execute` and `edit` still offers only the script names from `scripts`; the added empty name lists must not introduce `pause`/`resume` candidates or alter the matches — pinned by `completes execute names only in its single name slot`.
2. The disabled-command guard still leaves the input unchanged and returns no matches for every command-specific completer; adding two empty fields to its options object must not make any guarded completer run — pinned by `guards every command-specific completer`.

## Assumptions

1. The fourth-field contract is already settled: `src/completion/system-schedule.ts:4-9` declares `SystemScheduleCompletions` with `names`, `scripts`, `activeRecurringNames`, and `pausedNames`, all required.
2. The completer still defaults the new lists to empty: `src/completion/system-schedule.ts:25-29` reads `options?.activeRecurringNames ?? []` and `options?.pausedNames ?? []`, so empty arrays preserve today's results at the touched call sites.
3. The runscript tests pass their options as the seventh argument: `src/completion/index.ts:60-73` declares `systemSchedule` as parameter 7 of `completeCommandLine`.
4. The system-schedule grammar suite already supplies all four fields at `src/completion/index.test.ts:125-130`, so it needs no change.

## Existing functionality

1. `completeCommandLine` in `src/completion/index.ts:60` provides the seventh-argument `systemSchedule` slot the fixtures fill.
2. The `options` object in the system-schedule grammar suite at `src/completion/index.test.ts:125` is the in-file precedent for a four-field `SystemScheduleCompletions` literal.
3. The completer's `?? []` fallbacks at `src/completion/system-schedule.ts:26,29` let empty arrays stand in for absent pause/resume names without changing completion results.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`, which is the build command for every step.

1. In the `completeCommandLine — runscript commands` suite of `src/completion/index.test.ts`, add `activeRecurringNames: []` and `pausedNames: []` to each of the six `{ names: [], scripts }` literals passed as the seventh argument (three `execute` cases and three `edit` cases). Keep `names: []` and `scripts` exactly as they are. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In the `completeCommandLine — disabled command guard` suite, add `activeRecurringNames: []` and `pausedNames: []` to the `scripts` object declared in `guards every command-specific completer`, which the cases loop passes as the seventh argument. Keep its `names: []` and `scripts: ['deploy']` values unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Read the file back and confirm no seventh-argument `systemSchedule` object remains in the two-field shape. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This change edits test fixtures only and exposes no user interface.

## Tests

- No new tests are added. The change widens existing fixtures to the declared contract; the touched suites (`completeCommandLine — runscript commands` and `completeCommandLine — disabled command guard`) must keep passing, as must the whole server project under `$janissary/scripts/run.mjs check-diff`.
- If a sandbox denies loopback sockets and `src/index.test.ts` fails with `EPERM`, also run `npx vitest run --project server src/completion/index.test.ts` directly and report that result; do not change test infrastructure to force a green check.

## Out of scope

- No production code, type, or completion behavior change.
- No new test cases or assertions.
- No change to `product/specs/`, `help/`, or any page under `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No PR description correction and no change to the pull-request title.
- No merging or closing of PR 2253.

## Verification

1. `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and tests for the diff) must be green, apart from a documented sandbox-only `EPERM` in `src/index.test.ts` if that occurs.
2. Concrete reading-based check: read `src/completion/index.test.ts` and confirm all six runscript-completion literals in the `execute`/`edit` suite and the guard suite's `scripts` object now list all four fields (`names`, `scripts`, `activeRecurringNames`, `pausedNames`) with the two new fields set to `[]`; confirm no `names: []` object lacking the new fields is passed as the seventh argument. A remaining two-field object, or a changed `names`/`scripts` value, means the change was not made correctly.
