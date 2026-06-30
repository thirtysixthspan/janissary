# Improve Code Quality (one safe extraction per run)

Your job: make **one** small, safe change that lowers the complexity of **one** high-complexity file by **moving a cohesive group of its code out into a new, focused module file** — then prove you did not break anything. Do exactly one extraction, then verify.

This is the **only** way we reduce a file's size and complexity here: extract a cohesive group of related code into a new file and import it back. Never compact code, strip comments, or delete blank lines to shrink a file — that hurts readability without improving the design (see [`CODE_GUIDELINES.md`](../CODE_GUIDELINES.md)).

Refactoring edits real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly this: **extract one cohesive group of code from a high-complexity source file into one (or more) new module files you create, and import it back** — done by the Recipe in Step 5, and nothing else.

### Blocked work — skip and pick a different file

If doing the extraction would require any of the following, **go back to Step 3** and pick the next-best file instead. Never ask the user — just skip and move on.

1. Changing the **public API** of a file other files depend on — i.e. you cannot keep every existing `import` working. (If you move an `export`ed symbol but **re-export it from the original file** so no other file changes, that is still safe.)
2. Editing **more than 1 existing source file**, or changing import paths in more than 3 files (the new module file(s) you create do not count).
3. Touching **`src/controller.ts`** (the biggest, riskiest file) — even though it has the highest score.
4. Editing **any test file** (`*.test.ts`, `*.test.tsx`).
5. Touching **security, password/crypto, shell-execution, PTY/terminal, or network/browser** code.

If every remaining candidate is blocked, report which files you considered and why each was blocked, and stop without changing any code.

> You may edit **only** the one existing source file you picked, plus the **new module file(s)** you create to receive the extracted code. Never edit `fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, or any other config or test file. Leave the `score_cap` in `fta.json` alone.

---

## Step 1 — See the starting state (run these, write the numbers down)

Run all three and read the output:

```bash
npm test 2>&1
npm run lint 2>&1
npm run quality 2>&1
```

Then record these starting numbers — you will compare against them at the end. Put them straight into your report draft (Step 7):

- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user — do not start a refactor on a broken suite.
- **Quality (FTA):** `npm run quality` prints a table per area, sorted worst-first, with each file's **line count** and **FTA score** (lower = better). This is your **primary** signal for what to extract from. Write down the score and line count of the file you end up picking.
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** count and the **warnings** count. Note especially any `max-lines` (file over 200 lines) and `sonarjs/cognitive-complexity` warnings — these point straight at extraction targets.

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Read the signals

You are looking for the file that most needs code moved out of it. Two places tell you:

- The **FTA table** (`npm run quality`): the top rows are the worst files. A high score usually means the file is both long and complex — a prime candidate to split.
- The **lint warnings** (`npm run lint`): a `max-lines` error means the file is over the 200-line limit and *must* shed code into a new module; a `sonarjs/cognitive-complexity` warning marks a function that has grown too tangled and often signals a cluster worth lifting out whole.

A `max-lines` or `cognitive-complexity` finding looks like this in the lint output:

```
src/foo.ts
  1:1   error    File has too many lines (243). Maximum allowed is 200  max-lines
  42:11 warning  Refactor this function to reduce its Cognitive Complexity
                 from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

It tells you the **file** (and, for complexity, the **function line**) that is carrying too much.

---

## Step 3 — Pick exactly one file to extract from

1. From the FTA table, list the worst `src/` files together with any that carry a `max-lines` or `cognitive-complexity` warning.
2. **Cross out** any file that is:
   - a `*.test.ts` / `*.test.tsx` file,
   - `src/main.ts`,
   - `src/controller.ts` (needs-permission — only with the user's go-ahead),
   - `src/pty.ts`, `src/shell.ts`, or any file whose main job is spawning processes, running a terminal, doing network, or driving a browser,
   - under `web/src/` (only consider these if no `src/` candidate is left),
   - already small and simple (low score, comfortably under 200 lines).
3. From what remains, pick the **one** file with the **highest FTA score** — that is the one most worth splitting. Prefer a file that is over (or near) the 200-line limit, since extraction there also clears a `max-lines` error.

State your pick in one short sentence: the file, its current FTA score and line count, and the warning(s) it carries. Write those numbers into your report draft.

---

## Step 4 — Plan the extraction (a quick note to yourself, then keep going)

Find **one cohesive group of code** to lift out whole — code that belongs together and reads naturally as its own module. Good clusters:

- a set of related pure helpers (e.g. all the parsing/formatting functions for one concern),
- the body and helpers of one over-complex function flagged by `cognitive-complexity`,
- a group of related types/constants plus the small functions that operate on them.

Jot a one- or two-line plan: **which** group of code you will move, the **name of the new file** (`kebab-case.ts`, focused on that concern), and **what the original file will import back** from it. This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **What you may and may not do**:

- If any of points 1–5 applies → go back to Step 3 and pick a different file.
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

**First, back up the existing file you are about to edit**, so you can restore it exactly if anything goes wrong:

```bash
cp src/foo.ts src/foo.ts.bak
```

Then perform the extraction. Keep the diff focused — move the chosen group of code, and do not reformat or "tidy" unrelated lines.

### Recipe — extract a cohesive group into a new module file

1. **Create the new module file** next to the original, with a focused `kebab-case` name describing the concern (e.g. `src/foo-parsing.ts`). Keep it under 200 lines too — if the group you want to move is itself huge, move a smaller cohesive subset.
2. **Move the chosen code** (functions, and the types/constants only they use) into the new file. Add whatever `import`s that code needs at the top of the new file.
3. **Export** from the new file exactly the symbols the original file still needs.
4. **In the original file**, delete the moved code and add an `import { … } from './foo-parsing.js';` for the symbols you now call.
5. **Preserve the public API.** If any moved symbol was `export`ed and is imported by *other* files, **re-export it from the original file** (`export { thing } from './foo-parsing.js';`) so no other file has to change. If you cannot keep every existing import working without editing other files → STOP and ask (rule 1).
6. Do **not** change behavior, call signatures, or what anything returns. Do **not** move code in a way that breaks ordering of side effects or shared module state.
7. If you cannot find a clean, self-contained group to move like this, do **not** force it — restore your backup, go back to Step 3, and pick a different file (or report that no safe extraction was available).

### Style

- Match nearby naming: `camelCase` functions, `PascalCase` types, `kebab-case` filenames.
- Relative imports use a **`.js`** extension even though the source is `.ts` (e.g. `import { x } from './foo.js'`). The new module file and the import that points to it must both follow this.
- Add a comment only if the *why* is non-obvious; never a comment that just restates *what* the code does.

---

## Step 6 — Verify (run in this order; fix or put it back)

```bash
npm test 2>&1
npm run lint 2>&1
npm run quality 2>&1
```

Check each, in order:

1. **Tests pass.** If a test now fails: try a quick, obvious fix in your source files (do **not** edit the test). If it does not pass quickly, **restore your backup** (`cp src/foo.ts.bak src/foo.ts`, and delete the new module file(s) you added) and report what blocked you. Never edit a test to make it pass.
2. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors must be 0** (if you were clearing a `max-lines` error, it should now be gone). **Warnings must be the same or fewer** than Step 1, never higher. If a new warning or error appeared — often a missing `.js` import extension, a now-unused import, or complexity that rode along into the new file — fix it in your source files. Never silence a warning with an `eslint-disable` comment.
3. **Quality improved.** The original file's FTA score and line count should be **lower** than Step 1. The new module file should land at a reasonable score and stay under 200 lines. If the original's score did not drop, the extraction was too small to matter — restore the backup and pick a more substantial group (or a different file).

When all three pass, **delete the backup file**: `rm src/foo.ts.bak`.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target file:      <path>
New module:       <path of the file you created>
Extraction:       <one sentence — e.g. "moved the 4 query-parsing helpers out of database.ts into database-parsing.ts">
FTA score:        <before> -> <after>   (lines: <before> -> <after>)
Lint problems:    <before> -> <after>   (errors: <before> -> <after>)
Tests:            all pass / <what failed>
```

Keep it brief. Done.
