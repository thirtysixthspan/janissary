# Centralize plan complexity rating in one task

**Complexity: 2/10** — one new markdown task takes over the rating step that two planning tasks duplicate verbatim, the two tasks delegate to it, and one playbook test pins the delegation. No runtime surface and no change to the 1–10 scale or its calibration.

## Goal

`ai/tasks/planning/improve-plan.md` (Step 5) and `ai/tasks/planning/improve-plan-with-minimalism.md` (Step 5) each carry an identical copy of the 1–10 calibration, the `**Complexity: N/10** — <rationale>` line format, and the update-an-existing-line rule. Move that rating procedure into `ai/tasks/rate-plan-complexity.md`, a task that can be run on its own against any plan or called by another task. The scoring system itself — the five bands, their wording, and the example plans — moves verbatim and stays exactly as it is.

## Design decisions

- **Location.** `ai/tasks/rate-plan-complexity.md`, at the root of `ai/tasks/` beside `fix-a-bug.md` and `work-an-issue.md`, because it is a standalone task and belongs to no workflow group. The task picker lists it with no further wiring.
- **Scale untouched.** The five bands and their example plans (`cli-help-version`, `prompt-click-prefill`, `unread-badge`, `tab-name-alias`, `editor-tab`) are copied word for word. The calibration lives only in the new task after this change.
- **Standalone steps.** Step 0 prepares the workspace by executing `ai/tasks/workspace/prepare-workspace.md` in full, exactly as the improvement tasks do, and is skipped when another task calls this one. Step 1 picks the plan: a plan file named in the invocation (any folder under `./product/plans/`) wins; otherwise the single plan in `./product/plans/draft/`; more than one or none reports and stops. Step 2 reads the whole plan and the code areas it names, because the bands turn on what the plan touches (new protocol, persistence or UI surface, server and web, call sites, state machine or concurrency reasoning, file count). Step 3 applies the calibration. Step 4 records or updates the line directly under the plan's `#` title. Step 5 reports.
- **Caller contract.** A calling task opens the rating task and executes every step except Step 0 and Step 1, because the caller has already prepared the workspace and picked the plan. The rating task edits only the plan's complexity line.
- **Caller-specific adjustment stays with the caller.** The minimalism pass keeps its note that trimming should usually only lower the number, never raise it, as a sentence beside its delegation, because it is a property of that pass and not of the scale.
- **Report.** The standalone report is `Plan / Complexity / Basis`, where Basis names the facts from the plan that drove the number. Callers keep their own report shapes, which already include the `Complexity: N/10 — <rationale>` line.
- **Forbidden in the new task.** Adding code to the plan, editing any file other than the plan's complexity line, moving the plan between folders, and changing the plan's goal or scope.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism |
| --- | --- |
| Calibration bands and example plans | `ai/tasks/planning/improve-plan.md` Step 5 "Assess and record complexity" — copied verbatim |
| Workspace preparation step wording | `ai/tasks/planning/improve-plan.md` "Step 0 — Prepare the workspace" |
| Plan picking rule | `ai/tasks/planning/improve-plan.md` "Step 1 — Pick the plan" |
| Playbook pin tests | `scripts/plan-a-new-feature-playbook.test.mjs` (reads `ai/` files and asserts cross-references) |

## Implementation steps

1. Create `ai/tasks/rate-plan-complexity.md` with the steps and forbidden list above, the calibration copied verbatim from `improve-plan.md`, and the standalone report.
2. In `ai/tasks/planning/improve-plan.md`, replace the body of "Step 5 — Assess and record complexity" with an instruction to open `ai/tasks/rate-plan-complexity.md` and execute every step except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, naming the improved plan as the target and keeping its "after your improvements the number may have changed" sentence. Leave the heading, every other step, and the report shape unchanged.
3. In `ai/tasks/planning/improve-plan-with-minimalism.md`, make the same replacement in its Step 5, keeping its "trimming should usually only lower the number, never raise it" sentence.
4. Add a section to `product/specs/task-picker.md` describing the standalone rating task and the two delegations.
5. Mention `rate-plan-complexity` in `documentation/user-documentation/command-bar/tasks.md` only if that page lists the planning tasks it replaces; it does not currently describe the improvement passes' rating step, so leave it unchanged unless a sentence there becomes inaccurate.

## Tests

Add `scripts/rate-plan-complexity-playbook.test.mjs`, following `scripts/plan-a-new-feature-playbook.test.mjs`:

- both improvement tasks name `ai/tasks/rate-plan-complexity.md` and tell the agent to skip its Step 0 and Step 1 by their exact headings, which exist in the rating task;
- the rating task keeps its own `Step 0 — Prepare the workspace` so a direct run still prepares the workspace;
- the five calibration band lines appear in the rating task and in neither improvement task, so the scale has one home;
- every `ai/` path the rating task names exists.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each edit, then read the three task files once to confirm the scale text in `rate-plan-complexity.md` is identical to what `improve-plan.md` carried before.

## Out of scope

- Changing the 1–10 scale, its band wording or example plans, or how ratings are recorded.
- Changing `plan-a-new-feature.md`, `build-a-complex-feature.md`, or other callers' use of the planning tasks.
- Adding size or file-count heuristics to the rating.
