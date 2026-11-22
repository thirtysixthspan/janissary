# Each subplan is a self-contained, buildable change

**Complexity: 1/10** — docs-only edit to five guidance documents: 0 production lines, 0 production files edited, 0 production requirements, 0 test scenarios, 0 new code units (p=1.58).

## Goal

Tighten the planning pipeline so that a plan split into subplans leaves every subplan buildable on its own. The change is to agent guidance only: it rewrites the ordering rule and verification checks that decompose plans, sharpens the improvement and template language that judges them, and makes the green-check gate explicit in the complex-feature build workflow. No application code, protocol message, CLI command, or UI surface changes.

## Requirements

1. "A dependency may mean 'uses the API the earlier subplan delivered,' never 'leaves a compile error until a later subplan lands.'" (feature text)
2. "When a type or exported symbol changes, every production consumer that would break must be included in the same subplan or kept compiling through an additive transition." (feature text)
3. "Add the new field alongside the old one." (feature text)
4. "Migrate consumers in the next subplan." (feature text)
5. "Remove the old field in a third." (feature text)
6. "With each step green on its own." (feature text)
7. "Add a buildability check to Step 6 alongside the existing coverage, order and rating checks." (feature text)
8. "For each subplan, list the files needed for the whole tree to compile." (feature text)
9. "Confirm they are all inside that subplan's scope." (feature text)
10. "With no dangling reference deferred to a later work unit." (feature text)
11. "Require that every implementation step name its build command." (feature text)
12. "Leave the tree green." (feature text)
13. "Treat a step that depends on future work to compile as a defect to fix in the plan rather than a note to record." (feature text)
14. "The subplan's file list must be sufficient for a green `check-diff` at its own commit, not after the whole feature lands." (feature text)
15. "An implementation is not complete until its diff-scoped checks are green." (feature text)
16. "The orchestrator must not commit or publish a red subplan." (feature text)
17. "If a subplan cannot be made green without editing files outside its plan, that is a scope mismatch — preserve the work and report the blocker instead of proceeding." (feature text)
18. "Remove the stacked-chain tolerance from the instructions passed to implementers, including the 'expected cross-subplan failure' language used in this run." (feature text)
19. "The build command every implementation step names, and the single check that proves a subplan green at its own commit, is `$janissary/scripts/run.mjs check-diff`." (user decision)

## Design decisions

- The feature text names four files to change: `ai/tasks/planning/decompose-plan.md`, `ai/tasks/planning/improve-plan.md`, `ai/guidelines/plan-template.md`, and `ai/tasks/feature/build-a-complex-feature.md`. User decision adds a fifth, `product/specs/task-picker.md`, whose "Decomposing a plan" section is the authoritative spec for these tasks; `ai/tasks/feature/build-a-feature.md` stays untouched, since the implementer instructions are the overrides passed from `build-a-complex-feature.md`.
- The feature text establishes that a dependency may mean using an earlier subplan's delivered API, but never leaving a compile error for a later subplan, and that a breaking type or exported-symbol change is either colocated with all its consumers or delivered as a three-step additive transition in which every step is green.
- The feature text establishes that the new Step 6 buildability check sits alongside, not instead of, the existing coverage, order and rating checks.
- The feature text establishes that the gate is made explicit in Steps 4 and 5 of `build-a-complex-feature.md`. No stacked-chain tolerance or "expected cross-subplan failure" wording existed in the implementer instructions to remove — the only such wording was in `product/backlog/features.md`, which stays untouched — so the rule is stated affirmatively: a subplan that cannot be green at its own commit is a scope mismatch to report, not a tolerance to record.
- User decision: the build command every implementation step names, and the single check that proves a subplan green at its own commit, is `$janissary/scripts/run.mjs check-diff`. The pipeline does not name `npm run check` (reserved for humans and CI) or a list of separate lint/typecheck/test commands.
- User decision: the new rule applies only to plans written after this change. Existing plans in `draft/`, `ready/`, and `complete/` are left untouched; reworking them is not part of this version.
- User decision: user and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan. This plan records the work only as a follow-up feature candidate for the prose documentation page, and names no page under either documentation tree.
- User decision: the new Step 6 check is called the "buildability check", matching the feature text and the existing coverage, order and ratings checks.
- Reconnaissance found no functional product spec for a feature matching this change. The only spec in scope is `product/specs/task-picker.md`, which documents the planning tasks themselves; the rest of the change edits agent guidance under `ai/guidelines/` and `ai/tasks/`.
- The `UI design` section is omitted: the change adds or alters no surface a user sees or operates.

## Assumptions

1. `ai/tasks/planning/decompose-plan.md:55` reads "Order the subplans so each can be implemented and verified against the preceding completed work. A subplan may depend on earlier subplans, but never on future work." — this is the Step 3 ordering rule the feature rewrites.
2. `ai/tasks/planning/decompose-plan.md:79` reads "1. Check coverage." with steps 2 and 3 at `:80` and `:81` checking the order and the ratings — these are the existing Step 6 checks the new check joins.
3. `ai/tasks/planning/improve-plan.md:62` reads "- **Unstated dependencies and ordering.**" — this is the Step 3 bullet the feature extends.
4. `ai/guidelines/plan-template.md:39` reads "Prose describing the changes in the order they should land, so each checkpoint typechecks and no contract is left mismatched across the server and client." — this is the Implementation steps wording the feature tightens.
5. `ai/guidelines/plan-template.md:55` reads "$janissary/scripts/run.mjs check-diff" — this is the diff-scoped check command referenced by the feature's "green `check-diff`" expectation.
6. `ai/tasks/feature/build-a-complex-feature.md:56` reads "## Step 4 — Implement one subplan" and `:71` reads "## Step 5 — Commit and push each implementation" — these are the two steps whose gate the feature makes explicit.
7. `product/backlog/features.md:7` contains "expected cross-subplan failure" — the only occurrence grep found across `ai/` and `product/`; no current task or plan file carries that wording verbatim.

## Existing functionality

1. The diff-scoped check command `$janissary/scripts/run.mjs check-diff`, already named as the development check in `ai/guidelines/plan-template.md:55`.
2. The existing Step 6 verification list in `ai/tasks/planning/decompose-plan.md:79`–`:81` (coverage, order, ratings), which the new buildability check joins.
3. The existing "Unstated dependencies and ordering" improvement check in `ai/tasks/planning/improve-plan.md:62`, which the new build-command requirement extends.
4. The existing per-subplan implementation and commit steps in `ai/tasks/feature/build-a-complex-feature.md:56` and `:71`, where the green-check gate is made explicit.
5. The authoritative "Decomposing a plan" section in `product/specs/task-picker.md:48`, whose line `:52` states "A subplan depends only on earlier ones." — the place to record the new self-contained rule.

## Implementation steps

Rewrite Step 3 of `ai/tasks/planning/decompose-plan.md` so its ordering rule makes each subplan a self-contained, buildable change. State that a dependency may only mean using an API an earlier subplan delivered, never leaving a compile error until a later subplan lands, and that a changed type or exported symbol is either colocated with every production consumer that would break or delivered through the additive three-step transition described in the feature text, each step green on its own.

Add the buildability check to Step 6 of the same file, after the existing coverage, order and rating checks. It requires each subplan to list the files needed for the whole tree to compile, confirm those files all lie inside that subplan's scope, and confirm no dangling reference is deferred to a later work unit.

Extend the "Unstated dependencies and ordering" bullet in Step 3 of `ai/tasks/planning/improve-plan.md` so every implementation step names `$janissary/scripts/run.mjs check-diff` as its build and green check and leaves the tree green, and so a step that needs future work to compile is treated as a defect to fix during improvement rather than a note to record.

Tighten the Implementation steps section of `ai/guidelines/plan-template.md` so the checkpoint expectation is concrete: a subplan's file list must be enough for a green `check-diff` at that subplan's own commit, not after the whole feature lands.

Make the gate explicit in Steps 4 and 5 of `ai/tasks/feature/build-a-complex-feature.md`: implementation is not complete until diff-scoped checks are green, the orchestrator must not commit or publish a red subplan, and a subplan that cannot be green without editing files outside its plan is a scope mismatch whose work is preserved while the blocker is reported. State this affirmatively rather than as a removal: no implementer instruction carried stacked-chain tolerance or "expected cross-subplan failure" wording, so none was deleted.

Finish by adding one clause to the "Decomposing a plan" section of `product/specs/task-picker.md`, next to its "A subplan depends only on earlier ones." sentence at `:52`, stating that each subplan is a self-contained, buildable change whose file list suffices for a green `$janissary/scripts/run.mjs check-diff` at its own commit; leave the rest of the section's procedure as it is.

These are guidance documents, so there is no compiled contract spanning files: each edit stands on its own and the order above follows the feature text.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced; the existing `src/**/*.test.ts` and `web/src/**/*.test.tsx` conventions do not apply to guidance and task documents. Conformance is checked by reading the changed documents and by the manual check in Verification.

## Out of scope

No application behavior, protocol, CLI command, or UI is changed, and no source, test, or configuration file is edited. Plans already in `draft/`, `ready/`, or `complete/` are not reworked; the rule applies to plans written after this change. `ai/tasks/feature/build-a-feature.md` is not edited — the implementer instructions are the overrides in `build-a-complex-feature.md`. No page under either documentation tree is written; the prose documentation update is recorded only as a follow-up feature candidate.

## Verification

`$janissary/scripts/run.mjs check-diff`

For a documentation-only change, the check that proves the work is a reading check. Read `ai/tasks/planning/decompose-plan.md` Step 3 and Step 6, `ai/tasks/planning/improve-plan.md` Step 3, `ai/guidelines/plan-template.md` Implementation steps, `ai/tasks/feature/build-a-complex-feature.md` Steps 4 and 5, and the "Decomposing a plan" section of `product/specs/task-picker.md`. Confirm the new ordering rule, buildability check, build-command requirement, concrete checkpoint expectation, and green-check gate are each stated in the file the feature names, with no statement permitting a subplan to stay red until a later subplan lands. A stale "expected cross-subplan failure" or stacked-chain tolerance line in any implementer instruction shows the change was not made correctly.
