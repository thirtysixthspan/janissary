# Improve Code Namespacing (one directory namespace per run)

Your job: make **one** safe, mechanical change that improves the codebase's organization by **moving a cohesive group of related files that share a naming prefix out of a flat directory and into a new or existing sub-directory that gives them a logical namespace** — renaming each file to drop the now-redundant prefix, and updating every import that points at or out of those files so nothing breaks. Do exactly one namespace, then verify.

For example, the flat files `src/acp-loop.ts`, `src/acp-manager.ts`, `src/acp-runner.ts`, `src/acp-tools.ts` all share the `acp-` prefix and belong together. They can move into `src/acp/` as `loop.ts`, `manager.ts`, `runner.ts`, `tools.ts` — the directory now carries the namespace, so the prefix is dropped from each filename. The same opportunity exists for `src/agent-*`, `src/harness-*`, and other prefix clusters.

**A file's colocated test moves with it — always.** Every `src/<prefix>-name.test.ts` moves into the namespace beside its source as `src/<prefix>/name.test.ts`. Tests are part of the group, not a separate concern: `src/acp-loop.test.ts` → `src/acp/loop.test.ts`. A namespace move that relocates the source files but leaves their `.test.ts` files behind in `src/` is **wrong and incomplete** — the tests keep the prefix while the code they exercise does not, and the colocation the codebase relies on is broken. Move source and test together, every time.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This is a **pure move-and-rewire refactor**: relocate whole files and fix the import paths that point at or out of them. Never change what any file *does* — no logic edits, no signature changes, no reformatting of code that only moved. The **only** edits you make inside any file are to the **strings in its import/export statements**. If you find yourself changing anything else, stop.

Moving files rewires real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the files back the way they were** (the exact undo command is in Step 5).

Do the steps below **in order**. Do not skip steps. Do not invent your own process. This task is deliberately mechanical — follow the rules literally rather than trying to be clever, and lean on the compiler (Step 6) to catch every mistake for you.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), or if every remaining candidate group is blocked (see "Blocked work" below).

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly this: **move one cohesive prefix group of files into a new or existing namespace directory, drop the redundant prefix from each filename, and update every import path that points at or out of those files** — done by the Recipe in Step 5, and nothing else. When the namespace directory already exists, preserve its existing files and add only flat files that are clearly related to the code already in that namespace; an existing namespace may receive any number of related files. Because the whole namespace moves as a unit, this **includes moving and re-pathing the group's colocated `*.test.ts(x)` files** — that is expected here, and is *not* the forbidden "editing a test" from other tasks, because you change only their location and import paths, never their assertions or logic.

### Blocked work — skip and pick a different group

If doing the move would require any of the following, **go back to Step 3** and pick the next-best group instead. Never ask the user — just skip and move on.

1. Changing any file's **behavior, logic, exports' shapes, or call signatures** — a namespace move only relocates files and rewrites import *paths*. If a group can't be moved without a logic edit, it's blocked.
2. A **new** group too small to be a namespace — fewer than **3** source files sharing the prefix. Two files don't justify creating a directory; an existing namespace may receive any number of clearly related flat files.
3. A **name collision**: dropping the prefix would make a moved file collide with an existing file in `src/<prefix>/` or with another moved file (e.g. both `acp-loop.ts` and some `acp/loop.ts` would land on `src/acp/loop.ts`). An existing target directory is not blocked; inspect it and add only files that belong to that namespace.
4. Touching **`src/controller.ts`** — if it is one of the files you'd have to *move*, the group is blocked (it's the biggest, riskiest file). It may still *import* the moved files; updating those import paths in it is fine and expected.
5. A **config or build file hard-codes an exact old path.** Glob patterns like `src/**/*.ts` in `tsconfig.json`, `vitest`/`vite` config, or `eslint.config.mjs` already cover sub-directories and need no change. But if `package.json`, a script, or a config literally names `src/acp-loop.ts` (not a glob), the group is blocked — skip it.

If every remaining candidate group is blocked, report which groups you considered and why each was blocked, and stop without moving any files.

> **The only files you may touch:** (a) the files in the one group you picked — you *move* them; and (b) any file, anywhere in `src/` or `web/src/`, that imports a moved file — you edit **only the import path string** in it. You may **not** edit any file's logic, move code *within* a file, change any test's assertions, or reformat anything.

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

- **TypeScript:** `npm run typecheck` must finish with **no errors**. If it errors before you touch anything, STOP and tell the user — do not start a move on a project that doesn't compile.
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** and **warnings** counts. A namespace move should leave both **unchanged**.
- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user.
- **Quality (FTA):** `npm run quality` prints a table per area. A namespace move does not change any file's score or line count — treat this as a **must-not-regress** check, not a target to improve.

Always run these fresh. Do not trust earlier output in the conversation. If any of the three gates (TypeScript clean, tests green) is not met, stop now.

---

## Step 2 — Find the prefix clusters

You are looking for a group of flat files that share a leading `prefix-` and clearly form one concern. Also list the namespace directories that already exist, because a flat prefix may belong in an existing namespace rather than a newly-created one:

```bash
ls src/*.ts | grep -vE '\.test\.ts$' | sed -E 's#src/##; s#-.*##' | sort | uniq -c | sort -rn
find src -mindepth 1 -maxdepth 1 -type d -print | sort
```

Each row is a candidate namespace: the count is how many source files share that prefix, and the name is the prefix. Rows with **3 or more** files are real opportunities for a new namespace (e.g. `acp`, `harness`, `agent`). Rows with 1–2 files are eligible only when the corresponding namespace directory already exists and the files clearly belong there.

---

## Step 3 — Pick exactly one group to namespace

1. From the counts, list every `src/` prefix group with **3+ source files**, plus any prefix whose target directory `src/<prefix>/` already exists and has clearly related code. An existing namespace may qualify with any number of related flat files; do not reject it solely because it has fewer than three.
2. For each existing namespace candidate, read the directory's files and the flat `src/<prefix>-*.ts` files together. Include only files that are related to the code already in the namespace; leave coincidental or unrelated prefix matches flat.
3. **Cross out** any group that is blocked by **What you may and may not do** (a new group with fewer than 3 source files, a name collision, would need a logic edit, includes `src/controller.ts` among the files to move, hard-coded in config), already fully namespaced, or only *coincidentally* shares a prefix (unrelated files that happen to start with the same word — a namespace must be one real concern).
4. From what remains, prefer an existing namespace with a clearly related set of files or a new group of **3 to 6 source files**. A moderate group is the least error-prone; that is the goal here. Only pick a larger one if no moderate one is available. Among eligible groups, pick the one whose files most obviously belong together.

State your pick in one short sentence: the prefix and how many source and test files it has. Write those into your report draft.

Now list the **exact flat files** in the group so nothing is guessed later. For an existing namespace, this list may contain any number of related source files and their colocated tests:

```bash
ls src/<prefix>-*.ts
```

This is your definitive move list, and it **includes the `*.test.ts` files** — that glob matches them too. Every selected source file *and* its `.test.ts` twin is on this list and must move. Confirm the pairs: if you see `<prefix>-name.ts`, you should also see `<prefix>-name.test.ts` right below it, and both move together. Existing namespace files are not move targets; they remain in place. Also check for a **bare** entry file that matches the prefix exactly:

```bash
ls src/<prefix>.ts 2>&1
```

If `src/<prefix>.ts` exists, it is part of the move and becomes `src/<prefix>/index.ts`. If it doesn't exist (the `ls` errors), there is no bare entry — do **not** create one. We never invent a barrel `index.ts` where none existed; callers import files directly (see [`../guidelines/imports-and-barrel-files.md`](../guidelines/imports-and-barrel-files.md)).

---

## Step 4 — Write the move inventory (a note to yourself, then keep going)

Before touching anything, write down — for yourself, not as a message to send — the complete inventory. This is what keeps a large move from losing track:

**A. The move list.** One line per file, `old → new`, prefix dropped:

```
src/<prefix>-loop.ts        → src/<prefix>/loop.ts
src/<prefix>-loop.test.ts   → src/<prefix>/loop.test.ts
src/<prefix>-manager.ts     → src/<prefix>/manager.ts
...
src/<prefix>.ts             → src/<prefix>/index.ts     (only if a bare entry exists)
```

Drop **only** the leading `<prefix>-` segment; keep the rest (`harness-recording-file.ts` → `recording-file.ts`).

**B. The inbound importer list.** Every file that imports one of the moved files. Find them all:

```bash
grep -rn "<prefix>-" src web --include=*.ts --include=*.tsx
```

Read each hit. The ones that matter are **import/require/mock paths** — lines like `from '.../<prefix>-name.js'`, `import('.../<prefix>-name.js')`, or `vi.mock('.../<prefix>-name.js')`. (Hits that are string literals, comments, or command names — not module paths — do not move; leave them.) Note which files contain such paths. These, plus the moved files themselves, are the only files you will edit.

Re-check the plan against **What you may and may not do**. If any point 1–5 applies → go back to Step 3. Otherwise → go to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

Do the three sub-steps **in order**: move, then rewire, then let the compiler catch the rest.

### 5a — Move every file with `git mv`

Create the directory only when it does not already exist, then move each file from your inventory on its own line. Existing namespace files stay where they are:

```bash
mkdir -p src/<prefix>
git mv src/<prefix>-loop.ts src/<prefix>/loop.ts
git mv src/<prefix>-loop.test.ts src/<prefix>/loop.test.ts
git mv src/<prefix>-manager.ts src/<prefix>/manager.ts
git mv src/<prefix>-manager.test.ts src/<prefix>/manager.test.ts
```

Notice each source `git mv` is immediately followed by its `.test.ts` twin — do this for **every** file. Repeat for every line in your move list, source and test alike. If a bare entry exists: `git mv src/<prefix>.ts src/<prefix>/index.ts`.

Then sanity-check that the moves match your inventory exactly:

```bash
git status
```

You should see one rename per file in your list — **including a rename for every `.test.ts` file** — and nothing else. Confirm no `src/<prefix>-*.test.ts` is left behind (`ls src/<prefix>-*.test.ts` should error with "No such file"). If any source or test file is missing from the renames, you skipped it — move it now.

### 5b — Rewire import paths using two mechanical rules

There are only two kinds of edits, and each is a literal string substitution. Do not reason about directory depth — apply the rule.

> **Rule IN — inbound (files that did NOT move).** In every import/require/mock **path string** that names a moved file, replace the substring **`<prefix>-` with `<prefix>/`**. That's the whole edit; the number of leading `../` never changes.
> - `from '../acp-loop.js'` → `from '../acp/loop.js'`
> - `from './acp-manager.js'` → `from './acp/manager.js'`
> - `vi.mock('../acp-tools.js')` → `vi.mock('../acp/tools.js')`
> - Bare entry only: replace `<prefix>.js` at the end of the path with `<prefix>/index.js` (e.g. `from './acp.js'` → `from './acp/index.js'`).

> **Rule OUT — outbound (imports written INSIDE a moved file).** Each moved file dropped one directory level deeper, so classify every import line in it:
> 1. **Package / built-in specifier** (starts with a letter, `@`, or `node:` — e.g. `'react'`, `'node:fs'`): **leave it unchanged.**
> 2. **Points at another file in the same group** (the path contains `<prefix>-`): rewrite to a sibling — drop the leading `./` or `../` depth and the prefix, leaving `./<name>.js`. E.g. `./acp-manager.js` → `./manager.js`.
> 3. **Points at the old bare entry** (`./<prefix>.js`): → `./index.js`.
> 4. **Any other relative path** (`./x.js`, `../y.js`, `./sub/z.js`): **prepend one `../`.** E.g. `./config.js` → `../config.js`; `../util.js` → `../../util.js`; `./sub/z.js` → `../sub/z.js`.

Apply Rule IN to each inbound importer from your list, and Rule OUT to each moved file. Keep the **`.js`** extension on every relative path (NodeNext requires it; the source is `.ts` but the import says `.js`). Change **nothing** else in any file.

If you are ever unsure which `../` count Rule OUT needs, make your best guess and move on — Step 6 (the compiler) will name the exact file and unresolved path, and you fix it then. Do not agonize; the compiler is your safety net.

### If you need to undo

If the move gets tangled and you cannot get it clean, revert everything this task did and go back to Step 3 (or report that no safe namespace was available). This is the reliable undo — `git checkout .` does **not** undo a staged `git mv`, so use:

```bash
git reset --hard HEAD
git clean -fd src web
```

`reset --hard` restores every tracked file (returning the moved files to their old names) and `git clean -fd src web` deletes the now-empty new directory and any leftover new files. This discards all uncommitted work under `src`/`web`, which — after Step 0 — is only this task's own changes.

---

## Step 6 — Verify with the compiler-driven fix loop

This is where mistakes get caught and fixed. Run typecheck first; it pinpoints every broken path.

```bash
npm run typecheck 2>&1
```

**The fix loop:**

1. Read each error. A namespace-move error is always a module-resolution error — TypeScript names the file it's in and the import path it can't resolve. It is one of exactly two mistakes: an **inbound** path where you didn't apply Rule IN, or an **outbound** path in a moved file with the wrong number of `../` (Rule OUT case 4). Fix the path string; touch nothing else.
2. Re-run `npm run typecheck 2>&1`.
3. Repeat until it reports **no errors**.

Guardrail against looping forever: the error count must **drop on every pass**. If you complete a pass and the count did not go down (you're guessing at the same path, or an error isn't a path problem), **stop guessing** — run the reliable undo in Step 5 and report what blocked you. Do not thrash.

Once TypeScript is clean, run the rest — in this order:

```bash
npm run test 2>&1
npm run lint 2>&1
npm run quality 2>&1
```

- **Tests pass.** Every test stays green. A failure is again a stale import/mock path (in a moved test or a file it imports) — fix the **path**, never a test's assertions. If it won't go green quickly, undo (Step 5) and report.
- **Lint is no worse.** The `✖ … problems (… errors, … warnings)` line must match Step 1 — **errors 0**, warnings the **same** count. A new finding is usually a dropped `.js` extension or an import left unused/misordered by a re-path — fix it in the source. Never silence with `eslint-disable`.
- **Quality did not regress.** FTA scores and line counts should be **unchanged** (files only moved). If a score changed, you edited more than a path — find and revert that stray edit.

Finally, confirm no old path survives. For **each** old filename stem in your move list, grep and inspect:

```bash
grep -rn "<prefix>-loop" src web --include=*.ts --include=*.tsx
```

(substitute each stem: `<prefix>-manager`, `<prefix>-runner`, …). Any hit that is an **import/require/mock path** is a straggler — fix it with Rule IN and re-run typecheck. Hits that are plain strings, comments, or unrelated identifiers are fine; leave them.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Namespace:        src/<prefix>/   (from src/<prefix>-*)
Files moved:      <n> source + <n> test   (old -> new, one per line)
Bare entry:       src/<prefix>.ts -> src/<prefix>/index.ts   (or: none)
Imports rewired:  <n> inbound files, <n> moved files re-pathed
Typecheck loop:   clean after <n> pass(es)
Tests:            all pass / <what failed>
Lint problems:    <before> -> <after>   (must be unchanged)
Quality (FTA):    unchanged / <what moved>
```

Keep it brief. Done.
