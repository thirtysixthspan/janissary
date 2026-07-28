# Work an Issue

Your job: take a work item — the simplest issue in `./product/backlog/issues.md`, or the one the user names when running this task, which need not be listed there at all — develop a plan to resolve it, implement the fix, update functional specs, update `help.md` and public documentation where the fix changes behavior they already document, record the plan in `./product/plans/complete/`, remove the issue from the issues file when that is where it came from, and merge the change to master. You change source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the issues file, and the plan file's location — nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This overrides CLAUDE.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the fix requires. Update `help.md` and files under `documentation/user-documentation/` when the fix changes behavior they already document. Write a plan file to `./product/plans/complete/`. Remove the fixed issue from `./product/backlog/issues.md`. Run `./scripts/run.mjs check-diff` after each change. Execute the full merge workflow via `ai/tasks/workspace/merge-change-to-master.md` when implementation is done.

### Forbidden — no exceptions

1. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** Every fix needs tests that cover the changed behavior. Verify with `./scripts/run.mjs check-diff`.
4. **Choosing an issue that requires significant new architecture.** If an issue would require high complexity error or prone work, pick a simpler issue instead and report why.
5. **Editing `./product/backlog/issues.md` beyond removing the fixed entry.** Only remove the line for the issue you fixed — do not reorder, rephrase, or otherwise modify the remaining entries, and never add a work item named at invocation to the file.
6. **Merging before all checks pass.** The `ai/tasks/workspace/merge-change-to-master.md` workflow handles merge; do not bypass it.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — List small fixes and pick one

1. Read `./product/backlog/issues.md` and list every issue.
2. If no issues exist **and** the task invocation named no work item, report "No issues in `./product/backlog/issues.md`" and stop. When a work item was named, an empty issues file is not a reason to stop — go on to the named-item branch below.
3. Pick the issue to fix:
   - **If a specific work item is named in the task invocation** (e.g. `execute ai/tasks/work-an-issue.md "<issue text>"`), fix that one. First look for the entry in `./product/backlog/issues.md` it refers to — the argument may be quoted text, a paraphrase, or a position such as "the second one". **If no entry matches, the named text is itself the work item**: take it at face value and fix it exactly as if it had been listed, without stopping and without adding it to the issues file. A named work item is never rejected for being absent from the backlog. Assess its complexity by reviewing the codebase to understand what areas it touches (do not use a shell loop for this); if it requires significant new architecture (rating 7+), report the assessment and stop — do not implement it.
   - **Otherwise**, for each issue, assess the complexity by reviewing the codebase to understand what areas it touches. Do not use a shell loop for this. If every issue requires significant new architecture (rating 7+), report the list with assessments and stop — do not pick one. Otherwise, pick the **first** issue listed in the file (top of the list).
4. State your pick, whether it came from the issues file or from the invocation, and why.

---

## Step 2 — Develop a plan

1. Read the project constraints in [`CLAUDE.md`](../../CLAUDE.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
2. Read every file relevant to the fix to understand the code involved.
3. Write a plan file following the format of existing plans in `./product/plans/complete/` — include a complexity rating, goal, approach, implementation steps, tests, and out-of-scope items. Write it to `./product/plans/draft/<fix-name>.md`.
4. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`:
   ```bash
   git mv ./product/plans/draft/<fix-name>.md ./product/plans/ready/<fix-name>.md
   ```

---

## Step 3 — Implement the fix

Follow the plan's implementation steps **in order**. After each step:

1. Run `./scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `ai/guidelines/code-guidelines.md` — do not compact code, strip comments, or delete spacing.

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.

---

## Step 4 — Write the tests

If the plan has a Tests section, implement every test case listed. Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Run `./scripts/run.mjs check-diff` after writing tests. All tests must pass.

---

## Step 5 — Update or create spec files

Every fix must be reflected in the functional specs under `./product/specs/`. After implementation and tests:

1. **Check the plan.** If the plan names specific spec files to update or create, do exactly that.
2. **Otherwise, find the right spec.** Read the existing specs in `./product/specs/` and identify which one(s) the fix relates to. Most fixes extend an existing spec. If no existing spec covers the area, create a new one.
3. **Write or update the spec.** Follow the existing conventions: `# Title` at the top, `### Subsection` for each aspect, prose describing user-visible behavior only — no code, no implementation details, no file paths. The spec is what the fix *does*, not how it is built. Keep additions concise and factual.

---

## Step 6 — Update help and public documentation if affected

The fix only needs a documentation update if it changes behavior that `help.md` or `documentation/user-documentation/` already describes — a changed flag, a renamed command, a corrected default, a behavior that no longer matches what's written. Do not add new documentation for behavior that wasn't previously documented; that is out of scope for this task.

1. Check `help.md` for any command, flag, or behavior description the fix changes. Update it in place if found.
2. Check `documentation/user-documentation/` for any page describing the changed behavior. Update it in place if found.
3. If neither documents the changed behavior, do nothing here — do not create new documentation.

---

## Step 7 — Promote the plan and remove the issue

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`:
   ```bash
   git mv ./product/plans/ready/<fix-name>.md ./product/plans/complete/<fix-name>.md
   ```
2. Remove the fixed issue's line from `./product/backlog/issues.md`. Only remove that single line — do not modify any other content in the file. If the work item came from the task invocation and was never listed in the file, there is nothing to remove: leave the file untouched.

---

## Step 8 — Merge the change to master

Execute `ai/tasks/workspace/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation.

---

## Step 9 — Report

Give the user a short report in this exact shape:

```
Issue:          <the issue text from ./product/backlog/issues.md, or the work item as named in the invocation when it was not listed there>
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
PR:             <url> (#<number>)
Status:         merged
```

Keep it brief. Done.
