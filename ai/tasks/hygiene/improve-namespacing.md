# Improve Code Namespacing (one directory namespace per run)

Your job: make **one** safe, mechanical change that improves the codebase's organization by **moving a cohesive group of related files that share a naming prefix out of a flat directory and into a new or existing sub-directory that gives them a logical namespace** — renaming each file to drop the now-redundant prefix, and updating every import that points at or out of those files so nothing breaks. Do exactly one namespace, then verify.

For example, the flat files `src/acp-loop.ts`, `src/acp-manager.ts`, `src/acp-runner.ts`, `src/acp-tools.ts` all share the `acp-` prefix and belong together. They can move into `src/acp/` as `loop.ts`, `manager.ts`, `runner.ts`, `tools.ts` — the directory now carries the namespace, so the prefix is dropped from each filename. The same opportunity exists in `web/src/` and at any depth under either source tree: `src/remote/channel-capture.ts` → `src/remote/channel/capture.ts`, or `web/src/editor/search-panel.tsx` → `web/src/editor/search/panel.tsx`.

Throughout this task, **`<base>` is the selected parent directory**, such as `src`, `web/src`, `src/remote`, or `web/src/editor`. A group is identified by **both `<base>` and `<prefix>`** and moves only immediate sibling files into `<base>/<prefix>/`. Never combine matching prefixes from different parents or move files between the server and web trees. Preserve each file's `.ts` or `.tsx` extension. For web groups, follow [`react-code-organization.md`](../../guidelines/react-code-organization.md) and preserve feature boundaries.

**A file's colocated test moves with it — always.** Every existing `<base>/<prefix>-name.test.ts` or `.test.tsx` moves into the namespace beside its source as `<base>/<prefix>/name.test.ts` or `.test.tsx`. Tests are part of the group, not a separate concern: `src/acp-loop.test.ts` → `src/acp/loop.test.ts`. A namespace move that relocates the source files but leaves their `.test.ts(x)` files behind in `<base>/` is **wrong and incomplete** — the tests keep the prefix while the code they exercise does not, and the colocation the codebase relies on is broken. Move source and test together, every time.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This is a **pure move-and-rewire refactor**: relocate whole files and fix the import paths that point at or out of them. Never change what any file *does* — no logic edits, no signature changes, no reformatting of code that only moved. The **only** edits you make inside any file are to the **strings in its import/export statements**. If you find yourself changing anything else, stop.

Moving files rewires real code, so the rule is simple: **the tests must pass before you start and still pass after. If you cannot keep them passing, put the files back the way they were** (the exact undo command is in Step 5).

Do the steps below **in order**. Do not skip steps. Do not invent your own process. This task is deliberately mechanical — follow the rules literally rather than trying to be clever, and lean on the compiler (Step 6) to catch every mistake for you.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start (Step 1), or if every remaining candidate group is blocked (see "Blocked work" below).

## The work item: named, handed over, or your own pick

This task moves one prefix group. Which group comes from one of three places:

1. **Named by the user at invocation** — e.g. `execute ai/tasks/hygiene/improve-namespacing.md "<prefix>"`. The argument may be a bare prefix (`widget`), a glob (`src/remote/channel-*` or `web/src/editor/search-*`), a source file (`src/remote/channel-capture.ts`), a target directory (`src/remote/channel/`), or a paraphrase such as "the monitor files". Resolve it to exactly one parent-and-prefix group under `src/` or `web/src/`. A path fixes the parent directory; for a bare prefix, survey both trees recursively. If several parents match, use the supplied context to resolve one; if it remains ambiguous, report the matching groups and stop. If no matching sibling files exist, report that no matching group was found and stop. Do not fall back to picking your own.
2. **Handed over with a backlog item** — [`resolve-technical-debt.md`](../resolve-technical-debt.md) runs this task against the prefix a `./product/backlog/technical-debt.md` entry names (its Step 2A). Entries written by [`find-namespaces.md`](../research/find-namespaces.md) name that prefix explicitly; treat it exactly like a user-named one.
3. **Neither** — you choose the group yourself, from the cluster survey in Step 2 and the ranking in Step 3, as written.

A named or handed-over group replaces **only** the selection in Step 3. Everything else runs unchanged: Step 1's baseline gates, Step 3's file listing (you still enumerate the group's exact files and its bare entry), the **Blocked work** rules below, the Step 5 recipe, and the Step 6 compiler loop. If the named group is blocked by one of those rules — a name collision, a needed logic edit, a config file hard-coding a path — say which rule blocked it and stop; never silently substitute a different group. The fewer-than-3-files rule does not block a named group: when the request names it, move it however small it is.

## What you may and may not do

### Safe work — DO IT AUTOMATICALLY, never ask

When your plan is **only** safe work, you **must carry it out yourself, start to finish, without stopping.** Do **not** ask "Do you want me to proceed?". Do **not** pause to show the plan for approval. Do **not** wait for confirmation. Just make the change and verify it.

Safe work is exactly this: **move one cohesive prefix group of files into a new or existing namespace directory, drop the redundant prefix from each filename, and update every import path that points at or out of those files** — done by the Recipe in Step 5, and nothing else. When the namespace directory already exists, preserve its existing files and add only flat files that are clearly related to the code already in that namespace; an existing namespace may receive any number of related files. Because the whole namespace moves as a unit, this **includes moving and re-pathing the group's colocated `*.test.ts(x)` files** — that is expected here, and is *not* the forbidden "editing a test" from other tasks, because you change only their location and import paths, never their assertions or logic.

### Blocked work — skip and pick a different group

If doing the move would require any of the following, **go back to Step 3** and pick the next-best group instead. Never ask the user — just skip and move on.

1. Changing any file's **behavior, logic, exports' shapes, or call signatures** — a namespace move only relocates files and rewrites import *paths*. If a group can't be moved without a logic edit, it's blocked.
2. A **new** group too small to be a namespace — fewer than **3** source files sharing the prefix. Two files don't justify creating a directory; an existing namespace may receive any number of clearly related flat files. This rule governs your *own* pick only — a group named at invocation or handed over with a backlog item is never blocked by its size (see "The work item" above).
3. A **name collision**: dropping the prefix would make a moved file collide with an existing file in `<base>/<prefix>/` or with another moved file (e.g. both `acp-loop.ts` and some `acp/loop.ts` would land on `src/acp/loop.ts`). An existing target directory is not blocked; inspect it and add only files that belong to that namespace.

If every remaining candidate group is blocked, report which groups you considered and why each was blocked, and stop without moving any files.

> **The only files you may touch:** (a) the files in the one group you picked — you *move* them; and (b) any file, anywhere in `src/` or `web/src/`, that imports a moved file — you edit **only the import path string** in it. You may **not** edit any file's logic, move code *within* a file, change any test's assertions, or reformat anything.

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

- **TypeScript:** `npm run typecheck` must finish with **no errors**. If it errors before you touch anything, STOP and tell the user — do not start a move on a project that doesn't compile.
- **Lint:** near the end of `npm run lint` there is a summary line like `✖ 16 problems (0 errors, 16 warnings)`. Write down the **errors** and **warnings** counts. A namespace move should leave both **unchanged**.
- **Tests:** they must be **green** (all passing). If any test is already failing **before** you touch anything, STOP and tell the user.
- **Quality (FTA):** `npm run quality` prints a table per area. A namespace move does not change any file's score or line count — treat this as a **must-not-regress** check, not a target to improve.

Always run these fresh. Do not trust earlier output in the conversation. If any of the three gates (TypeScript clean, tests green) is not met, stop now.

---

## Step 2 — Find the prefix clusters

You are looking for a group of flat files that share a leading `prefix-` and clearly form one concern. Also list the namespace directories that already exist, because a flat prefix may belong in an existing namespace rather than a newly-created one:

Survey both trees recursively, counting source files by their **parent directory and leading prefix**. Exclude colocated tests from the source count:

```bash
rg --files src web/src -g '*.ts' -g '*.tsx' | awk '
  /\.test\.tsx?$/ { next }
  {
    parent = $0; sub(/\/[^/]+$/, "", parent)
    name = $0; sub(/^.*\//, "", name)
    if (name !~ /-/) next
    sub(/-.*/, "", name)
    print parent "/" name
  }
' | sort | uniq -c | sort -rn
find src web/src -type d -print | sort
```

Each row identifies a separate candidate namespace, with its source count and target directory. For example, `src/remote/channel` counts only `channel-*.ts(x)` siblings in `src/remote/`, not files elsewhere. Rows with **3 or more** source files are opportunities for a new namespace. Rows with 1–2 files are eligible for your own pick only when that exact target directory already exists and the files clearly belong there. Named or handed-over groups remain eligible regardless of size.

---

## Step 3 — Pick exactly one group to namespace

**A named or handed-over group skips sub-steps 1–4 below** — it is already chosen. Check it against **Blocked work**, then continue at "Now list the **exact flat files** in the group" further down this step, which you still do in full.

1. From the counts, list every parent-and-prefix group under `src/` or `web/src/` with **3+ source files**, plus any prefix whose target directory `<base>/<prefix>/` already exists and has clearly related code. An existing namespace may qualify with any number of related flat files; do not reject it solely because it has fewer than three.
2. For each existing namespace candidate, read the directory's files and the flat `<base>/<prefix>-*.ts(x)` files together. Include only files that are related to the code already in the namespace; leave coincidental or unrelated prefix matches flat.
3. **Cross out** any group that is blocked by **What you may and may not do** (a new group with fewer than 3 source files, a name collision, would need a logic edit), already fully namespaced, or only *coincidentally* shares a prefix (unrelated files that happen to start with the same word — a namespace must be one real concern).
4. From what remains, prefer an existing namespace with a clearly related set of files or a new group of **3 to 6 source files**. A moderate group is the least error-prone; that is the goal here. Only pick a larger one if no moderate one is available. Among eligible groups, pick the one whose files most obviously belong together.

State your pick in one short sentence: the parent directory, prefix, and how many source and test files it has. Write those into your report draft.

Now list the **exact flat files** in the group so nothing is guessed later. For an existing namespace, this list may contain any number of related source files and their colocated tests:

```bash
find <base> -maxdepth 1 -type f \( -name '<prefix>-*.ts' -o -name '<prefix>-*.tsx' \) -print | sort
```

Use this listing to build your definitive move list, **including every existing `*.test.ts(x)` companion** of each selected source. Check both test extensions; a `.tsx` source may have a `.test.ts` companion or vice versa. Move all existing companions together; do not invent tests where none exist. Exclude unrelated prefix matches from both the source and test move lists. Existing namespace files are not move targets; they remain in place. Also check for a **bare** entry file that matches the prefix exactly:

```bash
find <base> -maxdepth 1 -type f \( -name '<prefix>.ts' -o -name '<prefix>.tsx' \) -print
```

If a related `<base>/<prefix>.ts` or `.tsx` exists, it is part of the move and becomes `<base>/<prefix>/index.ts` or `.tsx`, preserving the extension. Include any existing colocated bare-entry tests as `index.test.ts(x)` too. If neither exists, there is no bare entry — do **not** create one. We never invent a barrel `index.ts` where none existed; callers import files directly (see [`../guidelines/imports-and-barrel-files.md`](../../guidelines/imports-and-barrel-files.md)).

---

## Step 4 — Write the move inventory (a note to yourself, then keep going)

Before touching anything, write down — for yourself, not as a message to send — the complete inventory. This is what keeps a large move from losing track:

**A. The move list.** One line per file, `old → new`, prefix dropped:

```
<base>/<prefix>-loop.ts        → <base>/<prefix>/loop.ts
<base>/<prefix>-loop.test.ts   → <base>/<prefix>/loop.test.ts
<base>/<prefix>-manager.ts     → <base>/<prefix>/manager.ts
...
<base>/<prefix>.ts             → <base>/<prefix>/index.ts     (only if a bare entry exists)
```

Drop **only** the leading `<prefix>-` segment; keep the rest (`harness-recording-file.ts` → `recording-file.ts`).

**B. The inbound importer list.** Every file that imports one of the moved files. Find them all:

```bash
rg -n -F '<prefix>' src web/src -g '*.ts' -g '*.tsx'
```

Read each hit. The ones that matter are **import/require/mock paths** — lines like `from '.../<prefix>-name.js'`, `import('.../<prefix>-name.js')`, or `vi.mock('.../<prefix>-name.js')`. (Hits that are string literals, comments, or command names — not module paths — do not move; leave them.) Resolve each path to its actual old target and match it against the move inventory. A matching prefix alone is insufficient: the same prefix can exist in another parent directory. Include references to the bare entry, exports, dynamic imports, requires, mocks, and configured aliases such as `@shared/`. Note which files contain such paths. These, plus the moved files themselves, are the only files you will edit.

Re-check the plan against **What you may and may not do**. If any blocked-work rule applies → go back to Step 3. Otherwise → go to Step 5 and make the change **now, on your own, without asking.**

---

## Step 5 — Make the change

Do the three sub-steps **in order**: move, then rewire, then let the compiler catch the rest.

### 5a — Move every file with `git mv`

Create the directory only when it does not already exist, then move each file from your inventory on its own line. Existing namespace files stay where they are:

```bash
mkdir -p <base>/<prefix>
git mv <base>/<prefix>-loop.ts <base>/<prefix>/loop.ts
git mv <base>/<prefix>-loop.test.ts <base>/<prefix>/loop.test.ts
git mv <base>/<prefix>-manager.ts <base>/<prefix>/manager.ts
git mv <base>/<prefix>-manager.test.ts <base>/<prefix>/manager.test.ts
```

Follow each source `git mv` with moves for all its existing `.test.ts(x)` companions. Preserve extensions; use `.tsx` in the commands for `.tsx` files. Repeat for every line in your move list, source and test alike. If a bare entry exists, move it to `index.ts` or `index.tsx` and move its existing test companions to `index.test.ts(x)`.

Then sanity-check that the moves match your inventory exactly:

```bash
git status
```

You should see one rename per file in your list — **including a rename for every selected `.test.ts(x)` file** — and nothing else. Repeat the Step 3 listing and confirm no selected source or test remains at its old path. Unrelated prefix matches that were excluded from the inventory stay in place. If any source or test file is missing from the renames, you skipped it — move it now.

### 5b — Rewire import paths using two mechanical rules

Use the old-to-new inventory to identify module targets, then apply these two rules. Rewrite only references to files that actually moved, even when another directory contains the same prefix.

> **Rule IN — inbound (files that did NOT move).** In every import/export/require/mock **path string** that resolves to a moved file, replace its filename segment **`<prefix>-name` with `<prefix>/name`**. That's the whole edit; the number of leading `../` never changes.
> - `from '../acp-loop.js'` → `from '../acp/loop.js'`
> - `from './acp-manager.js'` → `from './acp/manager.js'`
> - `vi.mock('../acp-tools.js')` → `vi.mock('../acp/tools.js')`
> - Bare entry only: rewrite a path resolving to the moved bare entry to `<prefix>/index`, preserving its import extension (e.g. `from './acp.js'` → `from './acp/index.js'`).

> **Rule OUT — outbound (imports written INSIDE a moved file).** Each moved file dropped one directory level deeper, so classify every import line in it:
> 1. **Package / built-in specifier** (e.g. `'react'`, `'node:fs'`): **leave it unchanged.** Configured aliases such as `@shared/` are module paths, not packages: if their target moved, apply Rule IN to the target segment; otherwise leave them unchanged. Moving the importer does not change an alias's base.
> 2. **Relative path resolving to another file in the move inventory**: rewrite to a sibling — drop the leading `./` or `../` depth and the prefix, leaving `./<name>.js`. E.g. `./acp-manager.js` → `./manager.js`.
> 3. **Relative path resolving to the moved bare entry** (`./<prefix>.js`, or its existing web import form): → `./index.js`.
> 4. **Any other relative path** (`./x.js`, `../y.js`, `./sub/z.js`): **add one parent level, replacing an initial `./` with `../` or an initial `../` with `../../`.** E.g. `./config.js` → `../config.js`; `../util.js` → `../../util.js`; `./sub/z.js` → `../sub/z.js`.

Apply Rule IN to each inbound importer from your list, and Rule OUT to each moved file. Under `src/`, preserve NodeNext runtime extensions on relative paths (`.js` for `.ts`, `.jsx` for `.tsx`, and `.json` where applicable). Under `web/src/`, preserve the existing import style, including extensionless paths; do not append `.js` to extensionless web imports. Apply the examples above with each path's existing extension. For example, `src/remote/channel-capture.ts` moves to `src/remote/channel/capture.ts`, so an inbound `./remote/channel-capture.js` becomes `./remote/channel/capture.js`; `web/src/editor/search-panel.tsx` moves to `web/src/editor/search/panel.tsx`, so an inbound `./search-panel` becomes `./search/panel`. Change **nothing** else in any file.

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
rg -n '<prefix>-loop' src web/src -g '*.ts' -g '*.tsx'
```

(substitute each stem: `<prefix>-manager`, `<prefix>-runner`, …; also search for the old bare entry if one moved). Resolve hits against the inventory so identically named files in other directories remain untouched. Any hit that is an **import/require/mock path** is a straggler — fix it with Rule IN and re-run typecheck. Hits that are plain strings, comments, or unrelated identifiers are fine; leave them.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Namespace:        <base>/<prefix>/   (from <base>/<prefix>-*)
Files moved:      <n> source + <n> test   (old -> new, one per line)
Bare entry:       <base>/<prefix>.ts(x) -> <base>/<prefix>/index.ts(x)   (or: none; list tests too)
Imports rewired:  <n> inbound files, <n> moved files re-pathed
Typecheck loop:   clean after <n> pass(es)
Tests:            all pass / <what failed>
Lint problems:    <before> -> <after>   (must be unchanged)
Quality (FTA):    unchanged / <what moved>
```

Keep it brief. Done.
