# Fix a Small Issue

Your job: pick the simplest issue from `docs/small-fixes.md`, develop a plan to resolve it, implement the fix, update functional specs, record the plan in `docs/plans/complete/`, remove the issue from the small-fixes file, and merge the change to master. You change source code, tests, spec files, the small-fixes file, and the plan file's location — nothing else.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures, no `for`/`while` loops, no variable expansion (`$var`, `$(...)`), no redirects (`2>/dev/null`, `>file`, `>>file`), no pipes (`|`). Commands with control-flow, expansion, redirects, or pipes require manual approval and will stall an unattended run. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

This overrides CLAUDE.md's "Capturing command output" guidance (capture to a variable, then `grep` it repeatedly) for this task: that pattern relies on `$(...)` and pipes, which stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the fix requires. Write a plan file to `docs/plans/complete/`. Remove the fixed issue from `docs/small-fixes.md`. Run `./scripts/run.mjs check-diff` after each change. Execute the full merge workflow via `ai/merge-change-to-master.md` when implementation is done.

### Forbidden — no exceptions

1. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** Every fix needs tests that cover the changed behavior. Verify with `./scripts/run.mjs check-diff`.
4. **Choosing an issue that requires significant new architecture.** If an issue would require a complexity rating of 7+, pick a simpler issue instead and report why.
5. **Editing `docs/small-fixes.md` beyond removing the fixed entry.** Only remove the line for the issue you fixed — do not reorder, rephrase, or otherwise modify the remaining entries.
6. **Merging before all checks pass.** The `ai/merge-change-to-master.md` workflow handles merge; do not bypass it.

---

## Step 1 — Install dependencies

Run `npm install` to ensure dependencies are up to date before doing anything else.

---

## Step 2 — List small fixes and pick the simplest

1. Read `docs/small-fixes.md` and list every issue.
2. For each issue, assess the complexity by reviewing the codebase to understand what areas it touches. Do not use a shell loop for this.
3. If no issues exist, report "No issues in `docs/small-fixes.md`" and stop.
4. If every issue requires significant new architecture (rating 7+), report the list with assessments and stop — do not pick one.
5. Otherwise, pick the issue with the **lowest** estimated complexity. State your pick and why.

---

## Step 3 — Develop a plan

1. Read the project constraints in [`CLAUDE.md`](../CLAUDE.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
2. Read every file relevant to the fix to understand the code involved.
3. Write a plan file following the format of existing plans in `docs/plans/complete/` — include a complexity rating, goal, approach, implementation steps, tests, and out-of-scope items. Write it to `docs/plans/draft/<fix-name>.md`.
4. After the plan is written, move it from `docs/plans/draft/` to `docs/plans/ready/`:
   ```bash
   git mv docs/plans/draft/<fix-name>.md docs/plans/ready/<fix-name>.md
   ```

---

## Step 4 — Implement the fix

Follow the plan's implementation steps **in order**. After each step:

1. Run `./scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `CODE_GUIDELINES.md` — do not compact code, strip comments, or delete spacing.

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.

---

## Step 5 — Write the tests

If the plan has a Tests section, implement every test case listed. Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Run `./scripts/run.mjs check-diff` after writing tests. All tests must pass.

---

## Step 6 — Update or create spec files

Every fix must be reflected in the functional specs under `spec/`. After implementation and tests:

1. **Check the plan.** If the plan names specific spec files to update or create, do exactly that.
2. **Otherwise, find the right spec.** Read the existing specs in `spec/` and identify which one(s) the fix relates to. Most fixes extend an existing spec. If no existing spec covers the area, create a new one.
3. **Write or update the spec.** Follow the existing conventions: `# Title` at the top, `### Subsection` for each aspect, prose describing user-visible behavior only — no code, no implementation details, no file paths. The spec is what the fix *does*, not how it is built. Keep additions concise and factual.

Spec files are markdown and do not affect `check-diff`, so no verification run is needed after this step.

---

## Step 7 — Promote the plan and remove the issue

1. Move the plan file from `docs/plans/ready/` to `docs/plans/complete/`:
   ```bash
   git mv docs/plans/ready/<fix-name>.md docs/plans/complete/<fix-name>.md
   ```
2. Remove the fixed issue's line from `docs/small-fixes.md`. Only remove that single line — do not modify any other content in the file.

---

## Step 8 — Final verification

1. Run `./scripts/run.mjs check-diff` one last time. It must pass clean.
2. Manually verify the behavior if the plan's Verification section describes manual steps. If manual verification is not possible in this environment, note that in the report.

---

## Step 9 — Merge the change to master

Execute `ai/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation.

---

## Step 10 — Report

Give the user a short report in this exact shape:

```
Issue:          <the issue text from small-fixes.md>
Plan:           docs/plans/ready/<file> → docs/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
PR:             <url> (#<number>)
Status:         merged
```

Keep it brief. Done.
