# Correct the preserved-behavior example's pinning test

**Complexity: 1/10** — a pull-request-description correction: 3 requirements, but 0 production lines, 0 production files, 0 test scenarios and 0 new units (p=2.56); the only risk is quoting a real test verbatim.

## Goal

Make the "After" example in the Behavior examples section of pull request #2183's description point at a real existing test. The pull request introduces a rule that every preserved-behavior entry names the existing test that pins the behavior, so its own showcase must not cite a path and test that do not exist.

## Requirements

1. In the "After" entry of the "Behavior examples" section, replace the reference to the non-existent `src/tab/__tests__/navigation.test.ts` "cycles tabs without reordering" with a real existing test in `src/tab/` that pins tab switching and ordering, quoting that test's real name. (Backlog entry's `*` summary bullet.)
2. State a negative assertion the named test actually pins, so the entry satisfies the template rule that the named test is one "that must keep passing and pins that behavior" (`ai/guidelines/plan-template.md:31`). (Verified against the template.)
3. Leave the "Before" example, the contrast paragraph after the two examples, and every other paragraph of the description byte-for-byte as the author wrote them, and do not touch the title. (Backlog entry's `Proposal` paragraph and `Forbidden` rule 9.)

## Design decisions

- The change is to the pull request's body only. No rule, document, source file, spec, or application behavior that the pull request edits is changed, so no test is added and no spec is updated.
- The replacement test is `src/tab/hidden-lifecycle.integration.test.ts` "cycles over a hidden tab without revealing it and keeps full-array numbering". It is an existing test that calls `manager.moveTab(1)`, the next-tab action implemented by `moveTabOp` (`src/tab/navigation-commands.ts:32`), and asserts the active tab advances while numbering stays `[1, 2, 3]` and the hidden tab is not revealed. It therefore pins the switching/ordering behavior the example describes and is a better match than a test of an explicit reorder operation.
- The negative assertion is narrowed to what that test pins: the cycle does not reveal a hidden tab and does not renumber the remaining tabs. The original claim about per-tab scroll position is dropped because no existing cycling test pins it; leaving it would attribute to a test a behavior that test does not check.
- The body is a live GitHub artifact, so it is written to the scratch file and applied with `gh pr edit --body-file` only after the commit is pushed, per the work task's Step 8.5.

## Preserved behavior

None found. This correction changes no application behavior and no rule that a future plan relies on, so there is nothing to pin.

## Assumptions

1. The cited test path does not exist under `src/tab/`; the real cycling test lives at `src/tab/hidden-lifecycle.integration.test.ts:183` ("cycles over a hidden tab without revealing it and keeps full-array numbering").
2. The next/previous key bindings act through `moveTabOp`, which cycles to the next eligible center action tab without reordering — `src/tab/navigation-commands.ts:32` ("export function moveTabOp").
3. A preserved-behavior entry must name "the existing test that must keep passing and pins that behavior" — `ai/guidelines/plan-template.md:31`.
4. The pull request description is edited after the push with `gh pr edit --body-file ./temp/pr-body.md`, which replaces the body wholesale — `./ai/tasks/feature/work-pull-request-issue.md:148`.

## Existing functionality

1. The next/previous tab action, `moveTabOp`, which advances over eligible tabs without changing array order — `src/tab/navigation-commands.ts:32` ("export function moveTabOp").
2. The real cycling test that pins that action's behavior — `src/tab/hidden-lifecycle.integration.test.ts:183` ("it('cycles over a hidden tab without revealing it and keeps full-array numbering'").
3. The plan template's three-part entry rule that the example is meant to demonstrate — `ai/guidelines/plan-template.md:31` ("Each entry has three parts").

## Implementation steps

First, open `src/tab/hidden-lifecycle.integration.test.ts` at the named test and confirm its quoted name, its `manager.moveTab(1)` call, and its numbering and hidden-tab assertions; confirm `moveTabOp` in `src/tab/navigation-commands.ts` is the next-tab action. Build command: `$janissary/scripts/run.mjs check-diff` (no production file changes, so this confirms a clean tree).

Second, in `./temp/pr-body.md`, rewrite only the "After" fenced block in the "Behavior examples" section so the negative assertion matches the named test and the final line cites `src/tab/hidden-lifecycle.integration.test.ts` with the test's exact quoted name. Do not edit the "Before" block, the contrast paragraph, or any other paragraph, and do not change the title. Build command: `$janissary/scripts/run.mjs check-diff`.

Third, after the resolved change is committed and pushed, apply the corrected body with `gh pr edit` using the body file, then re-read the pull request body and confirm every other paragraph is unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to pull request prose and touches no user-visible surface.

## Tests

This change introduces no code and changes no application behavior, so no tests are added; per the plan template, tests of prose are not introduced. The test the example names is an existing application test, confirmed by reading it during implementation.

## Out of scope

- No source, test, config, spec, help, or documentation file is changed.
- No change to the pull request title or to any paragraph other than the "After" entry in "Behavior examples".
- No new test is written to pin the example; the example points at a test that already exists.
- No other entry in `product/backlog/pull-request.md` is edited.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression.

Then do a concrete reading-based check. Open `src/tab/hidden-lifecycle.integration.test.ts` and confirm a test named "cycles over a hidden tab without revealing it and keeps full-array numbering" exists at the cited location, that it calls `manager.moveTab(1)`, and that it asserts the advanced active tab, the unchanged `[1, 2, 3]` numbering, and the still-hidden tab. Read `src/tab/navigation-commands.ts` and confirm `moveTabOp` is the cycling action. Re-read the pull request body with `gh pr view <reference> --json body` and confirm the "After" entry names that file and that exact test name, that its negative assertion matches what the test checks, and that the "Before" block, the contrast paragraph, and all other paragraphs are word-for-word as they were before the change. A remaining reference to `src/tab/__tests__/navigation.test.ts`, a misquoted test name, or any change outside the "After" entry means the correction did not land correctly.
