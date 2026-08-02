# Reduce Code Complexity (one safe refactor per run)

Your job: make **one** small, safe change that lowers the cognitive complexity of **one** high-complexity function — by **refactoring the code within its existing file**, for example via extract-method refactoring into new local functions — then prove you did not break anything. Do exactly one refactor, then verify.

This task runs end to end on its own: given no target, it finds the worst function itself and fixes it. Given one — by the user, or by a backlog item [`find-complex-code.md`](../research/find-complex-code.md) wrote — it refactors that function instead.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This task is about complexity, not file size: **all code you touch must stay in the target file.** Never move code into a new module file — that is the job of [`ai/tasks/hygiene/improve-modularity.md`](improve-modularity.md), not this one. Never compact code, strip comments, or delete blank lines to shrink a function — that hurts readability without improving the design (see [`code-guidelines.md`](../../guidelines/code-guidelines.md)).

Refactoring edits real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), if a supplied work item is blocked by an integrity rule, or if every candidate you could pick for yourself is blocked (see "Blocked work" below).

## The work item: named, handed over, or your own pick

This task refactors one function. Which function comes from one of three places:

1. **Named by the user at invocation** — e.g. `execute ai/tasks/hygiene/reduce-complexity.md "<target>"`. The argument may be a function name, a `file.ts function()` pair, a `path:line` location, or a paraphrase such as "the worst one in the message handler". Resolve it to exactly one function.
2. **Handed over with a backlog item** — [`resolve-technical-debt.md`](../resolve-technical-debt.md) runs this task against the function a `./product/backlog/technical-debt.md` entry names (its Step 2A). Those entries are written by [`find-complex-code.md`](../research/find-complex-code.md), which records the file, the function, and its before-numbers for you. Treat that function exactly like a user-named one.
3. **Neither** — you choose the function yourself, from the signals in Step 2 and the ranking in Step 3, as written. This is a full, normal run: survey, pick, refactor, verify.

A supplied function (cases 1 and 2) replaces **only** the selection in Step 3. Everything else runs unchanged: Step 1's baseline gates, Step 2's signals (you still need the before-numbers for the function you were given), the integrity rules below, the Step 5 recipe, and the Step 6 verification. If a supplied target cannot be resolved to exactly one function — nothing matches, or several do — report what you looked for and what you found, and stop. Never silently substitute a different function.

### Selection safeguards apply to your own picks, and are waived for a supplied one

Step 3's filters exist to keep this task from wandering into risky code **of its own accord**. When the target was chosen for you, that judgment has already been made by a human or by a research task that weighed it, so **accept a supplied work item even when it would fail those filters**:

- **No complexity threshold.** Refactor the function whatever its score. If lint reports no `sonarjs/cognitive-complexity` warning for it at all, still refactor it — record "not flagged by lint" in place of the before-score in your report, and judge success on whether the function reads better, not on a warning disappearing.
- **No excluded files.** `src/controller.ts`, `src/main.ts`, and files handling security, crypto, shell execution, PTY/terminal, or network work are all in scope when named. These are the riskiest files in the tree, so a run against one is a run to take slowly: read wider before you cut, keep the extraction smaller than you otherwise would, and hold the Step 6 gates to the letter.
- **No "pick something better".** A supplied item has no next-best candidate to fall back to. The work item is the work.

When you picked the function yourself, none of that is waived — apply Step 3's exclusions in full, and move to the next candidate when one trips.

What is **never** waived, on either path, is everything that keeps the refactor honest: the tests-green gates in Step 1 and Step 6, the one-file limit, the public-API rule, the no-editing-tests rule, and the restore-your-backup discipline. Those are integrity rules, not selection rules — see below.

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly this: **extract one cohesive block of logic out of an over-complex function into one or more new, well-named functions in the same file, and call them from where the block used to live** — done by the Recipe in Step 5, and nothing else. Other complexity-reducing refactors (e.g. replacing a nested if/else chain with early returns, or a switch with a lookup table) are also safe, as long as they stay inside the target file and do not change behavior.

### Blocked work — integrity rules, no exceptions

These are not selection filters, and a supplied work item does not waive them. If reducing the target function's complexity would require any of the following, it is blocked:

1. Moving code **out of the target file** into a new or different module file — not permitted under this task (use `ai/tasks/hygiene/improve-modularity.md` for that instead).
2. Changing the **public API** of the file — i.e. you cannot keep every existing `import` working, or the signature of an exported function must change.
3. Editing **more than 1 existing source file**.
4. Editing **any test file** (`*.test.ts`, `*.test.tsx`).
5. Leaving the test suite anything other than green.

What a block means depends on where the function came from. Never ask the user either way:

- **You picked it yourself** → go back to Step 3 and take the next-best candidate. If every remaining candidate is blocked, report which files/functions you considered and why each was blocked, and stop without changing any code.
- **It was supplied** (user-named or handed over) → **stop and report which rule blocked it**, leaving the code as you found it. Do not substitute a candidate of your own.

A block is a real outcome, not a failure: it means the function's complexity is structural and needs a different playbook. Say which rule blocked it and what task likely owns the work instead. When this task was triggered from a backlog item, `resolve-technical-debt.md` Step 2A takes that report and defers the item.

> You may edit **only** the one existing source file you picked. Never edit `fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, or any other config or test file. Leave the `score_cap` in `fta.json` alone.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — See the starting state (run these, write the numbers down)

Run all four and read the output:

```bash
npm run typecheck 2>&1
npm run lint 2>&1
npm run test 2>&1
npm run quality 2>&1
```

Then record these starting numbers — you will compare against them at the end. Put them straight into your report draft (Step 7):

- **TypeScript:** `npm run typecheck` must finish with **no errors**. If it errors before you touch anything, STOP and tell the user.
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** count and the **warnings** count. Note especially the `sonarjs/cognitive-complexity` warnings — they are your extraction targets, or the before-score of the function you were handed.
- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user — do not start a refactor on a broken suite.
- **Quality (FTA):** `npm run quality` prints a table per area, sorted worst-first, with each file's **line count** and **FTA score** (lower = better). Write down the score and line count of the file you end up in, so you can confirm the score dropped afterward.

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Read the signals

Two outputs from Step 1 carry everything you need — to find a target when you have none, and to get the before-numbers for the Step 6 gates and the Step 7 report either way:

- The **lint warnings** (`npm run lint`): a `sonarjs/cognitive-complexity` warning marks a function that has grown too tangled — that function, and the line it's reported at, is a target. If you were handed a function, find its warning and write down the reported score and the allowed limit; if there is no warning for it, write down "not flagged by lint" and carry on — a supplied work item does not need one (see "Selection safeguards" above).
- The **quality table** (`npm run quality`): the FTA score and line count of each file, for ranking candidates and for the before-numbers of the file you end up in.

A `cognitive-complexity` finding looks like this in the lint output:

```
src/foo.ts
  42:11 warning  Refactor this function to reduce its Cognitive Complexity
                 from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

It tells you the **file** and the **function line** that is carrying too much branching/nesting. Note that lint reports a line, not a name — if your work item named a function and the line has drifted since the item was written, trust the name and find it in the file.

---

## Step 3 — Settle on exactly one function to refactor

**If a function was supplied** (user-named or handed over), it is already chosen — skip the selection below. Confirm it resolves to exactly one real function by opening the file and reading it, then go straight to Step 4. Do **not** re-evaluate whether it was the right choice or go looking for a worse one: a lower score than you expected, a file the exclusions below would have ruled out, or no lint warning at all are none of them reasons to switch targets. Only an integrity rule under "Blocked work" can stop that run.

**Otherwise, pick one yourself:**

1. From the lint output, list every `sonarjs/cognitive-complexity` warning in `src/`, together with the FTA score of the file it's in.
2. **Cross out** any candidate whose file is:
   - a `*.test.ts` / `*.test.tsx` file,
   - `src/main.ts`,
   - `src/controller.ts` (the biggest, riskiest file — even though it may have the highest score),
   - `src/pty.ts`, `src/shell.ts`, or any file whose main job is spawning processes, running a terminal, or doing network.
3. From what remains, pick the **one** function with the **highest reported complexity** (furthest over the allowed limit) — that is the one most worth breaking up.

These exclusions bind your own picks only; a supplied work item overrides them, as described under "Selection safeguards" above.

Either way, state the target in one short sentence: the file, the function name/line, and its complexity score (e.g. "30, allowed 15", or "not flagged by lint"). Write those numbers into your report draft.

---

## Step 4 — Plan the refactor (a quick note to yourself, then keep going)

Find **one cohesive block of logic** inside the target function to lift into a new, well-named helper — code that reads naturally as its own step. Good candidates:

- a branch of an `if`/`switch` that does a self-contained chunk of work,
- a loop body that performs one clear sub-task,
- a repeated pattern (validation, formatting, mapping) that can become a named helper called from multiple spots,
- a long chain of conditions that can become an early-return guard clause.

Jot a one- or two-line plan: **which** block you will extract, the **name of the new local function**, and **what it will take as parameters / return**. This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **What you may and may not do**:

- If a **Blocked work** rule applies → follow that section: go back to Step 3 for the next-best candidate if you picked this function yourself, or stop and report the rule if it was supplied.
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

If the *particular block of code* you first chose cannot be extracted cleanly but another one in the same function can, that is not a block — choose the other block and keep going. You are only blocked when no safe extraction exists anywhere in the target function.

---

## Step 5 — Make the change

**First, back up the existing file you are about to edit**, so you can restore it exactly if anything goes wrong:

```bash
cp src/foo.ts src/foo.ts.bak
```

Then perform the refactor. Keep the diff focused — extract the chosen block, and do not reformat or "tidy" unrelated lines.

### Recipe — extract a cohesive block into a new function, in the same file

1. **Write a new function**, in the same file, near the function you're simplifying, with a name that describes what the block does (`camelCase`, verb-first, e.g. `parseHeaderLine`).
2. **Move the chosen block's code** into the new function's body. Pass in whatever local variables it reads as parameters; return whatever it needs to hand back to the caller.
3. **Replace the block** in the original function with a call to the new function.
4. Do **not** change behavior, external call signatures, or what the original function returns. Do **not** change the order of side effects.
5. Do **not** export the new function unless another part of the same file already needs it — keep it file-private (no `export`) by default.
6. If you cannot find a clean, self-contained block to extract this way, do **not** force it — restore your backup. If you picked the function yourself, go back to Step 3 and pick a different one (or report that no safe refactor was available). If it was supplied, report that no safe refactor was available for that function and stop.

### Style

- Match nearby naming: `camelCase` functions, `PascalCase` types.
- Add a comment only if the *why* is non-obvious; never a comment that just restates *what* the code does.

---

## Step 6 — Verify (run in this order; fix or put it back)

```bash
npm run typecheck:diff 2>&1
npm run test:diff 2>&1
npm run lint:diff 2>&1
npm run quality 2>&1
```

Check each, in order:

1. **TypeScript is clean.** `npm run typecheck:diff` must have no errors. A type error here almost always means the new helper is missing a type on a parameter or return value — fix it in your source file. If you cannot make it clean quickly, restore your backup and report.
2. **Tests pass.** If a test now fails: try a quick, obvious fix in your source file (do **not** edit the test). If it does not pass quickly, **restore your backup** (`cp src/foo.ts.bak src/foo.ts`) and report what blocked you. Never edit a test to make it pass.
3. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors must be 0.** **Warnings must be the same or fewer** than Step 1 — the `sonarjs/cognitive-complexity` warning on your target function should now be gone or reduced. If the target was never flagged by lint, the bar is simply that the count did not go up. If a new warning or error appeared, fix it in your source file. Never silence a warning with an `eslint-disable` comment.
4. **Quality did not get worse.** The file's FTA score and line count should stay the same or improve. A small increase in line count from the extra function signature/braces is expected and fine; the score should not go up.

When all checks pass, **delete the backup file**: `rm src/foo.ts.bak`.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target chosen by: <user-named / backlog item "<text>" / this task>
Target file:      <path>
Target function:  <name, line>
Refactor:         <one sentence — e.g. "extracted the validation branch of parseConfig() into a new validateConfigShape() helper">
Complexity:       <before> -> <after>   (allowed: 15; or "not flagged by lint")
FTA score:        <before> -> <after>   (lines: <before> -> <after>)
Lint problems:    <before> -> <after>   (errors: <before> -> <after>)
TypeScript:       clean / <errors, if any>
Tests:            all pass / <what failed>
Waived:           <any selection safeguard a supplied work item overrode — e.g. "risk-sensitive file (src/controller.ts)" — or "none">
```

If a **Blocked work** rule stopped the run, report the target, the rule that blocked it, and which task likely owns the work instead, and say that no code was changed. When you were picking for yourself and worked through several blocked candidates first, list them with their reasons.

Keep it brief. Done.
