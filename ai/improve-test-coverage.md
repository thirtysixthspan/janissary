# Improve Test Coverage (one file per run)

Your job: add tests that raise this project's test coverage. Do exactly **one file's worth** of new tests, then verify it worked.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

This work is always allowed. When your plan contains **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just write the tests and run them.

Safe work is:

- **Creating new test files** named `*.test.ts` or `*.test.tsx`, placed next to the file they test.
- **Adding new `it(...)` / `describe(...)` blocks** to an existing test file.
- Using a small mock for a **single** function or value when a test needs one.

### Blocked work — skip and pick a different target

Do **not** attempt any of the following. If your plan for the chosen file requires one of these, **go back to Step 3** and pick the next-lowest file instead. Never ask the user — just skip and move on.

1. Editing, deleting, or rewriting an **existing test**.
2. Changing **any file that is not a `*.test.ts(x)` file** (for example, editing real source code "to make it testable").
3. Replacing a **whole module** with a mock (e.g. `vi.mock('./something.js')` for a module that many files import).
4. Testing **security, password/crypto, shell command, PTY/terminal, or network** code.
5. Writing **more than 3** new test files in one run.

If every remaining candidate is blocked, report what you found (file, why it was blocked) and stop without writing any tests.

> Note: when coverage goes up, the test tool automatically rewrites the threshold numbers inside `vitest.config.ts`. That is normal and expected. It does **not** count as a source-code change, and you must **not** edit those numbers yourself.

---

## Step 0 — Prepare the workspace

Execute `ai/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Run coverage and lint

Run both commands and read all of their output:

```bash
npm run coverage 2>&1
npm run lint 2>&1
```

Always run them fresh. Do not trust an old `coverage/` folder or earlier output in the conversation.

- **Tests:** `npm run coverage` executes the whole test suite. Every test must be passing before you add anything. If any test is already failing, STOP and tell the user — do not build on a broken suite.
- **Lint:** note the summary line — `✖ N problems (E errors, W warnings)`. Write down E and W. There must be **0 errors** to proceed. Warnings are pre-existing guidance and are expected.

---

## Step 2 — Read the coverage table

At the bottom of the Step 1 output is a table with one row per file. The columns are:

```
File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
```

The **right-most column ("Uncovered Line #s")** lists the exact line numbers that have no test. This is all the information you need. **You do not need to open or parse `coverage/coverage-final.json`.**

---

## Step 3 — Pick exactly one target file

Choose the target with this exact procedure:

1. Look only at rows whose file path starts with **`src/`** (these are the core logic; `web/src/` is lower priority).
2. **Cross out** any row that is:
   - `src/main.ts` (program entry point — nothing to test).
   - `src/pty.ts` (only runs inside a real terminal).
   - Already at **90% or higher** in the `% Lines` column.
3. From the rows that remain, pick the **one with the lowest `% Lines`**.
   - Tie? Pick the lower `% Branch`.
   - Still tied? Pick the one with the most numbers in the "Uncovered Line #s" column.
4. **Open that source file** and look at the uncovered lines from the table. If you discover the file can only run by launching a **real web browser, a real terminal/PTY, a real network connection, or a real spawned program** (look for imports of `playwright`, `node-pty`, `ws`, or `child_process`), then skip it and go back to step 3 to take the next-lowest file.

State your pick in one short paragraph: the file path, its current `% Lines`, and the uncovered line numbers you will target.

---

## Step 4 — Plan the tests (a quick note to yourself, then keep going)

Jot down a short, plain list of the tests you will add. This is a note for yourself, not a message to send to the user — do **not** post it and wait for a reply.

- One bullet per test: its name, the input you give it, and the output or behavior you expect.
- Say which test file they go in. If no `*.test.ts` file exists next to the source file, you will create one.
- If a test needs a mock, name the one function or value you will mock and what it returns. Keep mocks as small as possible so the real code still runs.

Now check your plan against **What you may and may not do** above:

- If any of points 1–5 applies → go back to Step 3 and pick a different file.
- Otherwise (your plan is all **safe work**) → go straight to Step 5 and write the tests **now, on your own, without asking.**

---

## Step 5 — Write the tests

Create or extend the test file. Match the project's existing style exactly:

- Import test tools from vitest: `import { describe, it, expect } from 'vitest';` (add `vi` only if you mock).
- **Relative imports must end in `.js`, even though the source file is `.ts`.** Example: to test `src/foo.ts`, import `from './foo.js'`.
- Put the test file right next to the source file (same folder), named `<name>.test.ts` (or `.test.tsx` for a React component).

Skeleton to copy:

```ts
import { describe, it, expect } from 'vitest';
import { functionUnderTest } from './FILENAME.js'; // .js on purpose

describe('functionUnderTest', () => {
  it('returns X when given Y', () => {
    expect(functionUnderTest(Y)).toBe(X);
  });
});
```

---

## Step 6 — Verify

Run both commands again, in this order:

```bash
npm run lint 2>&1
npm run coverage 2>&1
```

Fix any lint issues before looking at coverage — a lint error in a new test file will also distort the coverage output.

Then check, in this order:

1. **Lint is no worse** — errors must be 0 (same as Step 1). Warnings must be equal to or fewer than Step 1. If a new lint error or warning appeared in a file you added or edited, fix it in that file. Do **not** suppress with `eslint-disable` — fix the underlying code.
2. **The whole test suite passes** — every test, including ones you did not write. Adding tests must **never** make a previously-passing test fail.
   - If one of **your new** tests fails because the test itself is wrong, fix the test and re-run.
   - If a test fails because the real source code looks buggy, do **not** change the source — stop and report the suspected bug to the user.
   - If you broke a previously-passing test, or the suite will not go green without editing source code or other tests, **delete the test file(s) you added** and report what blocked you. Never edit source or existing tests just to make the suite pass.
3. **Coverage went up** — the target file's `% Lines` is higher than in Step 2.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target file: <path>
Tests added: <count> in <test file path>
% Lines:    <before> -> <after>
% Branch:   <before> -> <after>
Lint:       <before E errors, W warnings> -> <after>
Tests:      all pass / <what failed>
```

Keep it brief. Done.
