# Update a Package (one package per run)

Your job: update **one** npm package to the latest version its existing `package.json` range allows, fix any code that breaks, and prove the project is still green. Do exactly one package, then verify. Follow the steps **in order, exactly as written** — do not skip a step or combine steps.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Only stop early for the conditions explicitly listed below.

The rule is simple: **the compiler, the linter, and the tests must be green before you start and green again after you finish.** If not green before you start, stop and tell the user. If you can't get it green again after two fix attempts, put the package back and stop.

## The work item: named, handed over, or your own pick

This task updates one package. Which package comes from one of three places:

1. **Named by the user at invocation** — e.g. `execute ai/tasks/hygiene/update-package.md "<package>"`. The argument is normally the package name; a paraphrase such as "the vitest one" is also fine. Resolve it to exactly one dependency in `package.json`; if it is not a dependency of this project, report that and stop — do not fall back to picking your own.
2. **Handed over with a backlog item** — [`resolve-technical-debt.md`](../resolve-technical-debt.md) runs this task against the package a `./product/backlog/technical-debt.md` entry names (its Step 2A). Treat it exactly like a user-named one.
3. **Neither** — you take the first in-range row of `npm outdated`, exactly as Step 3 describes.

A named or handed-over package replaces **only** the selection in Step 3. Everything else runs unchanged: Step 1's green gate, Step 2's `npm outdated` listing, the install in Step 4, the two fix attempts in Step 5, and the revert in Step 6. If the named package has no in-range update — `Current` and `Wanted` match — report that and stop. **Never widen the range in `package.json` to make an update possible**, even when the request names a version: this task only ever updates within the range already declared.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Confirm the project is green

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
```

All three must pass: compiler has no errors, lint has no errors (warnings are fine), every test passes.

**If any of the three is not green, STOP and tell the user.** Do not proceed.

---

## Step 2 — List outdated packages

```bash
npm outdated 2>&1
```

A non-zero exit code here is normal and expected when it lists rows — it is not a failure.

**If it prints nothing, report "No outdated packages found" and stop.**

---

## Step 3 — Pick one package (mechanical, no judgment needed)

**A named or handed-over package skips this step's selection** — it is already chosen. Find its row in the Step 2 table, confirm `Current` and `Wanted` differ (if they don't, report and stop per "The work item" above), state the pick, and go to Step 4.

`npm outdated` prints a table with columns `Package`, `Current`, `Wanted`, `Latest`.

1. Look only at rows where `Current` and `Wanted` are **different**. Ignore the `Latest` column entirely — you are never bumping the version range in `package.json` in this task, only updating within the range it already allows.
2. Take the **first such row, top to bottom**. That is your package.
3. If you already tried this exact package earlier in this run (see Step 6), skip it and take the next row instead.
4. If no row has `Current` different from `Wanted` (every remaining row only differs in `Latest`), report "No in-range updates available" plus the full `npm outdated` output, and stop.

State your pick in one line: `<package> <Current> -> <Wanted>`.

---

## Step 4 — Install the update

**Gate first — never skip this.** Before any command that writes to `node_modules/`, check the target against the known-malicious package list:

```bash
./scripts/run.mjs check-malicious-package <package>@<Wanted-version>
```

Act on the exit code:

- **0** — clean. Continue with the install below.
- **2 (BLOCKED)** — the exact target version is a known-malicious release. **Do not install it.** Record the package as tried, go back to Step 3, and take the next row.
- **3 (QUARANTINED)** — the package comes from an account compromised in a supply-chain campaign, even though this version is not itself known-bad. These campaigns propagate by publishing fresh version bumps, so treat it exactly like BLOCKED: do not install, go back to Step 3, take the next row.
- **1** — the check itself failed (for example the list is unreadable). **Stop and tell the user.** Never treat a failed check as permission to install.

A skip under 2 or 3 does **not** count against the two-revert budget in Step 6 — nothing was installed. Note it in the Step 8 report.

Once the gate returns 0, back up the manifest and lock file (this step rewrites both):

```bash
cp package.json package.json.bak
cp package-lock.json package-lock.json.bak
```

Install:

```bash
npm update <package>
```

(`npm update` moves the package to `Wanted` without changing the version range in `package.json`.)

---

## Step 5 — Re-check, fix, repeat (max 2 attempts)

Run:

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
```

**All three green →** delete the backups (`rm package.json.bak package-lock.json.bak`) and go to Step 7.

**Not all green →** this is attempt 1 of at most 2:

1. Read the compiler's error output first — it names the file, line, and the missing/changed symbol. That is almost always enough to know what to fix. Only look inside `node_modules/<package>` for the current type definitions if the compiler message alone isn't enough to tell you the new shape.
2. Edit only the files the errors point at. Do not touch anything else.
3. Re-run the three commands above.
4. If still not green, make **one more** attempt (attempt 2 of 2), same process.
5. If still not green after attempt 2, go to Step 6 (revert).

If all three are green at any point in this loop, delete the backups and go to Step 7.

---

## Step 6 — Revert (only if Step 5 never went green)

```bash
cp package.json.bak package.json
cp package-lock.json.bak package-lock.json
npm install
```

If this is the **first** package you've reverted this run, go back to Step 3 and pick the next candidate. If this is the **second** package you've reverted this run, stop — report both packages tried and why each was reverted.

---

## Step 7 — Merge the change to master

Execute `ai/tasks/workspace/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation. Use commit type `build`, unless the code fixes from Step 5 are large enough that `fix` describes the change better.

---

## Step 8 — Report

```
Package:       <name>  <old-version> -> <new-version>
Code changes:  <files touched to fix API changes, or "none needed">
Compiler:      green
Lint:          green
Tests:         green
PR:            <url> (#<number>)
Status:        merged
```

If you stopped early (nothing outdated, no in-range update available, or both attempts reverted), report that in one or two sentences plus the full `npm outdated` output. Keep it brief. Done.
