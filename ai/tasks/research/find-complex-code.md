# Find Complex Code

Your job: find the functions in `src/` and `web/src/` that carry too much cognitive complexity, and log each one as a new entry under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** complexity hotspots. It never edits a source file, never extracts a helper, never touches a test. Resolving what lands here belongs to [`reduce-complexity.md`](../hygiene/reduce-complexity.md), and every entry you write says so explicitly.

The signals are the same ones [`reduce-complexity.md`](../hygiene/reduce-complexity.md) reads: the `sonarjs/cognitive-complexity` warnings from `npm run lint`, and the per-file FTA scores from `npm run quality`. The difference is the output. That task refactors one function per run and verifies it. This task refactors nothing. It writes down the hotspots it found, with the before-numbers and the location, so whoever picks one up can go straight to the extraction without re-running the whole toolchain to rediscover the target.

**Run only the two analysis commands named in Step 2.** `npm run lint` and `npm run quality` are this task's instruments and you must run them — a cognitive-complexity score is not something you can eyeball. Do not run `npm run test`, `npm run typecheck`, `npm run check`, `./scripts/run.mjs check-diff`, or any build. You are changing no code, so there is nothing to verify. Plain read-only shell commands used to navigate (`ls`, `find`, `grep`, `wc -l`, `git log`) are fine.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — what makes a function worth logging

A cognitive-complexity warning is the linter saying that a function has accumulated more branching and nesting than a reader can hold in their head at once. The debt is not that the function is long; it is that understanding any one path through it requires understanding all of them. Every subsequent change to that function is made by someone who does not fully understand it, which is how the complexity keeps climbing.

Two things follow from that:

- **The lint score is the evidence, not the whole story.** A function reported at 17 against a limit of 15 is barely over and may read perfectly well. A function at 40 is a genuine hazard. Rank by how far over the limit the function sits, and read enough of the function to confirm the score reflects real tangle rather than one long, flat `switch` that happens to count high.
- **Log the ones a single extraction can actually help.** `reduce-complexity.md` performs one in-file refactor per run: it lifts a cohesive block into a new local helper, or flattens a conditional chain, without moving code to another module and without changing the file's public API. A function whose complexity is irreducible without splitting the module or reshaping exports is not a candidate for this backlog — it is a modularity item, and [`improve-modularity.md`](../hygiene/improve-modularity.md) owns it.

Scope is `src/` and `web/src/`, source files only. Colocated test files (`*.test.ts`, `*.test.tsx`) are out of scope — `reduce-complexity.md` never edits a test, so a complexity warning in one is not actionable here.

---

## Step 0 — Prepare the workspace

This task reads files, runs two analysis commands, and runs git — it never edits code, builds, or tests the app. It still needs dependencies installed for lint and FTA to run, so:

1. `git checkout master` and `git pull origin master`.
2. Run `npm install` — the analysis commands need it.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time. `npm run lint` and `npm run quality` are slow, so run each **once** and work from the output you already have.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. It has flat sections — `## ready`, `## development`, `## deferred`, `## declined` — each a plain `*` bullet list with no IDs or scores.

Collect every existing bullet from all sections into one list. This is your dedupe set. If a function is already logged as a complexity candidate anywhere in the file, even worded differently, skip it this run. Also skip a function named in a bullet about something else when a complexity refactor would collide with that bullet's own proposal — a function slated to move into a new module, for example, should not also be logged for in-file extraction.

---

## Step 2 — Read the signals

Run each of these **once** and read the full output:

```bash
npm run lint 2>&1
npm run quality 2>&1
```

From the lint output, collect every `sonarjs/cognitive-complexity` warning. Each one looks like this:

```
src/foo.ts
  42:11 warning  Refactor this function to reduce its Cognitive Complexity
                 from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

It gives you the **file**, the **line** the function starts at, the **reported complexity**, and the **allowed limit**. Record all four for every warning.

From the quality output, FTA prints a table per area, sorted worst-first, with each file's **line count** and **FTA score** (lower = better). Record the score and line count for every file that carried a complexity warning. The FTA score is context, not the selector: it tells whoever picks the item up whether they are entering a file that is otherwise healthy or one that is already under strain.

Then open each warned function and read it. You need its **name** — the lint output gives a line number, not an identifier, and a backlog entry that says "the function at line 42" is worthless the moment the file shifts. You also need enough of a read to describe, in one clause, what the function does and where its complexity actually comes from.

---

## Step 3 — Filter out what cannot be refactored in place

Cross out any candidate that `reduce-complexity.md` could not act on:

1. **The file is a test file** (`*.test.ts`, `*.test.tsx`). That task never edits a test.
2. **The complexity cannot come down without leaving the file.** If the only honest way to simplify the function is to move code into a new module, this is a modularity item, not a complexity one. Log it under `improve-modularity.md` instead, or leave it out — do not file it here.
3. **The complexity cannot come down without changing the file's public API.** An extraction that forces an exported signature to change, or breaks an existing `import`, is out of bounds for that task.
4. **The fix would span more than one source file.** `reduce-complexity.md` edits exactly one.

Note what you are **not** filtering on. `reduce-complexity.md` accepts a named work item even when the item would fail its own selection safeguards, so none of the following disqualify a candidate here:

- The file is `src/controller.ts`, `src/main.ts`, or another file that task would skip when choosing for itself.
- The file handles security, crypto, shell execution, PTY/terminal, or network work.
- The function is only slightly over the limit, or is not flagged by lint at all but reads as clearly tangled.

These do not block the entry — they change how you describe it. Any candidate in that group is **risk-sensitive**, and its backlog bullet must say so plainly, in its own sentence, so the person who picks it up knows before they open the file that they are working somewhere the default selection rules would have avoided. A risk-sensitive entry never carries a severity above **medium**.

What survives is your candidate list. Record, for each: the file, the function name and starting line, the reported complexity against the allowed limit, the file's FTA score and line count, and whether it is risk-sensitive.

---

## Step 4 — Bound the run

Cap this run at **5 new entries**. `reduce-complexity.md` resolves one function per run, so a backlog of five is already several sessions of work, and a longer list mostly goes stale as the code shifts underneath it.

If more than five candidates survive Step 3, keep the five with the strongest case: the largest margins over the allowed limit first, then the ones in files with the worst FTA scores, then the ones `git log` shows are actively churning — a tangled function nobody touches costs less than a tangled function three changes a week land in. Do not pad the list to hit the cap.

Finding zero candidates is a valid outcome. It means lint reports no cognitive-complexity warnings outside the excluded set, which is the point of the exercise. Do not invent a hotspot that is not there.

---

## Step 5 — Write each entry

Match the existing style in `product/backlog/technical-debt.md`: one `*` bullet, one paragraph, imperative and concrete, no IDs and no scores beyond the severity rating. Each bullet must:

- Name the file and the function, with the line number the warning reported.
- Give the reported complexity against the allowed limit (e.g. "34 against the allowed 15").
- Give the file's FTA score and line count, as context for what the refactor is walking into.
- Say what the function does and where the complexity comes from, in one clause — a nested retry loop, a long conditional chain, a `switch` whose arms each do real work — so the reader knows what kind of extraction is likely before they open the file.
- **Say plainly if the target is risk-sensitive**, and why (see Step 3): `src/controller.ts`, `src/main.ts`, or security, crypto, shell, PTY, or network code. Omit this sentence only when none of those apply.
- **Carry the trigger sentence, verbatim in this form:**

  ```
  Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against <function> in <file>.
  ```

  Every entry needs it, and the wording is not optional. [`resolve-technical-debt.md`](../resolve-technical-debt.md) routes an item to a hygiene playbook **only** when the entry names the playbook like this — an item that merely describes a complexity problem gets hand-planned instead, which is not what you want here. The same sentence also tells a human reader that the work is a scripted, in-file extraction with its own verification gates rather than a refactor they have to design from scratch.
- Carry a severity rating.

Rate severity by how far over the limit the function sits and how much the surrounding file is moving:

| Severity | Meaning |
|----------|---------|
| **high** | Complexity roughly double the allowed limit or worse, in a file that `git log` shows is actively changing. Every change landing here is being made by someone who cannot hold the function in their head. |
| **medium** | Substantially over the limit, or moderately over in a churning file. Also the ceiling for any risk-sensitive entry, however bad the score. |
| **low** | Barely over the limit, or well over but in a quiet corner nothing has touched in months. Worth doing, nothing is on fire. |

An entry in the right shape reads roughly like this:

```
* Reduce the cognitive complexity of `handleSessionEvent()` in `src/session-events.ts` (line 88), reported at 34 against the allowed 15 in a file scoring 62.4 FTA across 190 lines. The function dispatches every inbound session event through one nested chain of type checks, each arm doing its own state reconciliation inline, so each new event type adds another layer rather than another case. The event-shape validation and the reconnect branch are both self-contained enough to lift into local helpers without touching the file's exports. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `handleSessionEvent()` in `src/session-events.ts`. Severity: **high**.
```

---

## Step 6 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new bullets to the end of the `## development` section only. Leave `## ready`, `## deferred`, and `## declined` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file. No file under `src/` or `web/src/` may appear. If one does, you edited code, which this task never does — revert it.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new bullet names its file and function and carries the trigger sentence in the exact form given in Step 5.
4. Every risk-sensitive bullet says so, and none of them is rated **high**.
5. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 7 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log complexity hotspots
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Complexity warnings:   <total count from Step 2>
Blocked or skipped:    <count> (<file> <function>: <one-line reason>, …)
New entries added:     <count> (to product/backlog/technical-debt.md, ## development)
Entries:               <one line per new entry: file, function, complexity vs limit, severity, "risk-sensitive" if it is — or "none found">
Commit:                <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
