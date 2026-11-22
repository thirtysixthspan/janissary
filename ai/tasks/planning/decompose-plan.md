# Decompose a Plan into Subplans (one plan per run)

Your job: take **one** plan and break it into ordered subplans initially rated **1–5**, then improve each subplan and promote it to `./product/plans/ready/`. Every plan you are given is decomposed once, whatever its own rating, and whether or not it has one. A plan with no smaller coherent pieces becomes a single subplan. You write every subplan as a new plan in `./product/plans/draft/`, improve it, and retain its final rating. Never resplit a subplan. Move the original plan to `./product/plans/complete/`, where it stays as the unchanged canonical record of the whole feature. You write plans only; you change no source code, make no commits, and open no pull request.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory, which is the project being worked on. It never refers to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**Called by another task.** When another task opens this one, execute every step in order except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`: the caller has already prepared the workspace and chosen the plan, and that plan is your target. Give the caller the contents of the Step 7 report, including the improved subplans' exact ready paths, in place of the standalone report. The caller owns publication and implementation.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended. Do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Stop early only for the selection conditions in Step 1, or a child task that cannot complete. Preserve the work and report the concrete blocker.

## What you may and may not do

### Allowed: do it automatically, never ask

Read anything in the repo you need to understand the plan and the code it touches. Write and improve new subplan files in `./product/plans/draft/` and promote final improved subplans to `./product/plans/ready/`. Move the source plan to `./product/plans/complete/`. When the work is only this, carry it out start to finish without stopping.

### Forbidden: no exceptions

1. **Writing source code.** No source, tests, config, specs, or docs. Plans only.
2. **Adding code to a plan.** Never add implementation code blocks. Name the module, function, or type and describe its contract and behavior in prose instead.
3. **Editing or rating the source plan.** Its text stays as it is. Keep its complexity line unchanged if it has one, and never add one if it has none. Do not run a rating task on it.
4. **Dropping or weakening scope.** The source plan is the authoritative scope. Every requirement and edge case it states lands in a subplan. Do not reject it or skip decomposition because of its rating.
5. **Editing any other plan.** Only the subplans created by this run may be edited; the source plan may only be moved unchanged.
6. **Promoting an unimproved subplan.** Every subplan must complete improvement and quantitative rerating before it moves to `ready/`.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick the plan

- If you were pointed at a specific plan file in `./product/plans/draft/` or `./product/plans/ready/`, use that one. A plan in `complete/` or `deferred/` is not eligible: report that and stop.
- Otherwise list `./product/plans/ready/`. Exactly one plan there is your target. More than one: report the list and stop (the human picks). None: report that and stop.

State your pick in one sentence.

---

## Step 2 — Read the plan and the code it touches

1. Read the entire plan. Its complexity rating, or the lack of one, does not change what you do next: every plan is decomposed.
2. Read the project constraints in [`AGENTS.md`](../../../AGENTS.md), every file under `ai/guidelines/`, and the specs and code the plan touches. Grep for call sites rather than trusting the plan's own description, because subplan boundaries have to match how the code is actually wired.
3. List every requirement and edge case the source plan states. This list is what Step 6 checks coverage against. Treat each preserved-behavior entry in the source plan as a tracked requirement in this inventory, pairing its behavior with the test that pins it.

---

## Step 3 — Write the subplans

Break the plan into the smallest coherent, ordered subplans that deliver the original goal without dropping scope, targeting complexity 1–5 for each initial subplan. Some plans, such as one rated 1, have no smaller coherent pieces. Write such a plan as a single subplan that carries its full scope rather than forcing an artificial split. Order the subplans so each can be implemented and verified against the preceding completed work. Each subplan is a self-contained, buildable change. A subplan may depend on earlier subplans only in the sense of using an API an earlier subplan delivered, never in leaving a compile error that a later subplan must fix. When a type or exported symbol changes, either include every production consumer that would break in the same subplan, or deliver the change as an additive three-step transition: add the new field or symbol alongside the old one, migrate consumers in the next subplan, and remove the old one in a third, with each step green on its own. Include explicit integration, migration, and end-to-end verification work where pieces meet; do not leave required work as an implied final cleanup.

Write a complete draft plan for every subplan to `./product/plans/draft/<source-name>-<N>-<slug>.md`, where `<source-name>` is the source plan's file name without `.md`, `<N>` is the subplan's 1-based position in the order, and `<slug>` names what it delivers. Every subplan follows `ai/guidelines/plan-template.md`; that template is the single owner of the plan's sections and each section's format and content, so do not restate a section list here. Each names the source plan's path in `./product/plans/complete/` and the earlier subplans it depends on, using their final ready paths. Use natural line breaks (per `AGENTS.md`).

---

## Step 4 — Rate every subplan

Rate every draft subplan by opening `ai/tasks/planning/rate-plan-complexity.md` and executing every step in order, except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, once per subplan with that subplan as the target. The `**Complexity: N/10** — <rationale>` line it records under the subplan's `#` title is the subplan's rating; do not assign one by judgment. Record each initial rating for the report before improvement updates it.

---

## Step 5 — Improve and promote each subplan

Process subplans strictly in dependency order. Use a fresh subagent to execute `ai/tasks/planning/improve-plan.md` with the next subplan's exact draft path. Skip its `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`; this task has already prepared the workspace and selected the target. Preserve its one-plan-only edit restriction and all other improvement, quantitative rating, and verification steps. Give the subagent the existing working-tree changes as its baseline so it verifies that only its selected plan changed during its pass. Improvement leaves that plan in `draft/`; this task owns promotion.

Accept the quantitative rating improvement records honestly. Record the initial and final ratings for the report so the caller can apply its own implementation limits.

After each improvement, verify that the subplan remains within the source scope, retains its assigned requirements and edge cases, depends only on earlier subplans, and carries its final quantitative rating. Move it from `draft/` to `ready/` with `git mv` when tracked or plain `mv` otherwise, and record its exact path. Continue until every subplan has been improved and promoted, including any whose final complexity grew. Do not implement or publish any plan here.

---

## Step 6 — Verify and move the source plan

1. Check coverage. Every requirement and edge case from Step 2 maps to exactly one subplan, or is explicitly shared across named subplans. Each preserved-behavior entry is a tracked requirement in this coverage map, and its behavior and the test that pins it land in the same subplan — never split across subplans. Fill any gap by extending the subplan responsible for it, returned to `draft/` if necessary, then repeat improvement and quantitative rerating in Step 5. Preserve any increased rating without resplitting.
2. Check the order. Each subplan's dependencies point only at earlier subplans, and all references match the final ready paths and numbering.
3. Check the ratings and improvement. Every subplan was initially rated 1–5, has completed improvement, is in `ready/`, and carries its honest quantitative rating after its final improvement. Any growth is reported, not a reason to resplit.
4. Check buildability. For each subplan, list the files needed for the whole tree to compile. Confirm those files all lie inside that subplan's scope, and confirm no dangling reference is deferred to a later work unit. The file list must be sufficient for a green `$janissary/scripts/run.mjs check-diff` at that subplan's own commit, not after the whole feature lands.
5. Move the source plan to `./product/plans/complete/`, keeping its file name. Use `git mv` when git tracks it; otherwise use a plain `mv`.
6. Run `git status`. Against the caller's baseline when called by another task, confirm the only changes from this run are the new improved subplan files in `./product/plans/ready/` and the source plan's unchanged move.

---

## Step 7 — Report

```
Source:      ./product/plans/complete/<file> (Complexity N/10, or unrated)
Subplans:    <ordered list: exact ready path, initial → final rating, depends on>
Improved:    <all subplans improved and promoted>
Growth:      <subplans whose rating increased, or "none"; no resplitting>
Coverage:    <requirement → subplan map>
Open:        <anything only the human can decide, or "nothing">
```

Keep it brief. Done.
