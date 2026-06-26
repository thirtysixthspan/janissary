# Improve Code Quality (one safe fix per run)

Your job: make **one** small, safe change that removes **one** code-quality warning — then prove you did not break anything. Do exactly one fix, then verify.

Refactoring edits real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

## The one safety rule (read this first)

There are two kinds of work: **safe** and **needs-permission**.

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it. Asking for permission on safe work is a mistake.

Safe work is exactly these three fixes (and nothing else), each done by its Recipe in Step 5:

- **Recipe A** — replace a repeated string with a named constant (warning `sonarjs/no-duplicate-string`).
- **Recipe B** — merge two identical local functions into one (warning `sonarjs/no-identical-functions`).
- **Recipe C** — move one self-contained block out of a too-complex function into a small helper (warning `sonarjs/cognitive-complexity`).

### Needs-permission work — STOP and ask first

**STOP and ask the user first** if doing the fix would require any of these:

1. Renaming, removing, or changing the arguments of anything declared with **`export`** (other files import it — that is a public API change).
2. Editing **more than 2 source files**, or changing import paths in more than 3 files (a new helper file does not count as one of the 2).
3. Touching **`src/controller.ts`** (the biggest, riskiest file).
4. Editing **any test file** (`*.test.ts`, `*.test.tsx`).
5. Touching **security, password/crypto, shell-execution, PTY/terminal, or network/browser** code.

If any of 1–5 is true: do NOT change any code. Show the user your plan (from Step 4), say which of 1–5 applies, and ask: **"Do you want me to proceed?"** Then wait. (This is the **only** time you ever stop to ask.)

> You may edit **only** the one source file you picked, plus (optionally) **one** new helper file you create. Never edit `fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, or any other config or test file. Leave the `score_cap` in `fta.json` alone.

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
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** count and the **warnings** count.
- **Quality (FTA):** `npm run quality` prints a table per area, sorted worst-first. Lower score = better. You only need the score of the file you end up picking.

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Read the warnings

Each `sonarjs` warning in the `npm run lint` output looks like this:

```
src/foo.ts
  42:11  warning  Refactor this function to reduce its Cognitive Complexity
                  from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

It tells you the **file**, the **line**, the problem, and the **rule name** at the end. The rule name tells you which Recipe to use:

- `sonarjs/no-duplicate-string` → Recipe A
- `sonarjs/no-identical-functions` → Recipe B
- `sonarjs/cognitive-complexity` → Recipe C

---

## Step 3 — Pick exactly one warning to fix

1. List every `sonarjs/...` warning from Step 1.
2. **Cross out** any warning whose file is:
   - a `*.test.ts` / `*.test.tsx` file,
   - `src/main.ts`,
   - `src/controller.ts`,
   - `src/pty.ts`, `src/shell.ts`, or any file whose main job is spawning processes, running a terminal, doing network, or driving a browser,
   - under `web/src/` (only consider these if no `src/` warning is left),
   - already fine (no warning).
3. From what remains, pick **one** warning, preferring this order:
   1. `sonarjs/no-duplicate-string` (Recipe A — easiest and safest)
   2. `sonarjs/no-identical-functions` (Recipe B)
   3. `sonarjs/cognitive-complexity` (Recipe C — hardest; pick only if no A or B is available)
   - If several warnings tie, pick the one in the file with the **highest FTA score** (most worth fixing).

State your pick in one short sentence: the file, the line, the rule name, and which Recipe you will use. Write the file's current FTA score into your report draft.

---

## Step 4 — Plan the fix (a quick note to yourself, then keep going)

Jot a one- or two-line plan: which function or string you will change, and the name of any new constant or helper. This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **The one safety rule**:

- If any of points 1–5 applies → STOP and ask the user (see that section).
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

**First, back up every file you are about to edit**, so you can restore it exactly if anything goes wrong:

```bash
cp src/foo.ts src/foo.ts.bak
```

Then apply the Recipe that matches your warning. Keep the diff as small as possible — do not reformat or "tidy" unrelated lines.

### Recipe A — repeated string → constant

1. Choose an `UPPER_SNAKE_CASE` name that describes the string.
2. Just below the imports, add `const NAME = '<the exact string>';`.
3. Replace **each** exact occurrence of that string literal with `NAME`. Replace whole-string matches only — never a piece of a longer string.

### Recipe B — two identical functions → one

1. Find the two functions the warning says are identical and confirm their bodies really are the same.
2. If **either** is `export`ed → STOP and ask (rule 1).
3. Otherwise keep one, delete the other, and update every caller of the deleted one to call the kept one.

### Recipe C — too-complex function → extract one helper

1. Open the flagged function at the given line.
2. Find **one** self-contained block — the body of a single `if`/`else` branch, one loop body, or a short run of statements that computes a single value — that uses **only** local variables and the function's parameters.
3. Add a new helper function **below** the current one (same file). Give it the values that block needs as parameters, and have it `return` the value the block produced. Move the block's code into it.
4. Replace the block in the original function with a call to the new helper.
5. Do **not** change the original function's parameters or what it returns. Do **not** move code that uses `this`, that reads or writes variables declared outside the block, or that contains `await` where order matters.
6. If you cannot find a clean self-contained block like that, do **not** force it — restore your backup, go back to Step 3, and pick a different warning (or report that no safe fix was available).

### Style

- Match nearby naming: `camelCase` functions, `kebab-case` filenames.
- Relative imports use a **`.js`** extension even though the source is `.ts` (e.g. `import { x } from './foo.js'`). A new helper file must follow this too.
- Add a comment only if the *why* is non-obvious; never a comment that just restates *what* the code does.

---

## Step 6 — Verify (run in this order; fix or put it back)

```bash
npm test 2>&1
npm run lint 2>&1
npm run quality 2>&1
```

Check each, in order:

1. **Tests pass.** If a test now fails: try a quick, obvious fix in your source file (do **not** edit the test). If it does not pass quickly, **restore your backup** (`cp src/foo.ts.bak src/foo.ts`, and delete any new helper file you added) and report what blocked you. Never edit a test to make it pass.
2. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors must be 0.** **Warnings must be exactly one fewer than Step 1** (the warning you fixed is gone) and never higher. If a new warning or error appeared — often a missing `.js` import extension, a now-unused variable, or complexity pushed into your new helper — fix it in your source file. Never silence a warning with an `eslint-disable` comment.
3. **Quality did not regress.** The target file's FTA score should be the same or lower than Step 1, never higher. (Recipes A and B may leave the score unchanged — that is fine.)

When all three pass, **delete the backup file(s)**: `rm src/foo.ts.bak`.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target file:      <path>
Fix:              <one sentence — e.g. "extracted parseSpec() helper from loadConfig()">
Lint warnings:    <before> -> <after>   (errors: <before> -> <after>)
FTA score:        <before> -> <after>
Tests:            all pass / <what failed>
```

Keep it brief. Done.
