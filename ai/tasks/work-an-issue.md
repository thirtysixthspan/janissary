# Work an Issue

Your job: take a work item — the simplest issue in `./product/backlog/issues.md`, or the one the user names when running this task, which need not be listed there at all — develop a plan to resolve it, implement the fix, update functional specs, update `help.md` and public documentation where the fix changes behavior they already document, record the plan in `./product/plans/complete/`, remove the issue from the issues file when that is where it came from, and ship the result. Ordinarily, shipping means merging the change to master. Passing a **pull request number** instead enters PR mode, where the work item is drawn from that pull request branch's own `./product/backlog/pull-request.md`, the completed entry is removed from it, and the pull request is updated and left open. You change source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the issues file, the pull-request backlog, the plan file's location, and — in PR mode only, when the resolved entry calls for it — the pull request's own description. Nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This overrides CLAUDE.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**PR update mode.** An invocation argument that is a **pull request reference** — a bare positive integer, a `#`-prefixed integer, or a GitHub pull request URL — enters PR update mode, with that pull request as the delivery target. For example, `execute ai/tasks/work-an-issue.md 232` works pull request 232. Anything else is ordinary work-item text. A head branch name is not accepted as a reference, even though `gh pr view` would resolve one: a branch name and an issue text are both free-form strings, and nothing could tell them apart without guessing.

In this mode the work item is **drawn from `./product/backlog/pull-request.md` on the pull request's own head branch** — the file [`pull-request-review.md`](pull-request-review.md) writes — and never from `./product/backlog/issues.md`, which lives on master and describes master's problems. That file is one flat list with no status sections, so every entry in it is ready and its order is its priority. Check out the head branch first, take the work item from that backlog, commit and push the completed fix to the same branch, and leave the pull request open. When the fix is done, remove the resolved entry from that backlog; when no entry remains in it at all, remove the file from the branch as well. A pull-request work item is never written to the issues file and never carries a `PR #` prefix — it lives strictly in the branch's own backlog.

Some entries are not fixed by a file change at all: a description-fidelity finding's remedy is a correction to the **pull request's own description**. In PR mode that is a delivery the task can make, by updating the description in Step 8 with everything the entry did not name left exactly as the author wrote it. The title is never touched.

An optional selector may follow the reference — `execute ai/tasks/work-an-issue.md 232 "the untracked file check"` — to choose a specific entry. With no selector, the first resolvable entry is taken.

These rules override every general instruction below to merge to master.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the fix requires. Update `help.md` and files under `documentation/user-documentation/` when the fix changes behavior they already document. Write a plan file to `./product/plans/complete/`. Remove the fixed issue from `./product/backlog/issues.md`. In PR update mode, read `./product/backlog/pull-request.md` on the pull request's head branch, remove the resolved entry from it, and remove the file itself once it holds no entries at all. In PR update mode, update the pull request's description with `gh pr edit --body-file` when the resolved entry calls for it (Step 8). Run `./scripts/run.mjs check-diff` after each change. For an ordinary work item, execute the full merge workflow via `ai/tasks/workspace/merge-change-to-master.md` when implementation is done. In PR update mode, check out, commit to, and push the existing PR's head branch instead.

### Forbidden — no exceptions

1. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** Every fix needs tests that cover the changed behavior. Verify with `./scripts/run.mjs check-diff`.
4. **Choosing an issue that requires significant new architecture.** If an issue would require high complexity error or prone work, pick a simpler issue instead and report why.
5. **Editing `./product/backlog/issues.md` beyond removing the fixed entry.** Only remove the line for the issue you fixed — do not reorder, rephrase, or otherwise modify the remaining entries. In ordinary mode, never add a work item named at invocation to the file.
6. **Merging before all checks pass.** The `ai/tasks/workspace/merge-change-to-master.md` workflow handles merge; do not bypass it.
7. **Merging or replacing a PR in PR update mode.** Never execute `ai/tasks/workspace/merge-change-to-master.md`, call `gh pr merge`, create a replacement pull request, or push the fix to a different branch. The existing PR must remain open after its head branch is updated.
8. **Updating a PR that is not open.** If the numbered PR does not exist or its state is not `OPEN`, report that and stop. Do not substitute another PR or branch.
9. **Reading or editing `./product/backlog/issues.md` in PR update mode.** That file belongs to master. In PR mode the branch's own `./product/backlog/pull-request.md` is the only source of work and the only backlog you touch — never fall back to the issues file when it is missing or empty, and never record a pull-request work item there.
10. **Deleting `./product/backlog/pull-request.md` while any entry remains in it.** The file goes only when it holds no entries at all. It has no status sections to park work in, so an entry still sitting in it is work still on the record — including one a human reordered or left for later — and deleting the file would erase it.
11. **Reaching past the description edit's boundaries.** Never edit a pull request's description in ordinary mode — `merge-change-to-master.md` writes and merges that pull request in the same run, so there is no established description to correct. Never edit a pull request's **title** in either mode: it has to match the commit subject under this repo's Conventional Commits rules, so changing one alone breaks the pair. And never change more of a description than the resolved entry names — the rest is the author's statement of intent, and it is the evidence the next reviewer needs.

---

## Step 0 — Prepare the workspace

Inspect the invocation argument before running the ordinary preparation workflow: a pull request reference selects PR update mode, anything else the ordinary path.

- **In PR update mode:**
  1. Run `gh pr view <number> --json state,headRefName,url`. Confirm its state is `OPEN`, then record its head branch and URL for the rest of the task. If the lookup fails or the state is not `OPEN`, stop as required above.
  2. Run `gh pr checkout <number>` to check out the PR's head branch. Do not create a new branch.
  3. Run `git pull --rebase` to bring the checked-out branch up to date through the upstream configured by `gh pr checkout`. If the checkout or pull cannot complete, report the error and stop rather than working on another branch.
  4. Confirm `git branch --show-current` is the head branch recorded in step 1.
  5. Execute only Steps 2 and 3 of `ai/tasks/workspace/prepare-workspace.md` so dependencies match the PR branch. Do not execute its Step 1, which would switch back to master. Unlike `pull-request-review.md`, this task builds, tests, and lints, so it does need `node_modules`.
- **Otherwise:** execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — List small fixes and pick one

**In PR update mode, this whole step reads the branch's pull-request backlog instead of the issues file.** Do that and skip the rest:

1. Read `./product/backlog/pull-request.md` from the checked-out head branch. If the file does not exist, or exists with no entries under its `# pull-request` heading, report that the pull request has no recorded work and stop — do not fall back to `./product/backlog/issues.md`, and do not invent a work item from the invocation.
2. Walk its entries top to bottom in file order. There are no status sections and nothing to skip past: every entry is ready, a human who wants one done sooner moves it up, and a human who decides against one deletes it outright.
3. If a selector followed the pull request reference, use it to choose the entry — it may be quoted text, a paraphrase, or a position such as "the second one". If it matches no entry, report that and stop; unlike an ordinary named work item, a selector is a lookup into this backlog, never a new work item in its own right.
4. Rate each candidate's complexity by reviewing the codebase to understand what areas it touches (do not use a shell loop for this), and take the **first** one rated below 7. If every entry rates 7 or higher, report the list with ratings and stop — do not implement one.
5. The entry's `*` summary bullet is the issue text for planning and reporting. Its `Proposal` paragraph is the starting point for Step 2's plan, not a substitute for it — verify what it claims against the code before building on it, since it was written by a reviewer who did not run the tests.

State your pick and its rating, then go to Step 2.

**Otherwise** — the ordinary path:

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
4. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`. Use plain `mv` (not `git mv`) — the new plan file is not tracked by git yet, and `git mv` fails on an untracked file:
   ```bash
   mv ./product/plans/draft/<fix-name>.md ./product/plans/ready/<fix-name>.md
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

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`. Use plain `mv` (not `git mv`) — the plan file is still untracked until the merge workflow stages it:
   ```bash
   mv ./product/plans/ready/<fix-name>.md ./product/plans/complete/<fix-name>.md
   ```
2. Remove the resolved work item from the backlog it came from:
   - **In PR update mode**, remove the resolved entry from `./product/backlog/pull-request.md` on the head branch. Remove it **whole** — its `*` bullet through its `Proposal` paragraph, plus the blank lines that separated it from the next entry — leaving every other entry and the file's `# pull-request` heading byte-for-byte untouched. Entries there are the five-part structure `pull-request-review.md` defines, not single lines, so removing "the line" would leave four orphaned paragraphs behind.

     Then check whether the file still holds **any** entry. If one remains, leave the file in place. If none remains, the backlog is drained: remove the file with `git rm ./product/backlog/pull-request.md`. A bare heading with nothing under it is not a state this file has — unlike its six siblings in `./product/backlog/`, it has no sections to keep and no reason to outlive its last entry. Use `git rm` rather than a plain `rm` — the file is tracked on the branch, and `git rm` states the intent where it happens and fails loudly if it is not tracked.

     `./product/backlog/issues.md` is not read or modified in this mode.
   - **Otherwise**, remove the fixed issue's line from `./product/backlog/issues.md`. Only remove that single line — do not modify any other content in the file. If the work item came from the task invocation and was never listed in the file, there is nothing to remove: leave the file untouched.

---

## Step 8 — Ship the resolved change

After implementation, tests, specs/docs, plan promotion, and issue removal are complete, use the workflow for the current mode:

- **In PR update mode:**
  1. Run `gh pr view <number> --json state,headRefName,url` again and `git branch --show-current`. Stop if the PR is no longer `OPEN` or the current branch is not its recorded head branch.
  2. Run `./scripts/run.mjs pr-check-changes`. If it reports no changes to ship, stop. An entry whose only remedy is a description correction still reaches this point with changes to ship — it wrote a plan file to `./product/plans/complete/` and removed its entry from `./product/backlog/pull-request.md` — so this guard never fires merely because the fix was not a code change.
  3. Compose a Conventional Commits subject and body describing the completed fix, then commit with `./scripts/run.mjs pr-commit "<subject>" "<body>"`. Do not amend, squash, or otherwise rewrite commits that were already on the PR branch.
  4. Run `git push`, which pushes through the upstream configured by `gh pr checkout`. If the push is rejected because the remote branch advanced, run `git pull --rebase`, resolve any conflicts while preserving both sides, rerun `./scripts/run.mjs check-diff`, and retry `git push`. Repeat at most three times. Never force-push. If the third attempt fails, leave the local commit intact and report the failure.
  5. **When the resolved entry called for a description correction**, apply it now — after the push, never before. A description is a live artifact on GitHub while a file edit is not until it is pushed, so editing it earlier would leave the pull request describing work that is not on its branch if a later step failed. Read the current body with `gh pr view <number> --json body`, apply the change the entry's `Proposal` names, and leave every other paragraph exactly as the author wrote it — `gh pr edit` replaces the body wholesale, so preserving the rest is your job, not the tool's. Write the full revised body to `./temp/pr-body.md` and apply it:

     ```bash
     gh pr edit <number> --body-file ./temp/pr-body.md
     ```

     Use the body file rather than an inline `--body` string: multi-line markdown breaks on shell quoting, which is why `scripts/pr-create-pr.sh` takes a body file too. `temp/` is gitignored, so the scratch file cannot reach a commit. Do not touch the title. When the entry called for no description change, skip this sub-step entirely.
  6. Confirm the PR is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD` using `gh pr view <number> --json state,headRefName,headRefOid,url`. Do not merge it.
- **Otherwise:** execute `ai/tasks/workspace/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation before giving the final report.

---

## Step 9 — Report

For an ordinary work item, give the user a short report in this exact shape:

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

In PR update mode, use this exact shape instead:

```
Issue:          <the resolved entry's summary bullet from ./product/backlog/pull-request.md>
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
Backlog:        entry removed, <n> remaining in product/backlog/pull-request.md | drained — file removed from the branch
Description:    updated — <one line on what changed> | not needed
Branch:         <the existing PR head branch>
PR:             <url> (#<number>)
Status:         pushed to open PR (not merged)
```

Keep it brief. Done.
