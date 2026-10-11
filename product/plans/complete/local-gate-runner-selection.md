# Use the available runner for the build diagnosis gate

**Complexity: 1/10** — correct one command in the workspace task and clarify the matching behavior in its functional spec. No code or test changes are needed.

Step 2 of `ai/tasks/workspace/fix-build.md` runs `./scripts/run.mjs pr-check-gate` from the target project directory. The task can run against other projects that do not have this repository's `scripts/run.mjs`; Step 5 already uses the installation runner through `$janissary/scripts/run.mjs`.

## Approach

Use `$janissary/scripts/run.mjs pr-check-gate` consistently in the task's diagnosis step. The Janissary runner invokes the gate while leaving the target project as the working directory, so the gate still checks the target project's typecheck, lint, and test scripts.

## Implementation steps

1. `ai/tasks/workspace/fix-build.md` — replace the Step 2 local runner command with `$janissary/scripts/run.mjs pr-check-gate`, matching Step 5.
2. `product/specs/task-picker.md` — clarify that the workspace task uses the installation runner for the local gate during diagnosis and final verification.

## Tests

Manually review both invocations in the task and confirm they name the same runner. Walk through a Janissary checkout and a project without `scripts/run.mjs`; in both cases the installation runner must run the gate from the target project directory. No automated test is warranted for this documentation-only command correction.

## Out of scope

- Changing the gate's typecheck, lint, or test behavior.
- Updating other task commands or adding runner discovery logic.
- Adding source code or automated tests.
- Addressing the separate security finding in the pull-request backlog.
