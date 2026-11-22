# Reconcile the plan template's section-requirement rule

**Complexity: 1/10** — single-sentence documentation-only edit with 0 production lines/files/scenarios/units and 6 stated requirements (p=2.95).

## Goal

Make `ai/guidelines/plan-template.md` the single, consistent owner of plan shape by qualifying its `## Sections` overview so the requirement to include the `Preserved behavior` section matches the carve-out already stated in that template's own `### Preserved behavior` subsection. An improver who reads either paragraph gets the same answer about whether a plan in `draft/`, `ready/`, `complete/`, or `deferred/` needs that section.

## Requirements

1. The overview sentence "Every section is required in every plan" must no longer stand without qualification. (Recorded issue text.)
2. The overview must state that the `Preserved behavior` section "is required in plans authored after its introduction". (Recorded issue text.)
3. The overview must state that "existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled" with that section. (Recorded issue text.)
4. The overview must "match[] the carve-out in the `### Preserved behavior` subsection" so that "both give the same answer for a plan in each status directory". (Recorded proposal text.)
5. "Keep the ordered section list and subsection unchanged" — byte-for-byte. (Recorded proposal text.)
6. `ai/tasks/feature/plan-a-new-feature.md` and `ai/tasks/planning/improve-plan.md` must "still defer to the template rather than restating a conflicting rule". (Recorded verification text.)

## Design decisions

- The contradiction is between two paragraphs of one file, so the fix is a single-sentence edit to the `## Sections` overview; the `### Preserved behavior` subsection stays the source of the carve-out wording and is not touched.
- The qualification reuses the subsection's own phrasing — "required in every plan authored after this section was introduced; existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited" — so the two paragraphs cannot disagree for any status directory.
- The ordered section list keeps `Preserved behavior` in its current position; this changes only when the section is required, not where it appears.
- No consuming task is edited. Both `plan-a-new-feature.md` and `improve-plan.md` already name the template as the single owner of plan shape, so adding a local restatement in either would create a second source of truth and reintroduce the drift this fix removes.
- This is an internal agent-guidance change with no application behavior and no user-visible surface, so it introduces no code, no tests, no spec, and no help text.

## Preserved behavior

None found

## Assumptions

1. The two contradicting statements are both in `ai/guidelines/plan-template.md`: the overview at `ai/guidelines/plan-template.md:15` ("Every section is required in every plan") and the subsection at `ai/guidelines/plan-template.md:31` ("It is required in every plan authored after this section was introduced; existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited.").
2. The template is the single owner of plan structure — `ai/guidelines/plan-template.md:3` ("This is the single owner of the plan's structure.").
3. Both consuming tasks already defer to the template: `ai/tasks/feature/plan-a-new-feature.md:175` ("The plan has every section `ai/guidelines/plan-template.md` requires, in the template's order") and `ai/tasks/planning/improve-plan.md:49` ("it is the single owner of the plan's section list").
4. No functional spec covers plan-template authoring rules: `product/specs/agent-guidance.md:3` ("### Canonical instructions") covers only `AGENTS.md` and `CLAUDE.md`, and `product/plans/complete/preserved-behavior.md:91` ("No source, test, config, or spec file is changed") records the precedent that changing this template leaves specs untouched.
5. No help page describes a command, flag, or key binding touched by this change — it edits an internal agent-guidance document only.

## Existing functionality

1. The `## Sections` overview sentence in `ai/guidelines/plan-template.md:15` ("Every section is required in every plan"), edited in place.
2. The carve-out in `ai/guidelines/plan-template.md:31` ("It is required in every plan authored after this section was introduced; existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited."), reused verbatim as the wording of the qualification.
3. The template's status-owner rule in `ai/guidelines/plan-template.md:3` ("This is the single owner of the plan's structure."), which makes a template-only fix sufficient.
4. The task-level deferrals in `ai/tasks/feature/plan-a-new-feature.md:175` ("The plan has every section `ai/guidelines/plan-template.md` requires") and `ai/tasks/planning/improve-plan.md:49` ("it is the single owner of the plan's section list"), which need no edit.

## Implementation steps

First, open `ai/guidelines/plan-template.md` and replace only the sentence "Every section is required in every plan." in the `## Sections` overview with one qualified sentence that keeps the general rule and adds the Preserved behavior carve-out in the subsection's own words: the `Preserved behavior` section is required only in plans authored after its introduction, and existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled or edited. Leave the rest of that line, the ordered section list, and the entire `### Preserved behavior` subsection unchanged; make no other edit in the file. This changes an internal agent-guidance document only — no code is added and no application behavior changes. Build command: `$janissary/scripts/run.mjs check-diff`.

Second, verify that no consumer restates a conflicting section rule: read `ai/tasks/feature/plan-a-new-feature.md` around line 175 and `ai/tasks/planning/improve-plan.md` around line 49, confirm both still defer to the template, and edit neither. Build command: `$janissary/scripts/run.mjs check-diff`.

## Tests

This change edits only an internal agent-guidance document and introduces no code and no application behavior, so no application tests are added and no test file is created or changed; tests of documentation are not introduced. Requirement 6 is verified by reading, as recorded under Verification.

## Out of scope

The ordered section list, the `### Preserved behavior` subsection, and every other part of `ai/guidelines/plan-template.md` stay byte-for-byte unchanged. No consuming task is edited, and no source, test, config, spec, or help file is changed. No existing plan in `ready/`, `complete/`, or `deferred/` is backfilled or edited. The separate backlog item in this pull request about refreshing stale `path:line` anchors in `product/plans/complete/preserved-behavior.md` is not part of this fix. No PR-description correction is needed.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression from the changed documentation file.

Then do a concrete reading-based check. Read `ai/guidelines/plan-template.md` and confirm the `## Sections` overview now states both that every section is required in every plan and that the `Preserved behavior` section is required only in plans authored after its introduction, with existing plans in `ready/`, `complete/`, or `deferred/` not backfilled or edited. Read the `### Preserved behavior` subsection and confirm it gives the same answer for a plan in each of `draft/`, `ready/`, `complete/`, and `deferred/`. Confirm the ordered section list still reads `Goal`, `Requirements`, `Design decisions`, `Preserved behavior`, `Assumptions`, `Existing functionality`, `Implementation steps`, `UI design`, `Tests`, `Out of scope`, `Verification`, and that the subsection itself is byte-for-byte unchanged. Read `ai/tasks/feature/plan-a-new-feature.md` and `ai/tasks/planning/improve-plan.md` and confirm each still points to the template as the single owner of plan shape rather than restating a conflicting rule. An unqualified "Every section is required in every plan." sentence, a changed list or subsection, or a newly added local rule in a consuming task means the change did not land correctly.
