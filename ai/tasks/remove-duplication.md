# Remove Code Duplication (one clone per run)

Your job: remove **one** duplicated block of code, then prove nothing broke. Do exactly one clone, then verify.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

Deduplication edits real code that other files may import, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the code back the way it was.**

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), or if every remaining candidate clone is blocked (see "Blocked work" below).

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly these three fixes (and nothing else), each done by its Recipe in Step 5:

- **Recipe 1 — within-file** (preferred, safest): two blocks in the **same** file → one local helper in that same file. No other file changes.
- **Recipe 2 — move to the owner file**: the shared block clearly belongs to one of the two files (e.g. formatting logic → `state-format.ts`); put it there and import it at the other site. Two files change.
- **Recipe 3 — new shared file**: neither file owns it → put the shared block in a new `src/<name>.ts` and import it at both sites. Three files change (the new file + the two sites).

Adding a **new** function (even an exported one) is safe. Renaming or removing an **existing** export is not (see below).

### Blocked work — skip and pick a different clone

If removing the clone would require any of the following, **go back to Step 3** and pick the next clone instead. Never ask the user — just skip and move on.

1. Renaming, removing, or changing the arguments of an **existing** `export` (other files import it).
2. Editing **more than 3 files** in total.
3. Touching **`src/controller.ts`** (the biggest, riskiest file — its clones are high-value but not for an unattended run).
4. A helper that would be shared **between `src/` and `web/src/`** (that needs a build change).
5. Editing **any test file** (`*.test.ts`, `*.test.tsx`).
6. Touching **security, password/crypto, shell-execution, PTY/terminal, or network/browser** code.

If every remaining clone is blocked, list each one and why it was blocked in your report, and stop without changing any code.

> You may edit **only** the clone-site files, plus (optionally) **one** new helper file you create. Never edit `.jscpd.json`, `fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, any other config file, or any test file. Leave the `threshold` in `.jscpd.json` alone.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — See the starting state (run these, write the numbers down)

Run all three and read the output:

```bash
npm test 2>&1
npm run lint 2>&1
npm run duplication 2>&1
```

Record these starting numbers — you will compare against them at the end. Put them straight into your report draft (Step 7):

- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user — do not start on a broken suite.
- **Lint:** near the end of `npm run lint` is a line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** and **warnings** counts.
- **Duplication:** near the end of `npm run duplication` is a line `Found N clones.` — write down **N**. The table just above it has a `Total:` row; in its `Duplicated lines` column is a percentage like `152 (2.47%)` — write down that **%**. (Ignore the promotional lines at the very bottom.)

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Read the clone list

`npm run duplication` prints each clone as two lines, like this:

```
Clone found (typescript)
 - commands/state.ts [11:64 - 34:58]
   state-format.ts [4:57 - 24:115]
```

Reading it:

- The two lines are the **two copies** of the same code: file, then `[startLine:startCol - endLine:endCol]`.
- **Same file name on both lines = a within-file clone** (Recipe 1, the safest). Two different files = a cross-file clone.
- **Clone size in lines ≈ `endLine − startLine`** (jscpd does not print it). The two sides may differ by a line or two; use the bigger number. You only need this for ranking, so a rough count is fine.
- **Path gotcha:** jscpd drops the scan-root prefix. A path like `messaging.ts` is really **`src/messaging.ts`**, and `commands/state.ts` is **`src/commands/state.ts`**. If a file is not under `src/`, it is under `web/src/`. When in doubt, search for the file by name before editing.

---

## Step 3 — Pick exactly one clone to remove

1. List every clone from Step 2.
2. **Cross out** any clone where **either** side is:
   - a `*.test.ts` / `*.test.tsx` file,
   - `src/main.ts`,
   - `src/controller.ts`,
   - `src/pty.ts`, `src/shell.ts`, or any file whose main job is spawning processes, running a terminal, doing network, or driving a browser,
   - and cross out any clone whose two sides are split across `src/` and `web/src/`.
3. From what remains, pick **one**, in this order:
   1. **Any within-file clone** (same file on both lines) — pick the largest of these. These are the safest.
   2. If there are no within-file clones left, pick the **largest cross-file clone**.
4. Open both sides and read the duplicated code. If removing it cleanly would require renaming/removing an existing `export`, or editing more than 3 files → it is needs-permission (rules 1–2); cross it out and pick the next one.

State your pick in one sentence: both file paths (with the real `src/` prefix), the line ranges, the rough size, and whether it is within-file or cross-file.

---

## Step 4 — Plan the fix (a quick note to yourself, then keep going)

Jot a one- or two-line plan: the name of the helper you will create and which file it lives in, and what each clone site becomes (a call to the helper). This is a note for **you**, not a message to send — do **not** post it and wait for a reply.

Check the plan against **What you may and may not do**:

- If any of points 1–6 applies → go back to Step 3 and pick a different clone.
- Otherwise (all safe work) → go straight to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

**First, back up every file you are about to edit**, so you can restore it exactly if anything goes wrong:

```bash
cp src/foo.ts src/foo.ts.bak
```

Then apply the Recipe that matches your clone. Keep the diff as small as possible — do not reformat or "tidy" unrelated lines.

### Recipe 1 — within-file (same file on both lines)

1. Confirm both blocks are inside function bodies, not whole `export`ed declarations.
2. Add a new helper function (not exported) **below** the second block in the same file. Give it the values the block needs as parameters; have it `return` what the block produced.
3. Replace **both** blocks with a call to the helper.
4. Nothing else changes — no new imports, no other files.

### Recipe 2 — move the block into the file that owns it

1. Decide which of the two files clearly owns the logic (e.g. formatting → `state-format.ts`).
2. In that file, add a **new exported** helper (or reuse one that already does exactly this). Adding a new export is fine; do **not** rename or change an existing export.
3. In the other file, import the helper and replace its block with a call.
4. Only these two files change.

### Recipe 3 — new shared file (only if neither file owns it)

1. Create `src/<descriptive-name>.ts` with the shared function exported:
   ```ts
   export function sharedThing(/* params */) {
     // the duplicated logic, once
   }
   ```
2. At **each** clone site, import it and replace the block with a call:
   ```ts
   import { sharedThing } from './descriptive-name.js'; // .js on purpose
   ```
3. Only three files change (new file + the two sites).

If you open the code and cannot see a clean way to extract it (for example the two ranges overlap, or the block depends on lots of surrounding variables), **do not force it** — restore your backup, go back to Step 3, and pick a different clone (or report that no safe fix was available).

### Style

- Match nearby naming: `camelCase` functions, `kebab-case` filenames.
- Relative imports use a **`.js`** extension even though the source is `.ts` (`import { x } from './foo.js'`). A new helper file must follow this.
- Add a comment only if the *why* is non-obvious; never one that just restates *what* the code does.

---

## Step 6 — Verify (run in this order; fix or put it back)

```bash
npm run lint 2>&1
npm test 2>&1
npm run duplication 2>&1
```

Check each, in order:

1. **Lint is no worse.** Look at the `✖ … problems (… errors, … warnings)` line again. **Errors and warnings must each be the same as Step 1 or lower — never higher.** A new error after a dedup is almost always a missing `.js` import extension or an import left unused after you deleted a block — fix it in your source file. Never silence anything with an `eslint-disable` comment.
2. **Tests pass.** If a test now fails, your change moved or renamed something a test relied on. Try the obvious fix in your source file (run lint first — a broken import shows up clearly there but as a confusing crash in tests). If it does not pass quickly, **restore your backups** (`cp src/foo.ts.bak src/foo.ts`, and delete any new file you created) and report what blocked you. Never edit a test to make it pass.
3. **Duplication went down.** In the new `npm run duplication` output, **the clone you targeted must be gone**, and the `Total:` row percentage must be the same or lower than Step 1 — never higher. If your clone still appears, you updated only one of the two sides; fix the other.

When all three pass, **delete the backup file(s)**: `rm src/foo.ts.bak`.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Clone removed:  <file A> [lines] ↔ <file B> [lines]
Fix:            <one sentence — e.g. "extracted buildTabState() into tab-state.ts">
Duplication:    <before %> -> <after %>   (clones: <before N> -> <after N>)
Lint:           <before E errors, W warnings> -> <after>
Tests:          all pass / <what failed>
```

Keep it brief. Done.
