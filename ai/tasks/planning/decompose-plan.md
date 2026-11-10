# Decompose a Plan into Subplans (one plan per run)

Your job: take **one** plan and break it into ordered subplans, each rated **1–5**. Every plan you are given is decomposed, whatever its own rating, and whether or not it has one. A plan with no smaller coherent pieces becomes a single subplan. You write every subplan as a new plan in `./product/plans/draft/` and move the original plan to `./product/plans/complete/`, where it stays as the canonical record of the whole feature. You write plans only; you change no source code.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory, which is the project being worked on. It never refers to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**Called by another task.** When another task opens this one, execute every step in order except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`: the caller has already prepared the workspace and chosen the plan, and that plan is your target. Give the caller the contents of the Step 6 report in place of the standalone report.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended. Do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed in Step 1.

## What you may and may not do

### Allowed: do it automatically, never ask

Read anything in the repo you need to understand the plan and the code it touches. Write new subplan files in `./product/plans/draft/`. Move the source plan to `./product/plans/complete/`. When the work is only this, carry it out start to finish without stopping.

### Forbidden: no exceptions

1. **Writing source code.** No source, tests, config, specs, or docs. Plans only.
2. **Adding code to a plan.** Never add implementation code blocks. Name the module, function, or type and describe its contract and behavior in prose instead.
3. **Editing or rating the source plan.** Its text stays as it is. Keep its complexity line unchanged if it has one, and never add one if it has none. Do not run a rating task on it.
4. **Dropping or weakening scope.** The source plan is the authoritative scope. Every requirement and edge case it states lands in a subplan. Do not reject it or skip decomposition because of its rating.
5. **Promoting a subplan.** Subplans stay in `./product/plans/draft/`. Moving them to `ready/` is the caller's or the human's decision.
6. **Editing any other plan.**

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
3. List every requirement and edge case the source plan states. This list is what Step 5 checks coverage against.

---

## Step 3 — Write the subplans

Break the plan into the smallest coherent, ordered subplans that deliver the original goal without dropping scope. Some plans, such as one rated 1, have no smaller coherent pieces. Write such a plan as a single subplan that carries its full scope rather than forcing an artificial split. Order the subplans so each can be implemented and verified against the preceding completed work. A subplan may depend on earlier subplans, but never on future work. Include explicit integration, migration, and end-to-end verification work where pieces meet; do not leave required work as an implied final cleanup.

Write a complete draft plan for every subplan to `./product/plans/draft/<source-name>-<N>-<slug>.md`, where `<source-name>` is the source plan's file name without `.md`, `<N>` is the subplan's 1-based position in the order, and `<slug>` names what it delivers. Each subplan states its goal, decisions and dependencies, existing code to reuse, proposed changes, tests, verification, and out-of-scope boundaries. Each names the source plan's path in `./product/plans/complete/` and the earlier subplans it depends on. Match the house style of the plans in `./product/plans/ready/` and use natural line breaks (per `AGENTS.md`).

---

## Step 4 — Rate every subplan

Rate every draft subplan by opening `ai/tasks/planning/rate-plan-complexity-quantitative.md` and executing every step in order, except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, once per subplan with that subplan as the target. The `**Complexity: N/10** — <rationale>` line it records under the subplan's `#` title is the subplan's rating; do not assign one by judgment. A subplan it rates 6 or higher is split again, and each resulting subplan is rated the same way, until every subplan is rated 1–5. Renumber the file names so `<N>` still follows the order after a split.

---

## Step 5 — Verify and move the source plan

1. Check coverage. Every requirement and edge case from Step 2 maps to exactly one subplan, or is explicitly shared across named subplans. Fill any gap with a new or extended subplan, rated as in Step 4.
2. Check the order. Each subplan's dependencies point only at earlier subplans.
3. Check the ratings. Every subplan is rated 1–5, and each rating was recorded by the quantitative rating task.
4. Move the source plan to `./product/plans/complete/`, keeping its file name. Use `git mv` when git tracks it; otherwise use a plain `mv`.
5. Run `git status`. Confirm the only changes are the new subplan files in `./product/plans/draft/` and the source plan's unchanged move.

---

## Step 6 — Report

```
Source:      ./product/plans/complete/<file> (Complexity N/10, or unrated)
Subplans:    <ordered list: path, rating, depends on>
Coverage:    <requirement → subplan map>
Open:        <anything only the human can decide, or "nothing">
```

Keep it brief. Done.
