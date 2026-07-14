# Reduce Code Complexity (one safe refactor per run)

Your job: make **one** small, safe change that lowers the cognitive complexity of **one** high-complexity function — by **refactoring the code within its existing file**, for example via extract-method refactoring into new local functions — then prove you did not break anything. Do exactly one refactor, then verify.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This task is about complexity, not file size: **all code you touch must stay in the target file.** Never move code into a new module file — that is the job of [`ai/tasks/improve-modularity.md`](improve-modularity.md), not this one. Never compact code, strip comments, or delete blank lines to shrink a function — that hurts readability without improving the design (see [`code-guidelines.md`](../guidelines/code-guidelines.md)).

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step.

Refactoring edits real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), or if every remaining candidate file/function is blocked (see "Blocked work" below).

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly this: **extract one cohesive block of logic out of an over-complex function into one or more new, well-named functions in the same file, and call them from where the block used to live** — done by the Recipe in Step 5, and nothing else. Other complexity-reducing refactors (e.g. replacing a nested if/else chain with early returns, or a switch with a lookup table) are also safe, as long as they stay inside the target file and do not change behavior.

### Blocked work — skip and pick a different file/function

If reducing the complexity would require any of the following, **go back to Step 3** and pick the next-best candidate instead. Never ask the user — just skip and move on.

1. Moving code **out of the target file** into a new or different module file — not permitted under this task (use `ai/tasks/improve-modularity.md` for that instead).
2. Changing the **public API** of the file — i.e. you cannot keep every existing `import` working, or the signature of an exported function must change.
3. Editing **more than 1 existing source file**.
4. Touching **`src/controller.ts`** (the biggest, riskiest file) — even though it may have the highest score.
5. Editing **any test file** (`*.test.ts`, `*.test.tsx`).
6. Touching **security, password/crypto, shell-execution, PTY/terminal, or network** code.

If every remaining candidate is blocked, report which files/functions you considered and why each was blocked, and stop without changing any code.

> You may edit **only** the one existing source file you picked. Never edit `fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, or any other config or test file. Leave the `score_cap` in `fta.json` alone.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

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
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** count and the **warnings** count. Note especially any `sonarjs/cognitive-complexity` warnings — these are your extraction targets.
- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user — do not start a refactor on a broken suite.
- **Quality (FTA):** `npm run quality` prints a table per area, sorted worst-first, with each file's **line count** and **FTA score** (lower = better). Write down the score and line count of the file you end up picking, so you can confirm the score dropped afterward.

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Read the signals

You are looking for the function that most needs its complexity broken up. One place tells you:

- The **lint warnings** (`npm run lint`): a `sonarjs/cognitive-complexity` warning marks a function that has grown too tangled — that function, and the line it's reported at, is your target.

A `cognitive-complexity` finding looks like this in the lint output:

```
src/foo.ts
  42:11 warning  Refactor this function to reduce its Cognitive Complexity
                 from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

It tells you the **file** and the **function line** that is carrying too much branching/nesting.

---

## Step 3 — Pick exactly one function to refactor

1. From the lint output, list every `sonarjs/cognitive-complexity` warning in `src/`, together with the FTA score of the file it's in.
2. **Cross out** any candidate whose file is:
   - a `*.test.ts` / `*.test.tsx` file,
   - `src/main.ts`,
   - `src/controller.ts` (needs-permission — only with the user's go-ahead),
   - `src/pty.ts`, `src/shell.ts`, or any file whose main job is spawning processes, running a terminal, or doing network.
3. From what remains, pick the **one** function with the **highest reported complexity** (furthest over the allowed limit) — that is the one most worth breaking up.

State your pick in one short sentence: the file, the function name/line, and its complexity score (e.g. "30, allowed 15"). Write those numbers into your report draft.

---

## Step 4 — Plan the refactor (a quick note to yourself, then keep going)

Find **one cohesive block of logic** inside the target function to lift into a new, well-named helper — code that reads naturally as its own step. Good candidates:

- a branch of an `if`/`switch` that does a self-contained chunk of work,
- a loop body that performs one clear sub-task,
- a repeated pattern (validation, formatting, mapping) that can become a named helper called from multiple spots,
- a long chain of conditions that can become an early-return guard clause.

Jot a one- or two-line plan: **which** block you will extract, the **name of the new local function**, and **what it will take as parameters / return**. This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **What you may and may not do**:

- If any of points 1–6 applies → go back to Step 3 and pick a different function.
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

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
6. If you cannot find a clean, self-contained block to extract this way, do **not** force it — restore your backup, go back to Step 3, and pick a different function (or report that no safe refactor was available).

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
3. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors must be 0.** **Warnings must be the same or fewer** than Step 1 — the `sonarjs/cognitive-complexity` warning on your target function should now be gone or reduced. If a new warning or error appeared, fix it in your source file. Never silence a warning with an `eslint-disable` comment.
4. **Quality did not get worse.** The file's FTA score and line count should stay the same or improve. A small increase in line count from the extra function signature/braces is expected and fine; the score should not go up.

When all checks pass, **delete the backup file**: `rm src/foo.ts.bak`.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target file:      <path>
Target function:  <name, line>
Refactor:         <one sentence — e.g. "extracted the validation branch of parseConfig() into a new validateConfigShape() helper">
Complexity:       <before> -> <after>   (allowed: 15)
FTA score:        <before> -> <after>   (lines: <before> -> <after>)
Lint problems:    <before> -> <after>   (errors: <before> -> <after>)
TypeScript:       clean / <errors, if any>
Tests:            all pass / <what failed>
```

Keep it brief. Done.
