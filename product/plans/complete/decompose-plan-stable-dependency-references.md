# docs(tasks): reference subplan dependencies by stable file name

**Complexity: 1/10** — no production code, 0 files, 4 documentation requirements (p=2.71)

## Goal

`ai/tasks/planning/decompose-plan.md` Step 3 tells each subplan to name the earlier subplans it depends on "using their final ready paths". The complex-feature workflow then promotes each subplan from `ready/` to `complete/` as it lands. By the fourth subplan, every dependency reference pointed at a file that no longer existed, and the orchestrator had to warn each later subagent by hand. Name dependencies by their file name alone, which never changes as a plan moves between status folders. Have `improve-plan.md` Step 3 flag any reference to another plan that would dangle once that plan is promoted.

## Requirements

1. "Use stable filenames or final complete/ paths for dependency references": `decompose-plan.md` Step 3 tells each subplan to name the earlier subplans it depends on by file name (`<source-name>-<N>-<slug>.md`) without a status-folder prefix, and says why: each subplan moves from `draft/` to `ready/` to `complete/`.
2. `decompose-plan.md` Step 6 item 2's order check confirms dependency references use those bare file names and match the final numbering, in place of "match the final ready paths".
3. "have improve-plan.md Step 3 check forward references with promotion in mind": `improve-plan.md` Step 3 lists a check that a reference to another plan must survive that plan's promotion, so a path into a status folder the referenced plan will leave is a stale reference to fix.
4. The functional spec `product/specs/task-picker.md` ("Decomposing a plan") states that subplans name their dependencies by file name, so the references stay valid as subplans are promoted.

## Design decisions

- Use bare file names rather than final `complete/` paths. A `complete/` path is wrong until each dependency is implemented, and a `ready/` path is wrong after. The file name is the one identifier that is right at every stage. The numbered naming scheme `<source-name>-<N>-<slug>.md` already makes it unique.
- Keep the source plan's reference as a `./product/plans/complete/` path. Step 6 moves the source plan there before any subplan is implemented, and it never moves again (`ai/tasks/feature/build-a-complex-feature.md` Step 7 confirms it stays there).
- Leave the Step 7 report's "exact ready path" for each subplan unchanged. It tells the caller where each subplan is at the moment of the report, and the complex-feature orchestrator consumes those paths before any promotion.
- Put the improve-plan check under the existing "Wrong or stale references" bullet rather than adding a new bullet, because a reference that will dangle is a stale reference in waiting.

## Preserved behavior

None found

## Assumptions

1. Step 3 currently requires ready paths: `ai/tasks/planning/decompose-plan.md:57` "the earlier subplans it depends on, using their final ready paths".
2. Step 6's order check currently requires ready paths: `ai/tasks/planning/decompose-plan.md:80` "all references match the final ready paths and numbering".
3. Subplans are named by a stable numbered scheme: `ai/tasks/planning/decompose-plan.md:57` "`./product/plans/draft/<source-name>-<N>-<slug>.md`".
4. Subplans are promoted to `complete/` as they land: `ai/tasks/feature/build-a-complex-feature.md:58` "write/update the functional specs, and promote that plan to `complete/`".
5. Improve-plan's stale-reference check exists: `ai/tasks/planning/improve-plan.md:57` "**Wrong or stale references.**".
6. The spec describes subplan dependencies: `product/specs/task-picker.md:52` "A subplan depends only on earlier ones".

## Existing functionality

1. The stale-reference check this plan extends: `ai/tasks/planning/improve-plan.md:57` "Paths, symbols, or line anchors that don't match the repo."

## Implementation steps

1. In `ai/tasks/planning/decompose-plan.md` Step 3, replace "the earlier subplans it depends on, using their final ready paths" with an instruction to name each earlier subplan by its file name alone, with no status-folder prefix, and add a sentence explaining that each subplan moves from `draft/` to `ready/` to `complete/` as it is improved and implemented, so only the file name stays valid throughout. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In Step 6 item 2, replace "all references match the final ready paths and numbering" with a check that every dependency reference names an earlier subplan by its bare file name and matches the final numbering, and that no reference carries a status-folder path. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `ai/tasks/planning/improve-plan.md` Step 3, extend the "Wrong or stale references" bullet: a reference to another plan must still resolve after that plan is promoted. Plans move between status folders, so name another plan by its file name, or by a `complete/` path only when it is already there and stays there. A path into a folder the referenced plan will leave is a stale reference to fix. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `product/specs/task-picker.md` "Decomposing a plan", add after "A subplan depends only on earlier ones" that a subplan names each one by file name alone, so the references stay valid as subplans move from the drafts to the ready and completed plans.

## UI design

None. The change touches task playbooks and a spec; it has no user interface surface.

## Tests

This plan changes no application behavior and introduces no code, so no tests are added. `$janissary/scripts/run.mjs check-diff` confirms no regression.

## Out of scope

- Changing the subplan naming scheme, or how the complex-feature workflow promotes subplans.
- Rewriting dependency references inside existing plans under `product/plans/`.
- The Step 7 report's ready paths, which describe current locations for the caller.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`; it must pass.
2. Read `ai/tasks/planning/decompose-plan.md`. Confirm Step 3 tells subplans to name dependencies by bare file name and gives the promotion reason, and Step 6 item 2 checks for bare file names. Any remaining "final ready paths" wording in Step 3 or Step 6 means the change was not made.
3. Read `ai/tasks/planning/improve-plan.md` Step 3 and confirm the "Wrong or stale references" bullet covers references that dangle once another plan is promoted.
4. Read `product/specs/task-picker.md` "Decomposing a plan" and confirm it says dependencies are named by file name.
