# Rate a Plan's Complexity (one plan per run)

Your job: rate **one** plan **1–10** for implementation complexity and record the rating directly under the plan's `#` title. You change nothing in the plan except its complexity line, and you change no other file.

This task is the single home of the complexity scale. Run it on its own against any plan, or call it from another task — `ai/tasks/planning/improve-plan.md` and `ai/tasks/planning/improve-plan-with-minimalism.md` both do, from their own Step 5.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**Called by another task.** When another task opens this one, execute every step in order except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`: the caller has already prepared the workspace and chosen the plan, and that plan is your target. Give the caller the rating and its rationale in place of the standalone report.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Step 1" below.

## What you may and may not do

### Allowed — do it automatically, never ask

Read the plan and anything in the repo you need to judge what it touches. Add or update the one complexity line in the plan file. When the work is only this, carry it out start to finish without stopping — do **not** ask "Do you want me to proceed?", do **not** pause for approval.

### Forbidden — no exceptions

1. **Adding code to the plan.** Never add implementation code blocks.
2. **Editing anything other than the plan's complexity line.** No other part of the plan, no source, no tests, no config, no other plans.
3. **Moving the plan between folders.** Its status folder is the human's decision (see the plan-storage section in [`AGENTS.md`](../../AGENTS.md)).
4. **Deciding product scope.** If the plan's *goal* seems wrong or not worth doing, say so in your report — do not rewrite the goal.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick the plan

- If you were pointed at a specific plan file, use that one, whichever status folder under `./product/plans/` it is in.
- Otherwise list `./product/plans/draft/`. Exactly one plan there → that is your target. More than one → report the list and stop (the human picks). None → report that and stop.

State your pick in one sentence.

---

## Step 2 — Read the plan and the code it touches

1. Read the entire plan.
2. Open the real code areas it names. The bands below turn on what the plan touches: a new protocol or persistence or UI surface, whether it spans server and web, how many call sites must be caught, whether it needs state-machine or concurrency reasoning, how many files it touches, and whether any of it is first-of-its-kind in the app. Judge those from the code, not only from the plan's own description of them.
3. Skim one or two plans in `./product/plans/ready/` that already carry a rating, so your number is consistent with theirs.

---

## Step 3 — Rate the plan

Rate the plan **1–10** for implementation complexity. Calibration, consistent with the ratings on the plans in `./product/plans/ready/`:

- **1–2** — one small module or pure wiring; no new protocol/persistence/UI surface. (`cli-help-version`, `prompt-click-prefill` are 2s.)
- **3–4** — small feature, but correctness depends on catching several call sites or coordinating with other plans; or it spans server and web with a new RPC or persistence field. (`unread-badge` is a 3, `tab-name-alias` a 4.)
- **5–7** — a new subsystem or protocol surface, many touched files, real state-machine or concurrency reasoning.
- **8–9** — a major feature: multiple new modules on both sides, novel interaction logic, first-of-its-kind surface in the app. (`editor-tab` is a 9.)
- **10** — architecture-level overhaul touching most of the system.

---

## Step 4 — Record the rating

Record it directly under the plan's `#` title as a single line:

```
**Complexity: N/10** — <one-line rationale naming what drives the number>
```

If the plan already has a complexity line, update it in place; the number may have changed. Use natural line breaks — never wrap lines at a fixed column (per `AGENTS.md`).

---

## Step 5 — Verify and report

1. `git status` / `git diff` — confirm the **only** modified file is the plan, and the only change is its complexity line (untracked plan files: confirm nothing else changed).
2. Confirm the complexity line is present, directly under the `#` title, and formatted as above.

Then give the user a short report in this exact shape:

```
Plan:        <path to the plan>
Complexity:  N/10 — <rationale>
Basis:       <short bullets — the facts from the plan and code that drove the number>
```

Keep it brief. Done.
