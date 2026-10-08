# Work a Pull Request Issue

Take one recorded work item from the explicitly specified open pull request's head-branch backlog. Plan and implement its repair, verify it, update affected specs and existing documentation, record the completed fix plan, remove the resolved entry, and publish to that same branch. Correct the PR description only when the entry requires it. Leave the PR open.

Invocation: `execute ./ai/tasks/feature/work-pull-request-issue.md <number|#number|PR URL> [selector]`.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This overrides AGENTS.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

**Explicit target required.** Accept only a positive integer, a `#`-prefixed positive integer, or a GitHub pull request URL. An optional selector chooses an existing backlog entry by title, paraphrase, or position. Never accept a head branch name, infer a target from context, or treat a selector as new work. Missing or malformed targets stop before checkout or installation with `Status: blocked` and `Reason: explicit pull request number, #number, or PR URL required`. Failed lookups and non-open PRs stop with their specific reason and no substituted target.

## What you may and may not do

### Allowed — do it automatically, never ask

Read files relevant to the fix. Check out and prepare the specified PR's recorded head branch. Edit source, tests, CSS, specs, `help.md`, and existing user documentation as the fix requires. Write and promote the fix plan. Remove the resolved branch-backlog entry, preserving all others and restoring the master comment-and-heading skeleton when empty. Run `$janissary/scripts/run.mjs check-diff` after each change. Commit and push to the same head branch, and use `gh pr edit --body-file` only for description corrections named by the entry.

### Forbidden — no exceptions

1. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `$janissary/scripts/run.mjs check-diff` during development.
3. **Skipping tests.** Every fix needs tests that cover the changed behavior. Verify with `$janissary/scripts/run.mjs check-diff`.
4. **Choosing an entry rated 7 or higher.** Without a selector, take the first eligible entry below 7. A selected entry at 7 or higher stops the run rather than substituting another entry.
5. **Merging, closing, or replacing the PR.** Never execute `ai/tasks/workspace/merge-change-to-master.md`, call `gh pr merge`, create a replacement, or push to another branch.
6. **Working an absent, closed, or substituted target.** Require the specified PR to remain `OPEN` and the current branch to match its recorded head before publication.
7. **Reading or editing `./product/backlog/issues.md`.** Work comes only from this PR's `./product/backlog/pull-request.md`; never fall back to master's issues or add a named work item.
8. **Deleting the PR backlog.** Keep its leading comment and `# pull-request` heading, restoring the exact master skeleton when drained. Never discard unresolved entries.
9. **Changing the PR title or unrelated description text.** Correct only paragraphs the resolved entry names, preserving everything else exactly.
10. **Rewriting published history or force-pushing.** Add a commit; retain the bounded rebase-and-push retry policy in Step 8.

---

## Step 0 — Validate, check out, and prepare

Validate the explicit invocation target first as described above, then:

1. Run `gh pr view <reference> --json number,state,headRefName,url` with the accepted invocation reference. Confirm its state is `OPEN`, then record its canonical number, head branch, and URL. Use that recorded URL as `<reference>` in every later GitHub command, so a URL target cannot be replaced by a same-number PR in another repository. If the lookup fails or the state is not `OPEN`, stop as required above.
2. Run `gh pr checkout <reference>` to check out the PR's head branch. Do not create a new branch.
3. Run `git pull --rebase` to bring the checked-out branch up to date through the upstream configured by `gh pr checkout`. If the checkout or pull cannot complete, report the error and stop rather than working on another branch.
4. Confirm `git branch --show-current` is the head branch recorded in step 1.
5. Execute only Steps 2 and 3 of `ai/tasks/workspace/prepare-workspace.md` so dependencies match the PR branch. Do not execute its Step 1, which would switch back to master. Unlike `review-pull-request.md`, this task builds, tests, and lints, so it does need `node_modules`.

---

## Step 1 — Select one recorded fix

1. Read `./product/backlog/pull-request.md` from the checked-out head branch. If the file does not exist, or exists with no entries under its `# pull-request` heading, report that the pull request has no recorded work and stop — do not fall back to `./product/backlog/issues.md`, and do not invent a work item from the invocation.
2. Walk its entries top to bottom in file order. There are no status sections and nothing to skip past: every entry is ready, a human who wants one done sooner moves it up, and a human who decides against one deletes it outright.
3. If a selector followed the pull request reference, use it to choose the entry — it may be quoted text, a paraphrase, or a position such as "the second one". If it matches no entry, report that and stop; unlike an ordinary named work item, a selector is a lookup into this backlog, never a new work item in its own right.
4. If a selector is supplied, rate only the selected entry and stop if it is rated 7 or higher; never substitute another entry. Otherwise, rate candidates in file order by reviewing the codebase (do not use a shell loop), and take the **first** one rated below 7. If every entry rates 7 or higher, report the list with ratings and stop — do not implement one.
5. The entry's `*` summary bullet is the issue text for planning and reporting. Its `Proposal` paragraph is the starting point for Step 2's plan, not a substitute for it — verify what it claims against the code before building on it, since it was written by a reviewer who did not run the tests.

State your pick and its rating, then go to Step 2.

---

## Step 2 — Develop a plan

1. Read the project constraints in [`AGENTS.md`](../../../AGENTS.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
2. Read every file relevant to the fix to understand the code involved.
3. Write a plan file following the format of existing plans in `./product/plans/complete/` — include a complexity rating, goal, approach, implementation steps, tests, and out-of-scope items. Write it to `./product/plans/draft/<fix-name>.md`.
4. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`. Use plain `mv` (not `git mv`) — the new plan file is not tracked by git yet, and `git mv` fails on an untracked file:
   ```bash
   mv ./product/plans/draft/<fix-name>.md ./product/plans/ready/<fix-name>.md
   ```

---

## Step 3 — Implement the fix

Follow the plan's implementation steps **in order**. After each step:

1. Run `$janissary/scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `ai/guidelines/code-guidelines.md` — do not compact code, strip comments, or delete spacing.

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.

---

## Step 4 — Write the tests

If the plan has a Tests section, implement every test case listed. Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Run `$janissary/scripts/run.mjs check-diff` after writing tests. All tests must pass.

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

## Step 7 — Promote the plan and remove the entry

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`. Use plain `mv` (not `git mv`) — the new fix plan is untracked until publication stages it:
   ```bash
   mv ./product/plans/ready/<fix-name>.md ./product/plans/complete/<fix-name>.md
   ```
2. Remove the resolved entry whole from `./product/backlog/pull-request.md`: its lead `*` bullet through its `Proposal` paragraph and separating blank lines. Leave every other entry byte-for-byte unchanged. Entries use the five-part format in [review-pull-request.md](review-pull-request.md).
3. If no entries remain, rewrite the file to the exact master skeleton, retaining the leading comment and `# pull-request` heading. Never delete it.

The empty skeleton is:

```markdown
<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request
```

---

## Step 8 — Publish the resolved change

1. Run `gh pr view <reference> --json state,headRefName,url` again and `git branch --show-current`. Stop if the PR is no longer `OPEN` or the current branch is not its recorded head branch.
2. Run `$janissary/scripts/run.mjs pr-check-changes`. If it reports no changes to ship, stop. An entry whose only remedy is a description correction still reaches this point with changes to ship — it wrote a plan file to `./product/plans/complete/` and removed its entry from `./product/backlog/pull-request.md` — so this guard never fires merely because the fix was not a code change.
3. Compose a Conventional Commits subject and body describing the completed fix, then commit with `$janissary/scripts/run.mjs pr-commit "<subject>" "<body>"`. Do not amend, squash, or otherwise rewrite commits that were already on the PR branch.
4. Run `git push`, which pushes through the upstream configured by `gh pr checkout`. If the push is rejected because the remote branch advanced, run `git pull --rebase`, resolve any conflicts while preserving both sides, rerun `$janissary/scripts/run.mjs check-diff`, and retry `git push`. Repeat at most three times. Never force-push. If the third attempt fails, leave the local commit intact and report the failure.
5. **When the resolved entry called for a description correction**, apply it now — after the push, never before. A description is a live artifact on GitHub while a file edit is not until it is pushed, so editing it earlier would leave the pull request describing work that is not on its branch if a later step failed. Read the current body with `gh pr view <reference> --json body`, apply the change the entry's `Proposal` names, and leave every other paragraph exactly as the author wrote it — `gh pr edit` replaces the body wholesale, so preserving the rest is your job, not the tool's. Write the full revised body to `./temp/pr-body.md` and apply it:

   ```bash
   gh pr edit <reference> --body-file ./temp/pr-body.md
   ```

   Use the body file rather than an inline `--body` string: multi-line markdown breaks on shell quoting, which is why `scripts/pr-create-pr.sh` takes a body file too. `temp/` is gitignored, so the scratch file cannot reach a commit. Do not touch the title. When the entry called for no description change, skip this sub-step entirely.
6. Confirm the PR is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD` using `gh pr view <reference> --json state,headRefName,headRefOid,url`. Do not merge it.

If push or a required description correction fails, preserve local work, report the failure and outstanding obligation, and do not claim successful resolution.

---

## Step 9 — Report

```
Issue:          <the resolved entry's summary bullet from ./product/backlog/pull-request.md>
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
Backlog:        entry removed, <n> remaining in product/backlog/pull-request.md | drained — file restored to its comment-and-heading skeleton
Description:    updated — <one line on what changed> | not needed
Branch:         <the existing PR head branch>
PR:             <url> (#<number>)
Status:         pushed to open PR (not merged)
```

Keep it brief. Done.
