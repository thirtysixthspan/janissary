# Run the planning task's improvement passes in the workspace it already prepared

**Complexity: 1/10** — one paragraph of one task prompt changes, plus a pin test and one spec sentence. No runtime surface.

## Goal

`ai/tasks/feature/plan-a-new-feature.md` prepares the workspace in its own Step 0, then in Step 2f tells the agent to execute `ai/tasks/planning/improve-plan.md` and `ai/tasks/planning/improve-plan-with-minimalism.md` "in order and in full". Each of those tasks opens with its own Step 0, which executes `ai/tasks/workspace/prepare-workspace.md` in full. So a single planning run checks out and pulls `master`, audits the lockfile, installs, and rebuilds native dependencies three times. The second and third rounds do nothing useful. They only slow the run down, and the pull can bring in new commits halfway through a plan.

Preparing the workspace is only needed when an improvement task is run on its own. When the planning task calls them, they should reuse the workspace it already prepared.

## Approach

Change the caller, not the callees. `ai/tasks/feature/build-a-complex-feature.md` already does this for `improve-plan.md`: "Override its Step 0 to reuse the already prepared workspace and skip workspace preparation". Step 2f of the planning task gets the same kind of override, naming both improvement tasks and keeping every other step of each.

The improvement tasks stay exactly as they are. Their Step 0 is correct when someone runs them directly, and the override lives with the one caller that has already prepared the workspace.

The issue's subject is a task playbook, so the playbook stands in for "source" here, as it did in `product/plans/complete/work-an-issue-accepts-unlisted-work-item.md`.

## Implementation steps

1. `ai/tasks/feature/plan-a-new-feature.md`, section `### 2f. Improve the answered draft`: replace "Execute these tasks in order and in full:" with an instruction to execute both tasks in order, in full except for each one's `Step 0 — Prepare the workspace`. Then add a short paragraph after the list. It says the workspace this task prepared in its own Step 0 is reused, that an improvement task prepares the workspace only when it is run directly, and that every other step of each task runs as written. The existing closing paragraph about uncovered decisions stays.
2. `scripts/plan-a-new-feature-playbook.test.mjs`: a new pin test (see Tests).
3. `product/specs/task-picker.md`, section `### Planning a new feature`: one sentence saying the task prepares the workspace once and runs both improvement passes in it without preparing it again.

## Tests

`scripts/plan-a-new-feature-playbook.test.mjs`, a new file in the style of `scripts/find-bugs-playbook.test.mjs` and `scripts/test-pull-request-playbook.test.mjs`. It reads the three task files with `readFileSync` and pins only the wording the override depends on:

- the planning task executes `ai/tasks/workspace/prepare-workspace.md` in its own Step 0, before section `### 2f.`;
- for each improvement task, the `### 2f.` section (up to `### 2g.`) names its path and says to skip its `Step 0 — Prepare the workspace`;
- for each improvement task, the file still has a `## Step 0 — Prepare the workspace` heading that executes `ai/tasks/workspace/prepare-workspace.md`. That keeps a direct run preparing the workspace, and it catches the override naming a step that was renumbered or renamed.

## Out of scope

- Changing `improve-plan.md` or `improve-plan-with-minimalism.md` themselves, for example teaching them to detect a caller.
- How the improvement tasks pick their plan when `./product/plans/draft/` holds more than one file. That is a separate defect.
- Other callers of the improvement tasks. `build-a-complex-feature.md` already overrides Step 0.
- `documentation/user-documentation/command-bar/tasks.md` and `help.md`. Neither one describes workspace preparation in the planning task.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: read Step 2f of `plan-a-new-feature.md`. Confirm that both improvement tasks are told to skip their Step 0, and that nothing else about them is overridden.
