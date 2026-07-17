# Fix a Bug

Your job: take a reported bug from `./product/backlog/bugs.md` — the first one listed under `## ready`, or the specific bug the user names when running this task — **replicate it** to confirm the faulty behavior, determine the **correct** behavior from the bug report together with the functional specs and the code, implement a fix, **verify** the fix resolves the replicated failure, add a **regression test** that would fail without the fix and passes with it, update functional specs and public documentation where the fix changes behavior they already document, record the plan in `./product/plans/complete/`, remove the bug from the bugs file, and open a pull request that documents the replication steps and leaves the fix for a human to merge. You change source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the bugs file, and the plan file's location — nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures, no `for`/`while` loops, no variable expansion (`$var`, `$(...)`), no redirects (`2>/dev/null`, `>file`, `>>file`), no pipes (`|`). Commands with control-flow, expansion, redirects, or pipes require manual approval and will stall an unattended run. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step.

**No subagents, no background agents.** Do every step yourself — never launch a subagent (Task/Agent tool, `fork`, or otherwise) to research, explore, replicate, or implement any part of this task on your behalf.

This overrides CLAUDE.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Run read-only commands to replicate the reported bug. Edit source, tests, CSS, and spec files as the fix requires. Update `help.md` and files under `documentation/user-documentation/` when the fix changes behavior they already document. Write a plan file under `./product/plans/` and move it through `draft/` → `ready/` → `complete/`. Remove the fixed bug from `./product/backlog/bugs.md`. Run `./scripts/run.mjs check-diff` after each change. Run the full PR workflow via `ai/tasks/open-feature-pull-request.md` when implementation is done.

### Forbidden — no exceptions

1. **Fabricating a fix, a symptom, or a reproduction.** Never invent a failure you did not observe or a fix for a bug you could not reproduce. If the selected bug cannot be reproduced, stop and report (Step 1). If the specs and code leave the intended behavior genuinely ambiguous, stop and report (Step 2).
2. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
3. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
4. **Skipping the regression test.** Every fix needs a test that fails without the fix and passes with it. Verify with `./scripts/run.mjs check-diff`.
5. **Editing `./product/backlog/bugs.md` beyond removing the fixed entry.** Only remove the line for the bug you fixed — do not reorder, rephrase, or otherwise modify the remaining entries.
6. **Merging the PR.** `ai/tasks/open-feature-pull-request.md` opens it; merging is the human's decision.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick a bug and replicate it

1. Read `./product/backlog/bugs.md`. Bugs are grouped under `## ready`, `## development`, and `## deferred`. Only consider bugs under `## ready`.
2. If there are no bugs under `## ready`, report "No ready bugs in `./product/backlog/bugs.md`" and stop.
3. Pick the bug to fix. Do **not** evaluate, rank, or compare the bugs for scope, tractability, or any other quality — the human who filed them decided they belong here:
   - **If a specific bug is named in the task invocation** (e.g. `execute ai/tasks/fix-a-bug.md "<bug text>"`), fix that one. Find the entry in `./product/backlog/bugs.md` it refers to — the argument may be quoted text, a paraphrase, or a position such as "the second one". If no entry matches, report that no matching bug was found and stop.
   - **Otherwise**, take the **first** bug listed under `## ready` (top of the list).

   State which bug you selected in one sentence.
4. **Replicate the reported failure** before writing any fix, so you can watch it fail:
   - Prefer writing a failing automated test that exercises the reported scenario — this becomes the regression test in Step 4. Colocate it per the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
   - If a test cannot capture it, exercise the affected code path directly (a focused test, a `janus` CLI invocation, or a short throwaway script under `./temp/`) and observe the wrong behavior.
   - Record exactly what you ran and the faulty behavior you saw — the wrong output, the error, or the missing result. You will reuse this in the plan (Step 3) and the PR (Step 10).
5. Keep reproduction bounded: try at most two or three distinct approaches. If you still cannot reproduce the failure, do **not** fabricate a fix or invent a symptom, and do **not** switch to a different bug — report the selected bug, everything you tried, and stop.

---

## Step 2 — Determine the correct behavior

Decide what the code *should* do, drawing on three sources in order:

1. **The bug report** — what outcome does the reporter expect? Take it as the primary signal of intended behavior.
2. **The functional specs** in `./product/specs/` — find the spec covering this area. If a spec describes the correct behavior, it is authoritative; the bug is the code diverging from the spec.
3. **The code and its tests** — surrounding conventions, related passing tests, and adjacent behavior show what "correct" looks like when the spec is silent.

State the correct behavior in one or two sentences before planning the fix. If the bug report, specs, and code genuinely conflict or leave the intended behavior ambiguous, stop and report the ambiguity rather than guessing.

---

## Step 3 — Develop a plan

1. Read the project constraints in [`CLAUDE.md`](../../CLAUDE.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
2. Read every file relevant to the fix to understand the code involved and the root cause of the bug — fix the cause, not just the symptom.
3. Choose a short, descriptive `kebab-case` name for the fix — call it `<bug-name>` (for example `orientation-reset-on-load`). Use this exact same name for the plan file at every stage below.
4. Write a plan file following the format of existing plans in `./product/plans/complete/` — include a complexity rating, the root cause, the correct behavior (from Step 2), the reproduction (from Step 1), the approach, implementation steps, the regression test, and out-of-scope items. Write it to `./product/plans/draft/<bug-name>.md`.
5. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`. Use plain `mv` (not `git mv`) — the new plan file is not tracked by git yet, and `git mv` fails on an untracked file:
   ```bash
   mv ./product/plans/draft/<bug-name>.md ./product/plans/ready/<bug-name>.md
   ```

---

## Step 4 — Implement the fix and its regression test

Follow the plan's implementation steps **in order**. After each step:

1. Run `./scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `ai/guidelines/code-guidelines.md` — do not compact code, strip comments, or delete spacing.

The regression test is mandatory:

- It must exercise the reported scenario from Step 1 and assert the correct behavior from Step 2.
- **Prove it actually catches the bug.** The reliable path is the failing test you wrote in Step 1: you already watched it fail against the buggy code, so once the fix is in place, run it and confirm it now passes. If you did not write it test-first, add it now, confirm it passes with the fix, then prove it depends on the fix — either revert the fix, run the test to watch it fail, and re-apply the fix, or explain concretely why the assertion cannot hold without the fix.
- Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.

---

## Step 5 — Verify the fix

1. Run `./scripts/run.mjs check-diff`. It must pass clean, including the new regression test.
2. Re-run the reproduction from Step 1 and confirm the faulty behavior is gone — the scenario that used to fail now behaves correctly.
3. If the plan's Verification section describes manual steps, perform them. If manual verification is not possible in this environment, note that in the report.

---

## Step 6 — Update or create spec files

Every fix must be reflected in the functional specs under `./product/specs/`. After implementation and verification:

1. **Check the plan.** If the plan names specific spec files to update or create, do exactly that.
2. **Otherwise, find the right spec.** Read the existing specs in `./product/specs/` and identify which one(s) the fix relates to. Most fixes correct behavior an existing spec already describes — align the spec with the now-correct behavior. If no existing spec covers the area, create a new one.
3. **Write or update the spec.** Follow the existing conventions: `# Title` at the top, `### Subsection` for each aspect, prose describing user-visible behavior only — no code, no implementation details, no file paths. The spec is what the fix *does*, not how it is built. Keep additions concise and factual.

Spec files are markdown and do not affect `check-diff`, so no verification run is needed after this step.

---

## Step 7 — Update help and public documentation if affected

The fix only needs a documentation update if it changes behavior that `help.md` or `documentation/user-documentation/` already describes — a changed flag, a renamed command, a corrected default, a behavior that no longer matches what's written. Do not add new documentation for behavior that wasn't previously documented; that is out of scope for this task.

1. Check `help.md` for any command, flag, or behavior description the fix changes. Update it in place if found.
2. Check `documentation/user-documentation/` for any page describing the changed behavior. Update it in place if found.
3. If neither documents the changed behavior, do nothing here — do not create new documentation.

These files are markdown and do not affect `check-diff`, so no verification run is needed after this step.

---

## Step 8 — Promote the plan and remove the bug

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`. Use plain `mv` (not `git mv`) — the plan file is still untracked until the PR workflow stages it:
   ```bash
   mv ./product/plans/ready/<bug-name>.md ./product/plans/complete/<bug-name>.md
   ```
2. Remove **only** the fixed bug's line from the `## ready` group in `./product/backlog/bugs.md`. Do not touch the `## development` or `## deferred` groups, the group headings, or any other bug entry.

---

## Step 9 — Final verification

1. Run `./scripts/run.mjs check-diff` one last time. It must pass clean, including the regression test.
2. Manually verify the behavior if the plan's Verification section describes manual steps. If manual verification is not possible in this environment, note that in the report.

---

## Step 10 — Open the pull request

Execute `ai/tasks/open-feature-pull-request.md` in full — it owns the branch, commit, push, and PR-open workflow. Follow its steps as written, and additionally satisfy the two bug-specific requirements below.

**Requirement 1 — use the `fix:` type.** The commit subject and PR title must use the `fix:` Conventional Commits type (that workflow's Step 3 and Step 6), for example `fix(web): reset image orientation on reload`.

**Requirement 2 — document the replication in the PR body.** When you write the body (that workflow's "Behavior examples" and "How to verify" sections), include an explicit **Replication steps** account drawn from Step 1 and Step 2 of this task:

- The exact steps to reproduce the original faulty behavior (commands, inputs, or user flow).
- What the buggy behavior was — the wrong output, error, or missing result a reviewer would see without the fix.
- What the correct behavior is now — what the same steps produce with the fix applied.
- The name of the regression test that encodes this scenario and the file it lives in.

Do not merge the PR — leave it open for a human.

---

## Step 11 — Report

Give the user a short report in this exact shape:

```
Bug:            <the bug text from ./product/backlog/bugs.md>
Reproduction:   <one-line summary of how you replicated the faulty behavior>
Correct:        <one-line statement of the correct behavior>
Root cause:     <one-line summary of the underlying cause>
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Regression:     <the test that now guards this bug, and the file it lives in>
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
PR:             <url> (#<number>)
Status:         open
```

Keep it brief. Done.
