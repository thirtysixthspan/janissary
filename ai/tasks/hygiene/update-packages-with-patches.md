# Update All Patch-Level Packages (one batch per run)

Your job: update **every** npm package whose in-range update is a **patch-level** bump, all in one batch, and prove the project is still green. Follow the steps **in order, exactly as written** — do not skip a step or combine steps.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Only stop early for the conditions explicitly listed below.

The rule is simple: **the compiler, the linter, and the tests must be green before you start and green again after you finish.** If not green before you start, stop and tell the user. If you can't get it green again, put everything back and stop.

**No code changes — ever.** This task changes `package.json` and `package-lock.json` and nothing else. You may not edit source, tests, config, or docs to make the build green: not a type annotation, not an import, not a test expectation, not a lint suppression. A patch release that requires code changes is not a patch this task applies. There are exactly three possible outcomes, and every one of them is reached by changing which packages are installed, never by changing code:

1. The whole batch is green → merge it.
2. The batch minus one or more culprits is green → merge that, exclude the culprits.
3. Neither is green → revert everything and stop.

If you find yourself wanting to fix a file, the answer is to drop the package that broke it and leave it for [`update-package.md`](update-package.md), which is the task that is allowed to make code changes.

## The work item: the whole patch batch, always

This task takes no argument. The batch is whatever Step 3 selects mechanically from `npm outdated`.

**Never widen a range in `package.json`.** This task only ever updates within the ranges already declared, which is exactly what `npm update` does.

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

## Step 3 — Select the patch batch (mechanical, no judgment needed)

`npm outdated` prints a table with columns `Package`, `Current`, `Wanted`, `Latest`.

1. Look only at rows where `Current` and `Wanted` are **different**. Ignore the `Latest` column entirely — you are never bumping the version range in `package.json` in this task, only updating within the range it already allows.
2. Of those, keep only the **patch-level** rows: `Current` and `Wanted` have the **same major and same minor** component, and differ only in the patch component (and/or prerelease/build suffix). Examples: `4.2.1 -> 4.2.7` is in; `4.2.1 -> 4.3.0` and `4.2.1 -> 5.0.0` are out.
3. Every kept row is in the batch. Rows that dropped out are **not** this task's work — leave them for `update-package.md`.
4. If no row is patch-level, report "No patch-level updates available" plus the full `npm outdated` output, and stop.

List the batch, one line per package: `<package> <Current> -> <Wanted>`.

---

## Step 4 — Install the batch

Back up the manifest and lock file (this step rewrites both):

```bash
cp package.json package.json.bak
cp package-lock.json package-lock.json.bak
```

Install every package in the batch in a single command:

```bash
npm update <package-1> <package-2> ... <package-n>
```

(`npm update` moves each package to `Wanted` without changing its version range in `package.json`.)

Then confirm the batch actually moved:

```bash
npm outdated 2>&1
```

Any batch package still showing `Current` different from `Wanted` did not update — note it in the Step 8 report as "not applied" and carry on.

---

## Step 5 — Re-check

Run:

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
```

**All three green →** delete the backups (`rm package.json.bak package-lock.json.bak`) and go to Step 7.

**Not all green →** go to Step 6 (narrow the batch). Do **not** edit any file to make this green — see "No code changes" above.

---

## Step 6 — Narrow the batch once, then revert (only if Step 5 was not green)

A batch failure is usually one or two bad packages, not the whole set. Dropping packages is the **only** lever you have here — narrow exactly once:

1. Identify the **culprits** from the failure output — every package named in the compiler errors, the stack traces, or the failing tests. There may be one or several; list them all. If nothing names a package, treat the whole batch as the culprit and skip to the revert below.
2. Restore the baseline, then re-install the batch **without** the culprits:

   ```bash
   cp package.json.bak package.json
   cp package-lock.json.bak package-lock.json
   npm install
   npm update <every batch package except the culprits>
   ```

3. Re-run the three commands from Step 5. **All three green →** delete the backups and go to Step 7, reporting the culprits as excluded.
4. **Still not green, or the batch minus the culprits is empty →** full revert:

   ```bash
   cp package.json.bak package.json
   cp package-lock.json.bak package-lock.json
   npm install
   ```

   Confirm the three commands are green again on the restored baseline, then stop and report which packages were in the batch, which were the suspected culprits, and why the batch was abandoned. Do **not** narrow a second time, and do **not** try to rescue the batch with a code change.

---

## Step 7 — Merge the change to master

Execute `ai/tasks/workspace/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation. Use commit type `build`. Name the batch in the commit subject rather than every package (e.g. `build: apply patch-level dependency updates`), and list the individual bumps in the body.

---

## Step 8 — Report

```
Packages:      <n> updated
               <name>  <old-version> -> <new-version>
               <name>  <old-version> -> <new-version>
               ...
Excluded:      <culprit packages and why, or "none">
Not applied:   <batch packages npm left unchanged, or "none">
Compiler:      green
Lint:          green
Tests:         green
PR:            <url> (#<number>)
Status:        merged
```

If you stopped early (nothing outdated, no patch-level updates available, or the batch was fully reverted), report that in one or two sentences plus the full `npm outdated` output. Keep it brief. Done.
