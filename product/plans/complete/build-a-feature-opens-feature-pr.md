# Build a feature should open a feature pull request

**Complexity: 1/10** — four prompt-passage requirements, no production code, tests or new units (p=2.71).

## Goal

`ai/tasks/feature/build-a-feature.md` currently opens its pull request through `open-plan-pull-request.md`, the plan-only workflow whose short body deliberately leaves out behavior examples, screenshots and verification steps because "there is no code to describe yet." But build-a-feature implements the plan end to end before it reaches the PR step, so that premise is false and the PR opens with a thin description that a later task has to fill in. Make build-a-feature open the PR through `open-feature-pull-request.md`, which writes a full description up front for work whose implementation is already complete.

## Requirements

1. Step 7 of `build-a-feature.md` executes "`ai/tasks/workspace/open-feature-pull-request.md`" rather than "`ai/tasks/workspace/open-plan-pull-request.md`", per "update build-a-feature.md to call open-feature-pull-request.md rather than open-plan-pull-request.md".
2. The explanation of why that workflow is used reflects "the implementation is complete already" instead of claiming "there is no code or UI to describe yet".
3. The Allowed passage no longer says the PR is opened "via `ai/tasks/workspace/open-plan-pull-request.md` ... since there is no code to describe yet"; it names `open-feature-pull-request.md` as the workflow build-a-feature uses.
4. Forbidden rule 5 names "`ai/tasks/workspace/open-feature-pull-request.md`" as the task that opens the PR instead of the plan PR task.

## Design decisions

- Change only `ai/tasks/feature/build-a-feature.md`. The issue names that one file, and the other references to `open-plan-pull-request.md` describe genuine plan-first workflows that stay valid.
- Keep the remaining Step 7 responsibility — record the PR number, URL and head branch for Steps 8 and 9 — unchanged; only the executed workflow and its rationale change.
- Do not change PR opening in `build-a-complex-feature.md`, which opens a plan-first PR before implementation.

## Assumptions

1. `ai/tasks/feature/build-a-feature.md:19` currently reads "Open the PR via `ai/tasks/workspace/open-plan-pull-request.md` when the plan is promoted, since there is no code to describe yet".
2. `ai/tasks/feature/build-a-feature.md:27` currently reads "`ai/tasks/workspace/open-plan-pull-request.md` opens it".
3. `ai/tasks/feature/build-a-feature.md:106` currently reads "Execute `ai/tasks/workspace/open-plan-pull-request.md`, which carries only the short plan summary because the plan is already promoted and there is no code or UI to describe yet".
4. `ai/tasks/workspace/open-feature-pull-request.md:3` describes that task as taking "the uncommitted work in this repository" and packaging it "into a well-described pull request", with a body that includes behavior examples, screenshots and verification steps.
5. `ai/tasks/feature/build-a-feature.md:3` establishes the implementation precedes PR opening: the task will "implement it end to end, update the functional specs, promote the plan ... and open a pull request".

## Existing functionality

1. `ai/tasks/workspace/open-feature-pull-request.md` — the feature-PR workflow that writes a full body with **What**, **Behavior examples**, **Screenshots** and **How to verify**, used for PRs opened from working code.
2. `ai/tasks/workspace/open-plan-pull-request.md` — the plan-only workflow that writes a short summary; it remains in use by plan-first flows such as `ai/tasks/feature/build-a-complex-feature.md:47`.

## Implementation steps

1. Update the Allowed passage in `ai/tasks/feature/build-a-feature.md` so it directs build-a-feature to open the PR through `ai/tasks/workspace/open-feature-pull-request.md` once implementation and plan promotion are done, because there is working code and UI to describe; drop the clause assigning the plan PR to this task.
2. Update Forbidden rule 5 so the sentence naming the workflow that opens the PR reads `ai/tasks/workspace/open-feature-pull-request.md`.
3. Rewrite the Step 7 body: execute `ai/tasks/workspace/open-feature-pull-request.md`, say it carries a full feature description because the implementation is already complete, and name it as the owner of the feature PR workflow that the task follows without deviation. Keep the following sentence about recording the PR number, URL and head branch intact.

## UI design

None. The change is confined to an agent prompt document and does not alter any user-visible interface.

## Tests

None. The change edits only an agent prompt document — there is no importable behavior, runtime code, or test hook under `src/` or `web/src/`, and nothing reads the contents of this task file at runtime. `./scripts/run.mjs check-diff` still runs over the diff as a regression guard.

## Out of scope

- Editing `open-plan-pull-request.md` or `open-feature-pull-request.md`.
- Editing `build-a-complex-feature.md`, whose plan-first PR flow legitimately uses the plan PR workflow.
- Editing the plan-first references in `update-pull-request.md` and `test-pull-request.md`; those remain accurate for plan-first PRs.
- Changing any source code, specs, help, or user documentation.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then read `ai/tasks/feature/build-a-feature.md` and confirm all four passages are consistent: the Allowed passage and Forbidden rule 5 point to `open-feature-pull-request.md`, Step 7 executes `open-feature-pull-request.md`, and none of the changed passages still claim there is no code or UI to describe yet. A leftover `open-plan-pull-request.md` reference in any of those passages, or a lingering "no code to describe" rationale, means the change was incomplete.
