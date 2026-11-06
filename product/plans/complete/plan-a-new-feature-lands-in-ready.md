# plan-a-new-feature leaves its plan in ready

Issue: update the ./ai/tasks/feature/plan-a-new-feature.md task to create the plan in ready, not development state in the backlog.

Complexity rating: 2/10

## Goal

`ai/tasks/feature/plan-a-new-feature.md` settles every product, UI, and implementation decision with the user and runs both improvement passes, but then forbids itself from moving the plan out of `./product/plans/draft/`. That leaves a finished plan sitting in draft until someone promotes it by hand. The task should end with the plan in `./product/plans/ready/`, ready for `build-a-feature`.

## Approach

- Keep drafting in `./product/plans/draft/`. The two improvement passes (`ai/tasks/planning/improve-plan.md`, `improve-plan-with-minimalism.md`) pick their plan from that folder, so the plan must stay there until they and the final question phase (2h) are done.
- Add a step, `2i. Promote the completed plan`, right after 2h. It moves the plan to `./product/plans/ready/` with plain `mv`, as `ai/tasks/work-an-issue.md` Step 2 does, because the new file is still untracked and `git mv` fails on it.
- The old 2i (backlog removal) becomes 2j and the old 2j (merge) becomes 2k. The merge step now ships the promoted plan.
- Replace Forbidden rule 4, which banned moving the plan to ready, with a rule that bans promoting before 2h's checklists all pass.
- Update the job statement, the Allowed list, Forbidden rule 2's file list, and the Step 3 report line (`Planned:  ./product/plans/ready/<file>`).

## Implementation steps

1. `ai/tasks/feature/plan-a-new-feature.md`: make the edits above.
2. `scripts/plan-a-new-feature-playbook.test.mjs`: pin the promotion step.
3. Specs and docs (below).

## Tests

- `scripts/plan-a-new-feature-playbook.test.mjs`: the playbook moves the plan from `./product/plans/draft/` to `./product/plans/ready/` with plain `mv`, in a step that comes after 2h and before the merge step, and its report names the ready path. The existing step-reference test keeps the renumbered steps honest.

## Out of scope

- The improvement tasks' own rule against moving a plan out of draft. That rule covers those tasks when they run directly, and it stays.
- The backlog's `## development` section and how features reach `## ready`.

## Specs and docs

- `product/specs/task-picker.md` § Planning a new feature: say the finished plan moves to the ready folder.
- `documentation/user-documentation/command-bar/tasks.md`: the feature-task paragraph and the "What a shipped task does" list.
- `documentation/user-documentation/workflows/product-development.md`: loop step 1 ends in `plans/ready/`, and step 2 applies to drafts written some other way.
