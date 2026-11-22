# Preserved behavior

**Complexity: 2/10** — documentation-only change with 25 stated requirements and no production-code lines, files, test scenarios or new units to count (p=3.875).

## Goal

Make preservation claims in plans concrete and verifiable instead of vague assurances. Add a required `## Preserved behavior` section to the plan template whose every entry names a behavior to be preserved, pairs the positive claim with a negative assertion, and names the existing test that must keep passing; then thread that same requirement through the plan-authoring, improvement, decomposition, and review stages so a preservation claim cannot be written, improved, split, or reviewed without its negative assertion and pinning test.

## Requirements

1. "add a required `## Preserved behavior` section" to `ai/guidelines/plan-template.md`.
2. In that section, "each entry names the behavior to be preserved".
3. In that section, each entry "states the negative assertion alongside the positive one".
4. In that section, each entry "names the existing test that must keep passing".
5. State that "keep X working," "preserve Y," "unchanged," and "reuse Z" "are not acceptable on their own and must be expanded into such entries".
6. In `ai/tasks/feature/plan-a-new-feature.md`, "add a 'Preserved behavior' category to the Phase 1 product questions when the feature touches an existing surface".
7. That category asks "which behaviors must continue".
8. That category asks "what specifically must not happen".
9. In `ai/tasks/feature/plan-a-new-feature.md`, "add a box to the Step 2h final checklist requiring every preservation claim to have a negative assertion and a named test".
10. In `ai/tasks/planning/improve-plan.md`, "extend Step 3's checklist with a check that every preservation phrase in the plan resolves to a named behavior, a negative assertion and a test".
11. In `ai/tasks/planning/improve-plan.md`, "treat a vague 'keep behavior' as a defect to fix during improvement rather than a note to carry forward".
12. In `ai/tasks/planning/decompose-plan.md`, "treat each preserved-behavior entry as a tracked requirement in the Step 2 inventory and the Step 6 coverage map".
13. In `ai/tasks/planning/decompose-plan.md`, "require that a behavior and the test that pins it land in the same subplan".
14. In `ai/tasks/feature/review-pull-request.md`, "make the plan-fidelity pass walk the preserved-behavior list explicitly".
15. In that plan-fidelity pass, "check the negative assertions against the diff".
16. In that plan-fidelity pass, "record a finding when a test pins behavior that the plan's own requirements forbid".
17. A preserved-behavior entry stands alone in the `## Preserved behavior` section and is not also written as an item in `Requirements`; decomposition still tracks it as a requirement. (User answer to primary-flow question.)
18. A plan with no behavior to preserve writes exactly `None found` in the `## Preserved behavior` section, mirroring the `Existing functionality` fallback. (User answer to empty-state question.)
19. When a behavior must continue but no existing test pins it, no preserved-behavior entry is created; the need to add that test is recorded as a normal requirement instead. (User answer to missing-test question.)
20. When more than one existing test pins a behavior, an entry names one representative test rather than listing all of them. (User answer to multiple-tests question.)
21. Only plans authored after this change carry the `## Preserved behavior` section; no existing plan in `ready/`, `complete/`, or `deferred/` is backfilled or edited. (User answer to scope decision.)
22. Record a follow-up feature candidate for the prose documentation page only; no in-app help page or key-binding row is named in the plan, and no documentation page is written into this feature. User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan. (User answer to documentation-boundary question.)
23. The Phase 1 "Preserved behavior" category asks exactly: "Which behaviors must continue, and what specifically must not happen?" (User answer to wording question.)
24. In the plan template's section order, the `## Preserved behavior` section appears immediately after `## Design decisions`. (User answer to placement question.)
25. No build task is changed: `ai/tasks/feature/build-a-feature.md` does not gain the pinning-test run named in the backlog text, and neither does any other build task. (User answer to dropped build-a-feature question.)

## Design decisions

- The `## Preserved behavior` section is required in the plan template, not optional — "add a required `## Preserved behavior` section".
- The unit of the section is an entry with three parts: the behavior, its negative assertion, and the existing test that pins it — "each entry names the behavior to be preserved, states the negative assertion alongside the positive one, and names the existing test that must keep passing".
- Vague preservation phrases are explicitly insufficient on their own — "'keep X working,' 'preserve Y,' 'unchanged,' and 'reuse Z' are not acceptable on their own and must be expanded into such entries".
- A preserved-behavior entry stands alone in `## Preserved behavior` and is not duplicated as a numbered item in `Requirements`; decomposition still tracks each entry as a requirement, so the section is the single source of truth for the claim. (User answer to primary-flow question.)
- The requirement is enforced at the four stages this feature changes: authoring (`plan-a-new-feature.md`), improvement (`improve-plan.md`), decomposition (`decompose-plan.md`), and review (`review-pull-request.md`). The build stage is not part of this change. (User answer to dropped build-a-feature question.)
- Improvement treats a vague preservation phrase as a defect to fix, not a note to carry forward — "treat a vague 'keep behavior' as a defect to fix during improvement rather than a note to carry forward".
- A plan with no behavior to preserve writes exactly `None found` in the required section, reusing the template's existing `None found` convention rather than omitting the section or inventing a second sentinel. (User answer to empty-state question.)
- A behavior with no existing test does not become a preserved-behavior entry; the need for that test becomes a normal requirement, because the section's unit is a behavior pinned by an existing test. (User answer to missing-test question.)
- When several tests pin one behavior, the entry names a single representative test, keeping the entry to its behavior/negative-assertion/test shape. (User answer to multiple-tests question.)
- The change applies only to plans authored after it lands; existing plans are not backfilled, so the new required section is not retroactively imposed on plans whose authors never answered its questions. (User answer to scope question.)
- Documentation work is recorded as a follow-up feature candidate for the prose documentation page only; "User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan." No page under either documentation tree appears in this plan. (User answer to documentation-boundary question.)
- The Phase 1 "Preserved behavior" category uses the single question "Which behaviors must continue, and what specifically must not happen?", fixed verbatim from the feature text rather than split into two questions. (User answer to wording question.)
- `## Preserved behavior` sits immediately after `## Design decisions` in the template's section order, so preservation constraints follow the decisions that shape the implementation. (User answer to placement question.)
- In decomposition, a behavior and the test that pins it are an indivisible pair that "land in the same subplan".
- The plan template's `## Sections` overview carries the same carve-out as the `### Preserved behavior` subsection: every section is required in every plan, while the Preserved behavior section is required only in plans authored after its introduction and existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited. The ordered section list and the subsection itself stay unchanged, and both consuming tasks keep deferring to the template rather than restating a competing rule.
- Every `path:line` anchor in this plan resolves to the line carrying its quoted fragment. The line values that drifted when this change inserted lines into the source documents were corrected in the template, authoring-task, and review-task anchors; every quoted fragment was kept verbatim and anchors whose targets did not move were left as they are.
- The remaining anchors agree with the text they point at: the section-rule anchor quotes the qualified sentence "Every section is required in every plan;", and the claim that every edit the feature names is a document under `ai/` is a self-contained statement pointing at this plan's own `## Goal` and `## Requirements` rather than at backlog lines whose text has since moved.
- The worked preservation example in the pull request description cites the existing `src/tab/hidden-lifecycle.integration.test.ts` test "cycles over a hidden tab without revealing it and keeps full-array numbering" and a negative assertion that test actually pins, so the rule's own showcase meets the three-part entry shape.
- Description scope claims stay checkable against the branch's changed-file list: the "How to verify" step states only the durable guarantee that no source, test, or config file is modified and names the specs reconciled with the rule, with no change-set file count, and the "What" paragraph describes the rule change and the reconciliation of the specs that describe the planning and review tasks.

## Assumptions

1. The plan template is the single owner of plan structure, and every section is required in every plan — `ai/guidelines/plan-template.md:3` ("This is the single owner of the plan's structure.") and `ai/guidelines/plan-template.md:15` ("Every section is required in every plan;").
2. The template already defines a section whose "None found" fallback is the model for a section that may have no entries — `ai/guidelines/plan-template.md:37` ("### Existing functionality") and `ai/guidelines/plan-template.md:39` ("When reconnaissance found no precedent, a single \"None found\" is acceptable.").
3. The plan-authoring task has a Phase 1 product-question stage and a Step 2h final checklist to extend — `ai/tasks/feature/plan-a-new-feature.md:100` ("### 2d. Phase 1 — resolve product decisions") and `ai/tasks/feature/plan-a-new-feature.md:172` ("Before moving on, check the completed plan against this list:").
4. The improvement task has a Step 3 that lists ways an implementer could go wrong — `ai/tasks/planning/improve-plan.md:53` ("## Step 3 — Find the ways an implementer could go wrong").
5. The decomposition task has a Step 2 that inventories every requirement and edge case and a Step 6 coverage map — `ai/tasks/planning/decompose-plan.md:45` ("## Step 2 — Read the plan and the code it touches") and `ai/tasks/planning/decompose-plan.md:77` ("## Step 6 — Verify and move the source plan").
6. The review task has a plan-fidelity pass that checks whether the diff delivers each plan promise — `ai/tasks/feature/review-pull-request.md:132` ("- **Plan fidelity.**").
7. Every edit the feature text names is a document under `ai/` — this plan's `## Goal` and `## Requirements` name edits only to `ai/guidelines/plan-template.md`, `ai/tasks/feature/plan-a-new-feature.md`, `ai/tasks/planning/improve-plan.md`, `ai/tasks/planning/decompose-plan.md`, and `ai/tasks/feature/review-pull-request.md`; no file under `product/specs/` is named.

## Existing functionality

1. The plan template's ordered, required-section structure that a new section slots into — `ai/guidelines/plan-template.md:15` ("The sections appear in this order").
2. The `Existing functionality` section's numbered-list entry format with its "None found" fallback, a precedent for how a required section records entries — `ai/guidelines/plan-template.md:37` ("### Existing functionality").
3. The Phase 1 product-question categories and the Step 2h final checklist in the plan-authoring task, both extended rather than replaced — `ai/tasks/feature/plan-a-new-feature.md:100` and `ai/tasks/feature/plan-a-new-feature.md:172`.
4. The Step 3 implementer-failure checklist in the improvement task — `ai/tasks/planning/improve-plan.md:53` ("## Step 3 — Find the ways an implementer could go wrong").
5. The Step 2 requirement inventory and Step 6 coverage map in the decomposition task — `ai/tasks/planning/decompose-plan.md:49` ("List every requirement and edge case the source plan states.") and `ai/tasks/planning/decompose-plan.md:79` ("Check coverage.").
6. The plan-fidelity pass in the review task where the preserved-behavior walk is added — `ai/tasks/feature/review-pull-request.md:119` ("### Walk the promises") and `ai/tasks/feature/review-pull-request.md:132` ("- **Plan fidelity.**").

## Implementation steps

First, add the `## Preserved behavior` section to `ai/guidelines/plan-template.md`: extend the ordered section list at `ai/guidelines/plan-template.md:15` with `Preserved behavior` immediately after `Design decisions`, and add a `### Preserved behavior` subsection under `## Sections` in the same style as the existing `### Existing functionality` subsection (`ai/guidelines/plan-template.md:37`). That subsection defines an entry as naming the preserved behavior, stating the negative assertion beside the positive one, and naming the existing test that must keep passing, and records `None found` as the empty-state content. Add the explicit rule that "keep X working," "preserve Y," "unchanged," and "reuse Z" are not acceptable on their own and must be expanded into such entries. Qualify the `## Sections` overview in the same file so the general "Every section is required in every plan;" rule also states that the Preserved behavior section is required only in plans authored after its introduction and that existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited, matching the subsection's carve-out; leave the ordered section list and the subsection otherwise unchanged. Keep the template the single owner of plan shape. Build command: `$janissary/scripts/run.mjs check-diff` (documentation-only change; no application behavior to exercise).

Second, in `ai/tasks/feature/plan-a-new-feature.md`, add a "Preserved behavior" category to the Phase 1 product questions at `ai/tasks/feature/plan-a-new-feature.md:100` for features that touch an existing surface, asking exactly "Which behaviors must continue, and what specifically must not happen?"; and add a box to the second Step 2h checklist, "Before moving on, check the completed plan against this list:" at `ai/tasks/feature/plan-a-new-feature.md:172`, requiring every preservation claim to have a negative assertion and a named test. Build command: `$janissary/scripts/run.mjs check-diff`.

Third, in `ai/tasks/planning/improve-plan.md`, extend Step 3's list of ways an implementer could go wrong with the check that every preservation phrase resolves to a named behavior, a negative assertion, and a test, and direct that a vague "keep behavior" be fixed during improvement rather than carried forward as a note. Build command: `$janissary/scripts/run.mjs check-diff`.

Fourth, in `ai/tasks/planning/decompose-plan.md`, treat each preserved-behavior entry as a tracked requirement in the Step 2 inventory and the Step 6 coverage map, and add the rule that a behavior and the test that pins it land in the same subplan. Build command: `$janissary/scripts/run.mjs check-diff`.

Fifth, in `ai/tasks/feature/review-pull-request.md`, include a plan's preserved-behavior entries in the numbered promise list built in Step 2 (`ai/tasks/feature/review-pull-request.md:73`), then make the plan-fidelity pass — the "Walk the promises" pass at `ai/tasks/feature/review-pull-request.md:119` under the "Plan fidelity" heading at `ai/tasks/feature/review-pull-request.md:132` — walk that list explicitly: check the negative assertions against the diff, and record a finding when a test pins behavior the plan's own requirements forbid. Build command: `$janissary/scripts/run.mjs check-diff`.

## Tests

This change edits only documentation under `ai/` and introduces no code and no application behavior, so no application tests are added; per the plan template, tests of documentation are not introduced. The pinning tests a preserved-behavior entry names are existing tests in the application plan that carries that entry — this change only adds the rules requiring those tests to be named, paired with a negative assertion, and reviewed. The description's worked example demonstrates the shape against the existing `src/tab/hidden-lifecycle.integration.test.ts` test "cycles over a hidden tab without revealing it and keeps full-array numbering", whose `manager.moveTab(1)` call and `[1, 2, 3]` numbering and still-hidden-tab assertions pin the switching behavior; no new test is written to pin the example.

## Out of scope

No source, test, or config file is changed, and no application behavior or UI changes; the specs that describe the planning and review tasks are corrected to match the rule. Only the documents named above carry the rule change, and the only new plan section is `## Preserved behavior`. No build task is changed, so no pinning-test run is added to the implementer's workflow. No existing plan is backfilled with the new section. The sibling `## Lifecycle matrix` documentation change listed separately in the features backlog is not part of this work. No new plan content is generated by this change: it sets rules for plans that future features will author. No change-set statistic, commit count, or file count appears in the pull request description; its scope statements are durable guarantees checkable against the branch's changed-file list.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression from the changed documentation files.

Then do a concrete reading-based check. Read `ai/guidelines/plan-template.md` and confirm a required `## Preserved behavior` section appears immediately after `## Design decisions` in the section order, that its entry format names the behavior, the negative assertion beside the positive one, and the existing test that must keep passing, that `None found` is the empty-state content, and that "keep X working," "preserve Y," "unchanged," and "reuse Z" are stated to be insufficient on their own. Read `ai/tasks/feature/plan-a-new-feature.md` and confirm the Phase 1 "Preserved behavior" question category asks "Which behaviors must continue, and what specifically must not happen?" and that the Step 2h checklist box requires a negative assertion and a named test. Read `ai/tasks/planning/improve-plan.md` and confirm Step 3 resolves every preservation phrase to a named behavior, a negative assertion, and a test and fixes vague "keep behavior" rather than carrying it forward. Read `ai/tasks/planning/decompose-plan.md` and confirm the Step 2 inventory and Step 6 coverage map track preserved-behavior entries and keep a behavior with its pinning test in one subplan. Read `ai/tasks/feature/review-pull-request.md` and confirm the plan-fidelity pass walks the preserved-behavior list, checks negative assertions against the diff, and records a finding when a test pins behavior the plan's requirements forbid. Confirm `ai/tasks/feature/build-a-feature.md` is unchanged. A missing rule in any of the changed files, an unexpected change to the build task, or a vague preservation phrase left acceptable on its own means the change did not land correctly.

Read the `## Sections` overview in `ai/guidelines/plan-template.md` and confirm the general "Every section is required in every plan;" rule is qualified with the Preserved behavior carve-out — required only in plans authored after its introduction, existing plans in `ready/`, `complete/`, or `deferred/` not backfilled or edited — and that this matches the `### Preserved behavior` subsection while the ordered section list is unchanged.

Confirm every `path:line` anchor in this plan still lands on the line carrying its quoted fragment, including the corrected template, authoring-task, and review-task anchors; no anchor quotes a sentence the source has since reworded (the section-rule line reads "Every section is required in every plan;"), and no removed backlog line is cited in place of this plan's own `## Goal` and `## Requirements`.

Read the pull request description and confirm its "What" paragraph describes the rule change and the reconciliation of the specs that describe the planning and review tasks, its "Behavior examples" after-entry cites the existing `src/tab/hidden-lifecycle.integration.test.ts` "cycles over a hidden tab without revealing it and keeps full-array numbering" test with a negative assertion that test pins, and its "How to verify" step 9 states only the durable guarantee that no source, test, or config file is modified and names the specs reconciled with the rule, with no change-set file count. A qualifier missing from either template paragraph, an anchor whose quoted fragment is absent from its named line, a showcase citing a test that does not exist, or a file-count claim left in the description means the change did not land correctly.
