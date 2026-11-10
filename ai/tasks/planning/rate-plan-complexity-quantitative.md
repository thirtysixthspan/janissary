# Rate a Plan's Complexity Quantitatively (one plan per run)

Your job: rate **one** plan **1–10** for implementation complexity by answering five counting questions about it and feeding the answers through a fixed formula. You record the result directly under the plan's `#` title. You change nothing in the plan except its complexity line, and you change no other file.

This task is the quantitative sibling of `ai/tasks/planning/rate-plan-complexity.md`. That task rates by judgment against calibration bands. This one rates by arithmetic, so two runs on the same plan land on nearly the same number. Both record the same single line, so anything that reads the rating works with either. Run this one on its own against any plan, or call it from another task.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory, which is the project being worked on. It never refers to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**Called by another task.** When another task opens this one, execute every step in order except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`: the caller has already prepared the workspace and chosen the plan, and that plan is your target. Give the caller the rating and its rationale in place of the standalone report.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended. Do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Step 1" below.

## What you may and may not do

### Allowed: do it automatically, never ask

Read the plan and anything in the repo you need to answer the five questions. Run a one-line calculation to apply the formula. Add or update the one complexity line in the plan file. When the work is only this, carry it out start to finish without stopping. Do **not** ask "Do you want me to proceed?" and do **not** pause for approval.

### Forbidden: no exceptions

1. **Adding code to the plan.** Never add implementation code blocks.
2. **Editing anything other than the plan's complexity line.** No other part of the plan, no source, no tests, no config, no other plans.
3. **Moving the plan between folders.** Its status folder is the human's decision (see the plan-storage section in [`AGENTS.md`](../../../AGENTS.md)).
4. **Deciding product scope.** If the plan's *goal* seems wrong or not worth doing, say so in your report. Do not rewrite the goal.
5. **Steering the number.** Answer each question from the plan and the code. Never adjust an answer to land on a score you expected.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick the plan

- If you were pointed at a specific plan file, use that one, whichever status folder under `./product/plans/` it is in.
- Otherwise list `./product/plans/draft/`. Exactly one plan there is your target. More than one: report the list and stop (the human picks). None: report that and stop.

State your pick in one sentence.

---

## Step 2 — Read the plan and the code it touches

1. Read the entire plan.
2. Open the real code areas it names. The answers in Step 3 are counts of things in the code, so count them from the code and not only from the plan's own description. Grep for call sites, open the files that would change, and check how close each one is to the 200-line `max-lines` limit, because a file that would overflow forces a new module.

---

## Step 3 — Answer the five questions

Answer each question with a single non-negative integer. Count **production code only**: exclude tests, docs, plans and specs from every count. Use `0` when nothing applies. Answer them one at a time, before you compute anything.

1. **`lines_added`**: Estimate of lines that will be added.
2. **`files_edited`**: Existing production files that need edits.
3. **`requirements`**: Distinct behavioral requirements the plan states.
4. **`scenarios`**: Distinct scenarios that tests must cover, including edge and failure paths.
5. **`new_units`**: New modules, service, components, classes, functions and types.

Write the five numbers down in your working notes with one phrase each saying what you counted. If you cannot defend a number in a phrase, recount it.

---

## Step 4 — Compute the score

The formula predicts the size of the whole pull request, meaning lines added plus lines deleted across every file the PR touches except the plan itself, tests and docs included. Compute `p` with natural logarithms:

```
p = 1.578
  + 0.215 * ln(1 + lines_added)
  + 0.433 * ln(1 + files_edited)
  + 0.705 * ln(1 + requirements)
  + 0.369 * ln(1 + scenarios)
  + 0.027 * ln(1 + new_units)
```

Do not do this arithmetic in your head. Run it, for example:

```
node -e "const [a,f,r,s,u]=[LINES,FILES,REQS,SCENARIOS,UNITS];const L=Math.log1p;console.log(1.578+0.215*L(a)+0.433*L(f)+0.705*L(r)+0.369*L(s)+0.027*L(u))"
```

Replace the five uppercase placeholders with your answers, in that order.

The score is the highest row below whose `p` threshold your `p` meets or exceeds. A `p` under 3.461 scores 1.

| Score | `p` at or above | Predicted whole-PR churn (lines) | Typical actual churn (median) |
| --- | --- | --- | --- |
| 1 | below 3.461 | under about 31 | 13 |
| 2 | 3.461 | 31 | 47 |
| 3 | 4.342 | 76 | 108 |
| 4 | 4.856 | 128 | 167 |
| 5 | 5.248 | 189 | 243 |
| 6 | 5.739 | 310 | 360 |
| 7 | 6.531 | 685 | 1,377 |
| 8 | 8.098 | 3,287 | 3,996 |
| 9 | 8.820 | 6,769 | 10,620 |

The formula tops out at **9**. Nothing has ever been rated 10, so the table has no 10 row, and you never record one from this task. Reserve 10 for the judgment task when a plan is truly an architecture-level overhaul.

A worked example. A plan estimated at 150 added lines across 6 files, with 12 requirements, 14 scenarios and 6 new units, gives `p` of about 1.578 + 0.215·5.02 + 0.433·1.95 + 0.705·2.56 + 0.369·2.71 + 0.027·1.95 = 6.36. That meets 5.739 and misses 6.531, so the score is **6**.

### Where the numbers come from

The weights and thresholds were fitted offline on 300 merged pull requests, each backed by one plan rated 1 to 9, with the five answers produced blind from the plan and the code as it stood before the change. The thresholds are quantile cuts chosen so the scores spread the same way the original judgment ratings did: roughly 8% ones, about 20% each of twos and threes, thinning to about 1% nines. On held-out data the score tracks real whole-PR churn at a rank correlation of about 0.90, against about 0.76 for the original judgment rating. Treat a score as a rank among plans, not a line count. Neighboring scores overlap a lot in raw lines. If the question wording, the model answering them, or the shape of the plan population changes, the thresholds need refitting.

---

## Step 5 — Record the rating

Record it directly under the plan's `#` title as a single line:

```
**Complexity: N/10** — <one-line rationale naming what drives the number>
```

The rationale names the two or three answers that carry the score and the resulting `p`, for example `~150 added lines, 6 files, 12 requirements (p=6.36)`.

If the plan already has a complexity line, update it in place. The number may have changed. Use natural line breaks and never wrap lines at a fixed column (per `AGENTS.md`).

---

## Step 6 — Verify and report

1. `git status` and `git diff`: confirm the **only** modified file is the plan, and the only change is its complexity line (untracked plan files: confirm nothing else changed).
2. Confirm the complexity line is present, directly under the `#` title, and formatted as above.

Then give the user a short report in this exact shape:

```
Plan:        <path to the plan>
Complexity:  N/10 — <rationale>
Answers:     lines_added=<n>, files_edited=<n>, requirements=<n>, scenarios=<n>, new_units=<n>
Score:       p=<value> → N
Basis:       <short bullets: the facts from the plan and code that drove each answer>
```

Keep it brief. Done.
