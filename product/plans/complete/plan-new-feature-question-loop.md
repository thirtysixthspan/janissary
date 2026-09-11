# Finalize plan-a-new-feature plans through resolved questions

**Complexity: 2/10** — this revises one task playbook and adds a focused static-contract test; it introduces no runtime application behavior or protocol changes.

## Goal

Make `plan-a-new-feature.md` produce an initial draft before gathering its unanswered product decisions, improve that draft, then continue asking and applying only remaining questions until the plan is complete. Plans produced by the task must not carry an `Open questions` section.

## Approach

Keep the task's existing reconnaissance, question categories, plan format, backlog removal, and merge workflow. Reorder the draft and question phases so the initial draft exposes the decisions that need confirmation without recording unresolved work in the artifact. After the first answered round, retain the two existing plan-improvement passes. Then inspect the improved plan for unanswered product decisions, ask another bounded round when any remain, update the plan from each answer, and repeat until none remain.

Add a small server-project test that reads the playbook as the executable contract. It will pin the absence of an `Open questions` plan section, the initial-draft-before-question ordering, and the post-improvement completion loop, without asserting incidental prose.

## Implementation steps

1. Update `ai/tasks/plan-a-new-feature.md` to describe the initial draft, the first product-question round after it, and the improvement-pass sequence before later question rounds.
2. Replace the three-round cutoff and unresolved-plan fallback with a loop that asks only unanswered decision categories, incorporates each answer into the draft, and ends only when no open questions remain.
3. Remove the `Open questions` section from the required draft-plan structure and update the task's checklist and report language to call the completed draft final rather than unresolved.
4. Add `scripts/plan-a-new-feature-task.test.mjs`, following `scripts/docs-screenshots/task-playbook.test.mjs`, to verify the playbook's stable workflow guarantees.

## Tests

- `scripts/plan-a-new-feature-task.test.mjs` verifies that the playbook creates an initial draft before its first question round, runs both existing improvement tasks before seeking remaining answers, has no `Open questions` section requirement, and has no capped-round unresolved fallback.
- Run `$janissary/scripts/run.mjs check-diff` after each change.

## Spec updates

- Update `product/specs/task-picker.md` to describe `plan-a-new-feature.md`'s draft, improvement, and question-resolution lifecycle as a task-file behavior.

## Docs

- Check `help.md` and `documentation/user-documentation/` for existing descriptions of the planning task; update only an existing description if present.

## Out of scope

- Changing the feature-selection rules, reconnaissance steps, question categories, backlog-removal policy, or the implementation-plan contents beyond removing the unresolved-question section.
- Changing either plan-improvement task's behavior.
