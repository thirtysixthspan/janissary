# Improve Code Modularity (one safe extraction or move per run)

Your job: make **one** small, safe change that lowers the complexity of **one** high-complexity file by **moving a cohesive group of its code out into a new, focused module file** — then prove you did not break anything. Alternatively, move one cohesive module into a feature subdirectory when its current location obscures ownership. Do exactly one extraction or move, then verify.

**Scope:** source files anywhere under `src/` and `web/src/`, including all nested directories, are equally eligible. Paths in this task are repository-relative. Keep code in its existing source tree and follow the owning feature’s organization. For web code, follow [`react-code-organization.md`](../../guidelines/react-code-organization.md).

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This is the **only** way we reduce a file's size and complexity here: extract a cohesive group of related code into a new file and import it back. Never compact code, strip comments, or delete blank lines to shrink a file — that hurts readability without improving the design (see [`code-guidelines.md`](../../guidelines/code-guidelines.md)).

Refactoring edits real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), or if every remaining candidate file is blocked (see "Blocked work" below).

## The work item: named, handed over, or your own pick

This task extracts from or relocates one file. Which file comes from one of three places:

1. **Named by the user at invocation** — e.g. `execute ai/tasks/hygiene/improve-modularity.md "<target>"`. The argument may be a file path, a file name, a `max-lines` suppression to retire, or a paraphrase such as "the tab manager". Resolve it to exactly one file; if nothing in the codebase matches, report that no matching file was found and stop — do not fall back to picking your own.
2. **Handed over with a backlog item** — [`resolve-technical-debt.md`](../resolve-technical-debt.md) runs this task against the file a `./product/backlog/technical-debt.md` entry names (its Step 2A). Treat that file exactly like a user-named one.
3. **Neither** — you choose the file yourself, from the signals in Step 2 and the ranking in Step 3, as written.

A named or handed-over file replaces **only** the selection in Step 3. Everything else runs unchanged: Step 1's baseline gates, Step 2's signals (you still need the before FTA score and line count for the file you were given), the **Blocked work** rules below, the Step 5 recipe, and the Step 6 verification. If the named file is blocked by one of those rules, or does not exist, say which rule blocked it and stop — never silently substitute a different file. If it is already small and simple, extract only when it was named explicitly, and say so in the report.

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe extraction work is exactly this: **extract one cohesive group of code from a high-complexity source file into one (or more) new module files you create, and import it back** — done by the Recipe in Step 5, and nothing else.

A **safe move** relocates one existing module into a focused subdirectory, for example `src/remote/channel-capture.ts` → `src/remote/channel/capture.ts`. Preserve its exported symbols and behavior, adjust its own relative imports, and update direct consumers mechanically. Do not leave a re-export shim or introduce a barrel. A location-only move need not lower the module’s FTA score.

### Blocked work — skip and pick a different file

If doing the extraction or move would require any of the following, **go back to Step 3** and pick the next-best file instead. Never ask the user — just skip and move on.

1. Changing the **public API** of a file other files depend on — i.e. changing exported symbols, signatures, or behavior. Updating import paths for a safe move is allowed. (If you move an `export`ed symbol but **re-export it from the original file** so no other file changes, that is still safe.)
2. Changing logic in **more than 1 existing source file**, or updating consumer import paths in **more than 3 existing files**. The selected file and new module file(s) do not count toward the consumer limit; consumer edits must only update paths.
3. Changing **test logic or assertions** (`*.test.ts`, `*.test.tsx`). Mechanical import-path updates for a moved module are allowed within the same 3-consumer limit; do not relocate tests in this task.

If every remaining candidate is blocked, report which files you considered and why each was blocked, and stop without changing any code.

> You may change logic in **only** the one existing source file you picked, plus the **new module file(s)** you create to receive the extracted code. For a move, you may also update import paths in at most 3 existing consumer files. Test files may receive only the mechanical import-path updates allowed above.

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
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** count and the **warnings** count. Note especially any `max-lines` (file over 200 lines) and `sonarjs/cognitive-complexity` warnings — these point straight at extraction targets.
- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user — do not start a refactor on a broken suite.
- **Quality (FTA):** `npm run quality` prints a table per area, sorted worst-first, with each file's **line count** and **FTA score** (lower = better). This is your **primary** signal for what to extract from. Write down the score and line count of the file you end up picking.

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

**A named or handed-over file skips this step's selection** — it is already chosen. Check it against the exclusions in 2 below, then go straight to Step 4.

1. From the FTA table, list the worst files across **both `src/` and `web/src/`, recursively, without preferring either tree** together with any that carry a `max-lines` or `cognitive-complexity` warning.
2. **Cross out** any file that is:
   - a `*.test.ts` / `*.test.tsx` file,
   - already small and simple (low score, comfortably under 200 lines), unless explicitly named for extraction or relocation.
3. From what remains, pick the **one** file with the **highest FTA score** — that is the one most worth splitting. Prefer a file that is over (or near) the 200-line limit, since extraction there also clears a `max-lines` error.

For a named location-only move, use the specified source and destination instead of ranking by complexity. Apply the same blocked-work rules.

State your pick in one short sentence: the file, its current FTA score and line count, and the warning(s) it carries. Write those numbers into your report draft.

---

## Step 4 — Plan the extraction (a quick note to yourself, then keep going)

For a move, identify the destination and every consumer before editing; confirm the consumer limit and feature boundaries. For an extraction, find **one cohesive group of code** to lift out whole — code that belongs together and reads naturally as its own module. Good clusters:

- a set of related pure helpers (e.g. all the parsing/formatting functions for one concern),
- the body and helpers of one over-complex function flagged by `cognitive-complexity`,
- a group of related types/constants plus the small functions that operate on them.

For an extraction, jot a one- or two-line plan: **which** group of code you will move, the **name of the new file** (`kebab-case.ts`, focused on that concern), and **what the original file will import back** from it. This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **What you may and may not do**:

- If any of points 1-3 applies → go back to Step 3 and pick a different file.
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

Perform the extraction or move. Keep the diff focused and do not reformat or tidy unrelated lines. For a move, record the original and destination paths and every consumer whose imports will change so you can restore them if verification fails.

### Recipe — extract a cohesive group into a new module file

1. **Create the new module file** beside the original or in an existing or new feature subdirectory, with a focused name describing the concern (e.g. `src/remote/channel/capture.ts` or `web/src/editor/search/matches.ts`). Avoid repeating the directory’s concern in the filename. Use `.tsx` when the module contains JSX; otherwise use `.ts`. Keep it under 200 lines too — if the group you want to move is itself huge, move a smaller cohesive subset.
2. **Move the chosen code** (functions, and the types/constants only they use) into the new file. Add whatever `import`s that code needs at the top of the new file.
3. **Export** from the new file exactly the symbols the original file still needs.
4. **In the original file**, delete the moved code and add an `import { … } from './foo-parsing.js';` for the symbols you now call.
5. **Preserve the public API.** If any moved symbol was `export`ed and is imported by *other* files, **re-export it from the original file** (`export { thing } from './foo-parsing.js';`) so no other file has to change. If you cannot keep every existing import working without editing other files → restore your changes and apply the blocked-work rules (rule 1).
6. Do **not** change behavior, call signatures, or what anything returns. Do **not** move code in a way that breaks ordering of side effects or shared module state.
7. If you cannot find a clean, self-contained group to move like this, do **not** force it — restore the original code, go back to Step 3, and pick a different file (or report that no safe extraction was available).

### Recipe — move one cohesive module into a subdirectory

1. Create the destination directory if needed and move the selected file there. For example, move `src/remote/channel-capture.ts` to `src/remote/channel/capture.ts`. Do not combine the move with an extraction or unrelated cleanup.
2. Adjust relative imports inside the moved file for its new depth, and update every consumer directly to the destination, including tests and dynamic imports. If this requires configuration changes or exceeds the consumer limit, restore and treat the candidate as blocked.
3. Preserve exports, behavior, module state, and side-effect order. Check for cycles and location-sensitive code such as `import.meta.url`; skip the move if preserving behavior requires more than mechanical path updates.
4. Search for references to the old path and confirm no unresolved consumers remain. Do not retain a compatibility file or create an `index.ts` re-export hub.

### Style

- Match nearby naming: `camelCase` functions, `PascalCase` types, `kebab-case` filenames.
- Under `src/`, relative imports use a **`.js`** extension even though the source is `.ts` (e.g. `import { x } from './channel/capture.js'`). Under `web/src/`, match the owning feature’s existing import and alias conventions. Adjust relative paths for the destination’s depth in either tree.
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

1. **TypeScript is clean.** `npm run typecheck:diff` must have no errors. A type error here almost always means a moved symbol's type is missing an import in the new file, or a re-export was forgotten — fix it in your source files. If you cannot make it clean quickly, restore the original code and report.
2. **Tests pass.** If a test now fails: try a quick, obvious fix in your source files (do **not** edit the test). If it does not pass quickly, **restore the original code** and delete only the new module file(s) you added and report what blocked you. Never edit a test to make it pass.
3. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors must be 0** (if you were clearing a `max-lines` error, it should now be gone). **Warnings must be the same or fewer** than Step 1, never higher. If a new warning or error appeared — often a missing `.js` import extension, a now-unused import, or complexity that rode along into the new file — fix it in your source files. Never silence a warning with an `eslint-disable` comment.
4. **Quality improved for an extraction.** The original file's FTA score and line count should be **lower** than Step 1. The new module file should land at a reasonable score and stay under 200 lines. If the original's score did not drop, the extraction was too small to matter — restore the original code and pick a more substantial group (or a different file).

For a location-only move, compare the destination’s FTA score and line count with the original: they should remain unchanged apart from mechanical path edits. Verify that imports resolve and no old-path references remain. If verification fails, restore the moved file and every edited consumer to their original paths and contents and remove only the destination files you created.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Target file:      <path>
New module:       <path(s) created, or destination of the moved file>
Change:           <one sentence — e.g. "moved the 4 query-parsing helpers out of database.ts into database-parsing.ts">
FTA score:        <before> -> <after>   (lines: <before> -> <after>)
Lint problems:    <before> -> <after>   (errors: <before> -> <after>)
TypeScript:       clean / <errors, if any>
Tests:            all pass / <what failed>
```

Keep it brief. Done.
