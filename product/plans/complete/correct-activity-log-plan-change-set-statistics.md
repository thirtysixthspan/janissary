# Correct the activity-log plan's stale change-set statistics

**Complexity: 1/10** — five acceptance requirements bearing on three figures in a completed plan; no production lines, files, tests, or new units (p=2.84).

## Goal

The completed plan `product/plans/complete/activity-logs.md` describes a finished change whose own header no longer agrees with its body: line 3 still claims 24 requirements, 10 test scenarios, and the Implementation steps intro still says the work landed in four steps, while the file now lists 26 requirements, 17 named test scenarios, and five steps. Correct those three figures so a reader sizing the change or checking coverage from the header can trust it. This is an accounting fix to one completed plan; the rating, the requirement set, and every other part of the plan stay as written.

## Requirements

1. The complexity line states `26 requirements`, matching the 26 numbered entries in the plan's Requirements section (`product/plans/complete/activity-logs.md:11`–`:38`).
2. The complexity line states `17 test scenarios`, matching the 17 scenarios named in the Tests section across the logger, reap, state-directory, and controller test files (`product/plans/complete/activity-logs.md:100`–`:105`).
3. The Implementation steps intro states the work landed in "five steps", matching the 5 numbered steps that follow (`product/plans/complete/activity-logs.md:92`–`:98`).
4. The `**Complexity: 6/10**` rating, the rest of its rationale, and every requirement, design decision, preserved-behavior entry, and verification step in the completed plan stay unchanged.
5. No file other than `product/plans/complete/activity-logs.md` is edited.

## Design decisions

- Only the two stale figures on the complexity line and the one word in the Implementation steps intro change; the task is a recount, not a re-rating, so `6/10` and the remaining rationale (`7 production files, ~35 added lines (p=6.43)`) are retained verbatim.
- Requirements are counted from the numbered list in the plan as written, not from the plan's own prose description.
- Test scenarios are counted only from the quoted test names in the Tests section across the four named files — 12 in `src/activity-log/logger.test.ts`, 3 in `src/activity-log/reap.test.ts`, 1 in `src/state/dirs.test.ts`, and 1 in `src/controller.test.ts`. Mentions of tests in Preserved behavior, and requirements explicitly noted as having no test, are not scenarios.
- Implementation steps are counted from the numbered list in that section, not from the section's intro sentence.
- No requirement, design decision, preserved-behavior entry, or verification step is reworded or dropped to make the numbers fit.

## Preserved behavior

None found — the change edits no application behavior; it corrects three numbers in a completed plan.

## Assumptions

1. `product/plans/complete/activity-logs.md:3` carries `**Complexity: 6/10** — 24 requirements, 7 production files, 10 test scenarios, ~35 added lines (p=6.43)`.
2. `product/plans/complete/activity-logs.md:11`–`:38` numbers the Requirements list from 1 through 26.
3. `product/plans/complete/activity-logs.md:100`–`:105` names 17 test scenarios across the logger (12), reap (3), state-directory (1), and controller (1) test files.
4. `product/plans/complete/activity-logs.md:92` says "The work landed in four steps" while `:94`–`:98` number the Implementation steps 1 through 5.

## Existing functionality

1. The completed plan whose header is corrected — `product/plans/complete/activity-logs.md`.
2. The numbered Requirements, Tests, and Implementation steps sections that supply the recount — `product/plans/complete/activity-logs.md:11`, `:100`, `:90`.

## Implementation steps

1. **Recount and correct the three figures.** Read `product/plans/complete/activity-logs.md` and count the numbered Requirements (1–26), the named test scenarios in the Tests section across the logger, reap, state-directory, and controller files (17), and the numbered Implementation steps (1–5). On line 3, change `24 requirements` to `26 requirements` and `10 test scenarios` to `17 test scenarios`, leaving `7 production files, ~35 added lines (p=6.43)` and the `6/10` rating untouched. In the Implementation steps intro, change "The work landed in four steps" to "The work landed in five steps". Change nothing else — no requirement, design decision, preserved-behavior entry, or verification step. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Confirm the recount.** Reread the whole file and verify each stated count against its section: the complexity line says 26 and 17, the Requirements section has 26 entries, the Tests section names 17 scenarios (12 + 3 + 1 + 1), the intro says "five steps" and the section has 5 numbered steps, and every other part of the file reads as before. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None — no user interface is added or changed.

## Tests

None. The plan changes no application behavior and introduces no code; the artifact is three figures in a completed plan. Verification is by rereading that plan, as set out below. Tests of documentation are not introduced.

## Out of scope

- No source, test, spec, help, or other documentation edit, and no change to any file besides `product/plans/complete/activity-logs.md`.
- No change to the `6/10` rating, its rationale, or any requirement, design decision, preserved-behavior entry, or verification step in the completed plan.
- No description correction for the pull request, and no merge or close of the pull request.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` confirms no lint, typecheck, or test regression.

Manual: read `product/plans/complete/activity-logs.md` and confirm the complexity line reads `**Complexity: 6/10** — 26 requirements, 7 production files, 17 test scenarios, ~35 added lines (p=6.43)`; count the numbered Requirements and confirm 26 entries; count the quoted test names in the Tests section across the logger (12), reap (3), state-directory (1), and controller (1) files and confirm 17; confirm the Implementation steps intro says "five steps" and the section numbers 5 steps; and confirm no requirement, design decision, preserved-behavior entry, or verification step was altered. Failure looks like any stated count disagreeing with its section, a changed rating or rationale, or any substantive content reworded to fit the numbers.
