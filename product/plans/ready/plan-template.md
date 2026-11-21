# Extract a plan template and make the planning tasks respect it

**Complexity: 1/10** — docs-only change: 0 production lines, 0 production files edited, 0 new code units (p=1.58).

This feature creates a canonical plan template at `ai/guidelines/plan-template.md` and makes the planning tasks use it. Today the required shape of a plan is spelled out independently in several places — `plan-a-new-feature.md` lists nine sections, the improvement tasks describe a partly different house shape and let the rating task add a complexity line, and `decompose-plan.md` lists what a subplan contains. The template will state the required format, sections, and content of plans in one place, with each section describing the expected format and content for that section, so an implementer gets one answer instead of reconciling several lists.

## Design decisions

- The feature text establishes that a new template lives at `ai/guidelines/plan-template.md` (the `/ai/guidelines/plan-template.md` in the text is the project-root-relative path) and that it lays out the required format, sections, and content of plans.
- The feature text establishes that `plan-a-new-feature.md` is revised to refer to the requirements laid out in the template, `decompose-plan.md` is updated to respect the template when decomposing plans, and both `improve-plan.md` and `improve-plan-with-minimalism.md` are updated to respect the template when changing plans.
- The feature text establishes that each section of the template must describe the expected format and content for that section.
- The feature changes agent guidance and task prompts only. It adds no application code, protocol message, CLI command, or UI surface.
- Scope is the new template, the four named tasks, and `product/specs/task-picker.md`, which documents those tasks: its planning sections are updated so the authoritative spec still describes what the tasks do. The two rating tasks (`ai/tasks/planning/rate-plan-complexity.md`, `ai/tasks/planning/rate-plan-complexity-quantitative.md`) and the other tasks that write or carry plans (`ai/tasks/feature/auto-build-a-feature.md`, `ai/tasks/feature/build-a-complex-feature.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/feature/work-pull-request-issue.md`) keep their current wording; they are not part of this change.
- The template is the single owner of the plan's section list and of each section's expected format and content. The four tasks drop their inline section lists and state that the plans they write, decompose, or change must follow `ai/guidelines/plan-template.md`. Each task keeps only its own procedure: `plan-a-new-feature.md` keeps its question phases and promotion, `decompose-plan.md` keeps decomposition and coverage checking, the two improvement tasks keep their improvement ladders and rating call.
- Phase-specific exceptions to the common shape are documented in the template and may stay stated in the tasks that own them. The concrete exception is the complexity line: a draft produced by `plan-a-new-feature.md` omits it, while a finished plan carries it because the rating step adds it. The template names this as an exception rather than leaving the two statements to look contradictory.
- The section names are unified across the tasks using the vocabulary `improve-plan.md` already uses, with two new sections added. The canonical order under the title and complexity line is: `Goal`, `Design decisions`, `Assumptions`, `Requirements`, `What already exists (reuse, don't rebuild)`, `Implementation steps`, `UI design` (present only when the feature has a UI), `Tests`, `Out of scope`, `Verification`. `Goal` replaces the untitled summary paragraph, and `Implementation steps` replaces `Proposed changes`, so neither old name survives in the template or in the four revised tasks.
- `Assumptions` records facts taken as true — established by code, specs, or user answers — that an implementer should not re-decide. `Requirements` lists the behaviors and edge cases the implementation must satisfy, each traceable to the feature text or a user answer. They sit after `Design decisions`, so the decisions lead and their premises and acceptance criteria follow.
- The `UI design` section is conditional. The template states the condition using the definition already in `plan-a-new-feature.md` Step 2e: a feature has a UI when it adds or changes something the user sees or operates in the web UI, while a change only to a command's behavior or transcript text does not. Sections other than `UI design` are required in every plan.
- `AGENTS.md` is unchanged. It already instructs agents to read every file under `ai/guidelines/` before starting work, so a new guideline there is discovered without an extra mention; `product/specs/agent-guidance.md` is unchanged for the same reason.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The draft plan's nine required sections, in order, and the rule that the draft carries no complexity line | `ai/tasks/feature/plan-a-new-feature.md`, Step 2c and the Step 2h checklist |
| The house-shape example a ready plan follows — complexity line under the title, then title, summary, Design decisions, "What already exists (reuse, don't rebuild)", Proposed changes, UI design (when present), Tests, Out of scope, Verification | `product/plans/ready/sql-path.md` |
| The improvement-time section expectations and the "anchor references as `path:line` plus identifier" rule | `ai/tasks/planning/improve-plan.md`, Steps 2–4 |
| The minimalism pass's parallel section expectations | `ai/tasks/planning/improve-plan-with-minimalism.md`, Steps 2–4 |
| The subplan contents a decomposition must preserve | `ai/tasks/planning/decompose-plan.md`, Step 3 and the Step 6 coverage check |
| Ownership of the `**Complexity: N/10** — <rationale>` line | `ai/tasks/planning/rate-plan-complexity.md` Step 4 and `ai/tasks/planning/rate-plan-complexity-quantitative.md` Step 5 |
| The functional spec that documents these planning tasks | `product/specs/task-picker.md`, "Rating a plan's complexity", "Rating a plan's complexity by formula", "Decomposing a plan", and the `feature/plan-a-new-feature.md` paragraph |
| The guidelines directory where binding agent guidance lives | `ai/guidelines/` (e.g. `code-guidelines.md`, `architecture-principles.md`, `react-code-organization.md`) |
| The standing instruction that makes a new guideline discoverable without touching AGENTS.md | `AGENTS.md`, "Before starting work, read every file in [`ai/guidelines/`](ai/guidelines/)" |

## Proposed changes

Create `ai/guidelines/plan-template.md` as the single statement of what a plan must contain: the required sections in the canonical order, the expected format and content of each section, and which sections are conditional. Use the `improve-plan.md` vocabulary unified across the tasks — `Goal`, `Design decisions`, `Assumptions`, `Requirements`, `What already exists (reuse, don't rebuild)`, `Implementation steps`, `UI design`, `Tests`, `Out of scope`, `Verification` — and for each one state its heading, whether it is required or conditional, and what content it must carry, including what belongs in `Assumptions` and `Requirements`. "Expected format" means the shape and placement a reader can check: for example, `Verification` ends with the diff-scoped check command plus a concrete manual end-to-end check, and `What already exists (reuse, don't rebuild)` is a table. The template states that a finished plan carries the `**Complexity: N/10** — <rationale>` line directly under the title but that the rating step adds it, matching the present division of labour in which the rating tasks add it and the drafting task does not.

Revise `ai/tasks/feature/plan-a-new-feature.md` so Step 2c and the Step 2h checks point at the template instead of restating a section list: remove the nine-section enumeration and its per-section instructions, and require the draft to follow `ai/guidelines/plan-template.md`. Correct the stale house-style example alongside it: Step 2c points at `./product/plans/ready/monitor-page-tab-content-feed.md`, but that plan now lives under `product/plans/complete/`, and `sql-path.md` is the only plan under `ready/`.

Revise `ai/tasks/planning/decompose-plan.md`, `ai/tasks/planning/improve-plan.md`, and `ai/tasks/planning/improve-plan-with-minimalism.md` so each drops its own plan-shape description and instead requires its plans to follow the template. Keep each task's procedure — decomposition and coverage checking, the improvement ladder, the rating call, promotion — but not a second copy of the section list. Update `product/specs/task-picker.md` where it currently restates those shape rules so it describes the template as the source of plan shape.

The exact call sites to catch, found by grepping the four tasks and the spec for section names, are these:

- `ai/tasks/feature/plan-a-new-feature.md`: Step 2c items 1–9 enumerate the sections; Step 2e names the "UI design section" and says to leave it out when the feature has no UI; the Step 2h checklist restates the nine sections. All three need to defer to the template; Step 2e's rule about when the UI section exists moves into the template's description of that section.
- `ai/tasks/planning/decompose-plan.md`: Step 3's "Each subplan states its goal, decisions and dependencies, existing code to reuse, proposed changes, tests, verification, and out-of-scope boundaries" is a second subplan shape; replace it with a requirement that subplans follow the template. The Step 6 coverage check stays.
- `ai/tasks/planning/improve-plan.md`: Step 2 item 4 gives the "Goal, Design decisions, …" house shape; replace that with the template. Step 5's complexity-line rule is the documented exception and stays in place.
- `ai/tasks/planning/improve-plan-with-minimalism.md`: Step 2 item 4 points at the ready plans' "What already exists" tables as the house style; replace that with the template. Its Step 5 also keeps the complexity-line rule.
- `product/specs/task-picker.md`: the "Planning a new feature" paragraph says the answers fill "a UI design section of the plan" and that the plan has no section for unresolved questions; the "Decomposing a plan" paragraph lists what a subplan states. Both are plan-shape claims the template now owns, so rewrite them to name the template; the rest of each paragraph describes task procedure and stays.

Land the edits in this order: create the template first so the four tasks and the spec can point at a file that exists, then revise the four tasks, then the spec. This repo is the Janissary installation itself, so `./ai/tasks/` is the canonical shipped task tree; there is no second installed copy to update. No source-file constraint applies — the 200-line `max-lines` rule and the `.js` import-extension rule govern `src/` and `web/src/`, not guidance documents.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced; the existing `src/**/*.test.ts` and `web/src/**/*.test.tsx` conventions do not apply to guidance and task documents. Conformance is checked by reading the changed tasks and template and by the manual checks in Verification.

## Out of scope

- Changes to `rate-plan-complexity.md`, `rate-plan-complexity-quantitative.md`, `auto-build-a-feature.md`, `build-a-complex-feature.md`, `remove-an-existing-feature.md`, and `work-pull-request-issue.md`. Their current wording about plan shape stays as it is.
- Changes to any source, test, config, help page, or product spec other than `product/specs/task-picker.md`. `AGENTS.md` and `product/specs/agent-guidance.md` stay as they are.
- Migration of plans already written under the old, duplicated instructions. Every existing plan in `draft/`, `ready/`, `complete/`, and `deferred/` stays byte-for-byte as it is; the template governs only plans written after this change. No compatibility note mapping legacy headings is added to the template either.

## Verification

- `$janissary/scripts/run.mjs check-diff`. This change touches only guidance and task documents, so a clean run confirms no lint, typecheck, or test regression; it does not by itself prove the documents agree.
- Manual: read `ai/guidelines/plan-template.md` alongside each of the four revised tasks and the spec, and confirm each section of the template states its expected format and content, every call site listed under Proposed changes now defers to the template, and no task still carries a competing section list.
- Manual: in a scratch plan file under `./temp/`, draft a short plan by following the revised `plan-a-new-feature.md`, then run both improvement passes against that scratch file and confirm the result matches the template without either pass reintroducing a different shape or a second section list. Leave no scratch plan in `./product/plans/`.
- Manual: confirm `product/specs/task-picker.md` still describes the four tasks accurately after they are revised, and `git status --short` shows only the template, the four tasks, and the spec as changed.
