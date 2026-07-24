# Find Technical Debt

Your job: read through the codebase and use your own judgment to spot likely sources of technical debt — code smells, architecture drift, inconsistency, and maintenance risk — then log what you find as new entries under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** debt; it does not fix it, and other tasks own resolving what lands here ([`reduce-technical-debt.md`](../reduce-technical-debt.md), [`reduce-complexity.md`](../reduce-complexity.md), [`remove-deadcode.md`](../remove-deadcode.md), [`remove-duplication.md`](../remove-duplication.md), [`improve-modularity.md`](../improve-modularity.md)).

**Never run repository tools to assess debt.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run quality`, `./scripts/run.mjs check-diff`, FTA, or any other build/lint/test/analysis tooling — not even the diff-scoped fast commands. Those tools already have dedicated tasks that consume their output. This task's job is to **read the code yourself** and make a judgment call, the same way a human reviewer skimming the codebase would. Plain read-only shell commands used only to navigate (`ls`, `wc -l`, `grep`, `git log`) are fine — the restriction is on running the project's build/lint/test/quality machinery, not on looking at files.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — how to reason about debt

This task follows the common industry framing of technical debt, so keep it in mind while reading code and writing entries:

- **Debt has a type, not just a size.** Fowler's technical debt quadrant classifies debt along two axes: was it taken on *deliberately* or *inadvertently*, and was the choice *prudent* or *reckless*? Deliberate-and-prudent debt ("we know this cuts a corner, but shipping now is worth it, and we can see the payoff") is a normal, healthy trade-off — it is not automatically worth logging on its own. What belongs in this backlog is debt whose "interest" is visibly compounding now: reckless shortcuts, inadvertent debt from outdated assumptions or code that never caught up with a later architectural decision, and anything that makes nearby changes harder or riskier than they should be. Use this lens when judging severity in Step 4.
- **A code smell is a symptom, not the debt itself.** The established smell taxonomy (long methods, duplicated code, large/"blob" classes mixing unrelated responsibilities, deep conditional nesting, inconsistent error-handling styles) is a reliable way to *find* debt by reading, but the debt is the underlying design gap the smell points to. An entry that names the cause ("no shared validation layer, so each route hand-rolls its own checks") is more useful than one that only names the symptom ("duplicated code in routes").
- **Debt worth logging is debt worth resolving safely and incrementally.** The tasks that consume this backlog resolve debt through small, verifiable steps — contain the area, keep it under test, refactor, verify behavior didn't change — rather than large rewrites, mirroring the boy-scout rule (leave code a little better, in small steps) and, for anything large enough to need staged replacement, the strangler-fig pattern (build the replacement alongside the old code and cut over incrementally). Size each entry as a single unit of work someone could pick up and finish in one sitting, not "rewrite module X" or "redesign the architecture."
- **Prioritize like the debt has a cost, not just a badness score.** Industry guidance weighs debt by business impact/risk against remediation effort, favoring high-impact/low-effort items — this is why Step 3 caps the run and asks you to keep the entries most likely to cause real harm or slow down future work, not just the most numerous.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. It has three flat sections — `## ready`, `## development`, `## deferred` — each a plain `*` bullet list with no IDs or scores.

Collect every existing bullet from all three sections into one list. This is the dedupe set: nothing you add in Step 5 may restate an item already present anywhere in the file, even worded differently. If the same underlying issue is already listed (in any section), skip it.

---

## Step 2 — Read the code and form candidates

Read broadly across `src/` and `web/src/`, using your own judgment — not a tool's — to spot technical debt. The signals below are drawn from the established code-smell taxonomy (Fowler's *Refactoring* catalog and the empirical literature on maintainability) — treat each as something to notice while reading, then ask *what design gap produced this?* before writing it down:

- **Size and shape.** Files at or near the 200-line limit in [`ai/guidelines/code-guidelines.md`](../../guidelines/code-guidelines.md) (`wc -l` is fine to check this), files that visibly mix unrelated responsibilities, or functions that read as doing too many things at once.
- **Duplication.** The same logic, validation, or shape of code repeated across multiple files instead of shared — read the files side by side to judge similarity, don't rely on a duplication detector.
- **Inconsistency.** Two places that solve the same kind of problem in different ways (e.g. one module handles errors by throwing, another by returning a result type; inconsistent naming for the same concept across files).
- **Markers left in code.** `TODO`, `FIXME`, `HACK`, `XXX` comments, commented-out code blocks, and stale comments that no longer match the code beside them.
- **Coupling and architecture drift.** Modules that reach into another module's internals instead of its public surface, circular-feeling dependencies, or code that no longer matches the shape described in `product/specs/` or `ai/guidelines/`.
- **Type and safety erosion.** Liberal use of `any`, type assertions used to silence a mismatch rather than express a real invariant, or unsafe patterns that suggest the types stopped being trusted.
- **Test gaps you can see by inspection.** A module with clearly risky logic (parsing, state transitions, error paths) sitting next to a test file that only covers the happy path, or no colocated test file at all for a non-trivial module.

You do not need to cover the entire codebase exhaustively in one run — read enough of `src/` and `web/src/` (favor areas you have not looked at recently, or that recent `git log` activity suggests are churning) to form a genuine, evidence-based list. Skim broadly first, then read closely wherever something looks off.

For every candidate, note the file(s) it lives in and the specific thing you observed — you need this to write a concrete entry in Step 4.

---

## Step 3 — Bound the run

Cap this run at **10 new entries**. If you find more genuine candidates than that, keep the 10 you judge most impactful (most files touched, most likely to cause a real bug or slow down future work, most visibly inconsistent with the project's own guidelines) and leave the rest for the next run — do not pad the list with marginal findings just to hit the cap, and do not exceed it.

If you find zero genuine candidates after a good-faith read, that is a valid outcome — do not invent debt that isn't there.

---

## Step 4 — Write each entry

Match the existing style in `product/backlog/technical-debt.md`: one imperative, concrete sentence per bullet, no scores, no IDs. Look at the current `## ready` entries for tone, e.g. `rename file-tree-view to file-navigator-view everywhere`.

Each new bullet must:

- State the symptom you observed.
- State the action that would resolve it.
- Name the concrete file(s) or area involved, so whoever picks it up doesn't have to rediscover what you found.
- Stay to one paragraph.
- Include a severity rating, chosen from this scale (weighing business impact/risk against how much effort resolving it looks like, per the prioritization guidance in Background):

  | Severity | Meaning |
  |----------|---------|
  | **high** | Reckless or actively compounding debt on a core/high-churn path; each nearby change now costs noticeably more or risks a real bug. Low-to-moderate effort to resolve. |
  | **medium** | Real design gap or inconsistency, but contained to one area, low-churn, or moderate effort to resolve. |
  | **low** | Minor, cosmetic, or edge-case debt — worth tracking, but nothing is on fire and it can wait behind higher-severity items. |

  Prefer **high** only for debt matching the "reckless" or clearly-compounding-inadvertent quadrants from Background — a deliberate, prudent trade-off the team knowingly accepted is rarely more than **medium**.

---

## Step 5 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new bullets to the end of the `## development` section only. Leave `## ready` and `## deferred` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log new technical debt findings
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Existing entries:  <count found in Step 1, across all sections>
New entries added: <count> (to product/backlog/technical-debt.md, ## development)
Entries:           <one line per new entry, or "none found">
Commit:            <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
