# Refresh the promoted plan's stale line anchors

**Complexity: 1/10** — single-file documentation-only anchor refresh: 9 stated requirements, 0 production lines/files/test scenarios and 0 new units (p=3.20).

## Goal

Restore `product/plans/complete/preserved-behavior.md` as a trustworthy source of truth by correcting the `path:line` anchors that drifted when pull request #2183 inserted lines into the documents they point at. After the fix, every anchor in the promoted plan lands on the line carrying its quoted fragment, so a reader following it reaches the right section and the "Wrong or stale references" check in `ai/tasks/planning/improve-plan.md` no longer flags the very plan the pull request tells readers to trust.

## Requirements

1. Every `ai/guidelines/plan-template.md:33` anchor that names `### Existing functionality` must resolve to the line carrying that heading (`ai/guidelines/plan-template.md:37`), which currently holds `### Assumptions`. (Backlog `Existing Issue` and `Proposal`.)
2. The `ai/guidelines/plan-template.md:35` anchor quoting "When reconnaissance found no precedent, a single \"None found\" is acceptable." must resolve to the line carrying that sentence (`ai/guidelines/plan-template.md:39`). (Backlog `Proposal`.)
3. Every `ai/tasks/feature/plan-a-new-feature.md:171` anchor quoting "Before moving on, check the completed plan against this list:" must resolve to `ai/tasks/feature/plan-a-new-feature.md:172`, which currently holds the quoted checklist. (Backlog `Proposal`.)
4. Every `ai/tasks/feature/review-pull-request.md:118` anchor quoting "### Walk the promises" must resolve to `ai/tasks/feature/review-pull-request.md:119`. (Backlog `Proposal`.)
5. Every `ai/tasks/feature/review-pull-request.md:131` anchor quoting "- **Plan fidelity.**" must resolve to `ai/tasks/feature/review-pull-request.md:132`. (Backlog `Proposal`.)
6. Each quoted identifier stays byte-for-byte unchanged; only the numeric line value of an anchor changes. (Backlog `Proposal`: "Keep each quoted identifier unchanged".)
7. Anchors whose targets did not move stay unchanged: `ai/guidelines/plan-template.md:3` and `:15`, `ai/tasks/feature/plan-a-new-feature.md:100`, both anchors in `ai/tasks/planning/improve-plan.md`, all anchors in `ai/tasks/planning/decompose-plan.md`, `ai/tasks/feature/review-pull-request.md:73`, and the two `product/backlog/features.md` anchors. (Backlog `Proposal`: leave the anchors "that did not move as they are".)
8. Each corrected anchor is verified by opening the named line and confirming the quoted fragment is present, as `ai/tasks/planning/improve-plan.md` Step 3 requires. (Backlog `Proposal`.)
9. No rule, section, or edited document changes, and no file other than the promoted plan is touched. (Backlog `Proposal Risk`: "no rule, section, or edited document changes".)

## Design decisions

- The fix edits only the promoted plan. The five source documents are already correct; their insertions merely shifted the lines the plan points at, so changing the plan's numbers restores agreement without touching any source.
- A line value is updated only when the quoted fragment is absent from the anchored line and present at the new target. That keeps the repair evidence-driven rather than a blanket renumbering.
- All occurrences of each stale value are updated, including repeats across the Assumptions, Existing functionality, and Implementation steps sections, because the goal is a plan whose every anchor resolves.
- Quoted fragments are left untouched. They are the identifiers that make an anchor survive future drift; changing them would trade one kind of staleness for another.
- The `ai/tasks/planning/improve-plan.md`, `ai/tasks/planning/decompose-plan.md`, and `product/backlog/features.md` anchors are left as they are: their targets were not shifted by this pull request's insertions, and refreshing them is outside this finding's scope.
- This is a documentation-only correction with no application behavior, so it adds no code, no tests, no spec, and no help text.

## Preserved behavior

None found. The change only corrects line numbers in a completed plan; it changes no application behavior and no rule that a future plan relies on.

## Assumptions

1. The promoted plan is the one this pull request moved into `product/plans/complete/` — `product/plans/complete/preserved-behavior.md:1` ("# Preserved behavior").
2. The three `### Existing functionality` anchors and the "None found" anchor in the plan are stale: `product/plans/complete/preserved-behavior.md:57` ("`ai/guidelines/plan-template.md:33` (\"### Existing functionality\")"), and the heading now sits at `ai/guidelines/plan-template.md:37` ("### Existing functionality").
3. The "None found" sentence now sits at `ai/guidelines/plan-template.md:39` ("When reconnaissance found no precedent, a single \"None found\" is acceptable.").
4. The "Before moving on" checklist now sits at `ai/tasks/feature/plan-a-new-feature.md:172` ("Before moving on, check the completed plan against this list:").
5. The review-task anchors now sit at `ai/tasks/feature/review-pull-request.md:119` ("### Walk the promises") and `ai/tasks/feature/review-pull-request.md:132` ("- **Plan fidelity.**").
6. Anchor verification is a named improvement step: `ai/tasks/planning/improve-plan.md:57` ("**Wrong or stale references.** Paths, symbols, or line anchors that don't match the repo.") and `ai/tasks/planning/improve-plan.md:58` ("Open the file at that line: confirm the identifier is actually there and that the quoted fragment and the claim match what the code does.").
7. No functional spec covers plan-anchor correctness: `product/plans/complete/reconcile-template-section-requirement.md:35` ("No functional spec covers plan-template authoring rules") records the precedent for this class of internal document edit, and no help page describes a command, flag, or key binding touched here.

## Existing functionality

1. The `path:line` plus quoted-identifier anchor convention that makes references survive line drift — `ai/guidelines/plan-template.md:35` ("anchors it with `path:line` plus a quoted identifier or code fragment it rests on").
2. The stale-reference detection rule that drives the verification — `ai/tasks/planning/improve-plan.md:57` ("**Wrong or stale references.** Paths, symbols, or line anchors that don't match the repo.").
3. The corrected plan-template targets, reused unchanged as the numbered values — `ai/guidelines/plan-template.md:37` ("### Existing functionality") and `ai/guidelines/plan-template.md:39` ("a single \"None found\" is acceptable").
4. The corrected authoring- and review-task targets — `ai/tasks/feature/plan-a-new-feature.md:172` ("Before moving on, check the completed plan against this list:"), `ai/tasks/feature/review-pull-request.md:119` ("### Walk the promises"), and `ai/tasks/feature/review-pull-request.md:132` ("- **Plan fidelity.**").

## Implementation steps

First, read `product/plans/complete/preserved-behavior.md` in full and list every `path:line` anchor together with the quoted fragment it carries; open each named line in the named file and mark which fragments are absent from their anchored line. Build command: `$janissary/scripts/run.mjs check-diff` (no file changes yet, so this confirms a clean tree).

Second, in `product/plans/complete/preserved-behavior.md`, replace only the stale numeric line values: the three `ai/guidelines/plan-template.md:33` anchors become `:37` and the single `ai/guidelines/plan-template.md:35` anchor becomes `:39`; the three `ai/tasks/feature/plan-a-new-feature.md:171` anchors become `:172`; the two `ai/tasks/feature/review-pull-request.md:118` anchors become `:119` and the three `ai/tasks/feature/review-pull-request.md:131` anchors become `:132`. Leave every quoted fragment and every other anchor byte-for-byte unchanged, and make no edit to any other file. Build command: `$janissary/scripts/run.mjs check-diff`.

Third, verify each updated anchor by opening the named line in `ai/guidelines/plan-template.md`, `ai/tasks/feature/plan-a-new-feature.md`, and `ai/tasks/feature/review-pull-request.md` and confirming its quoted fragment is present there, then confirm the anchors listed as unchanged still resolve. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change touches a completed plan document only and exposes no user-visible surface.

## Tests

This change edits only a completed plan document and introduces no code and no application behavior, so no tests are added; per the plan template, tests of documentation are not introduced. Correctness is established by the reading-based check under Verification.

## Out of scope

- No rule, section, or edited document changes; the five source documents stay byte-for-byte as the pull request left them.
- No source, test, config, spec, help, or documentation file is changed.
- The `ai/tasks/planning/improve-plan.md`, `ai/tasks/planning/decompose-plan.md`, and `product/backlog/features.md` anchors are not refreshed.
- The description correction recorded in the sibling fix plan `product/plans/complete/correct-preserved-behavior-example-pinning-test.md` is not part of this work, and no pull request description correction is needed here.
- No other entry in `product/backlog/pull-request.md` is edited.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression.

Then do a concrete reading-based check. Re-read `product/plans/complete/preserved-behavior.md` and confirm every anchor resolves: open `ai/guidelines/plan-template.md` and confirm line 37 is `### Existing functionality` and line 39 carries "When reconnaissance found no precedent, a single \"None found\" is acceptable."; open `ai/tasks/feature/plan-a-new-feature.md` and confirm line 172 is "Before moving on, check the completed plan against this list:"; open `ai/tasks/feature/review-pull-request.md` and confirm line 119 is "### Walk the promises" and line 132 is "- **Plan fidelity.**". Confirm each quoted fragment in the plan is word-for-word unchanged, that the anchors named as unmoved still carry their fragments, and that no other file in the working tree changed. A quoted fragment missing from its named line, a changed identifier, or an edit outside the promoted plan means the fix did not land correctly.
