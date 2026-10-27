# Build a Feature

Your job: pick the simplest available plan from `./product/plans/ready/`, implement it end to end, update the functional specs, promote the plan to `./product/plans/complete/`, and open a pull request. Then review the pull request and resolve every finding until a review adds none, and finish by updating the pull request to match its final code. You change source code, tests, spec files, and the plan file's location — nothing else. The review, repair, and update tasks you delegate keep their own edit scopes.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below (e.g. no plans available, only 7+ complexity plans, discovering out-of-scope file edits), or for a review, repair, or update that is blocked in Steps 8 and 9.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the plan directs. Move the chosen plan file from `./product/plans/ready/` to `./product/plans/complete/`. Run `$janissary/scripts/run.mjs check-diff` after each change. Run the full PR workflow via `ai/tasks/workspace/open-feature-pull-request.md` when implementation is done. Once the PR is open, delegate `ai/tasks/feature/review-pull-request.md`, `ai/tasks/feature/work-pull-request-issue.md`, and `ai/tasks/feature/update-pull-request.md` against it.

### Forbidden — no exceptions

1. **Editing files the plan does not touch.** Stay inside the plan's scope. If you discover the plan missed a file, stop and report — do not silently expand scope. This binds your own implementation; each repair in Step 8 follows `work-pull-request-issue.md`'s scope rules under its own fix plan.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `$janissary/scripts/run.mjs check-diff` during development.
3. **Skipping tests.** If the plan specifies tests, write them. If it does not, still verify with `$janissary/scripts/run.mjs check-diff`.
4. **Choosing a plan at complexity 7 or above.** If every plan in `./product/plans/ready/` is rated 7+, stop and report — do not pick one anyway.
5. **Merging or closing the PR.** `ai/tasks/workspace/open-feature-pull-request.md` opens it, and the review, repairs, and update all leave it open; merging is the human's decision.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — List ready plans and pick one

1. List every `.md` file in `./product/plans/ready/`.
2. If no plans exist, report "No plans in `./product/plans/ready/`" and stop.
3. Pick the plan to implement:
   - **If a specific plan is named in the task invocation** (e.g. `execute ai/tasks/feature/build-a-feature.md "<plan name>"`), implement that one. Find the file in `./product/plans/ready/` it refers to — the argument may be the filename, a paraphrase of its title, or a position such as "the second one". If no file matches, report that no matching plan was found and stop. Read its complexity rating line (`**Complexity: N/10**`); if it is **7 or above**, report the rating and stop — do not implement it.
   - **Otherwise**, for each file, use the `Read` tool to read the first few lines and find the complexity rating line: `**Complexity: N/10**`. Do not use a shell loop to do this. If the lowest complexity found is **7 or above**, report the list with ratings and stop — do not pick one. Otherwise, pick the plan with the **lowest** complexity number. On a tie, pick whichever plan name comes first alphabetically.

State your pick and its complexity in one sentence.

---

## Step 2 — Read the plan and the project constraints

1. Read the entire chosen plan.
2. Read the project constraints that shape implementation: the ESLint rules and file-size limit in [`AGENTS.md`](../../../AGENTS.md) (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), and the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
3. Read every file the plan references to confirm the line anchors and code fragments still match. If a reference is stale, locate the correct position by the quoted code fragment — line numbers drift.

---

## Step 3 — Implement the plan

Follow the plan's implementation steps **in order**. After each step:

1. Run `$janissary/scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `ai/guidelines/code-guidelines.md` — do not compact code, strip comments, or delete spacing.

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.
- **Every file the plan names, touch.** Every file the plan does not name, leave alone.

---

## Step 4 — Write the tests

If the plan has a Tests section, implement every test case listed. Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Run `$janissary/scripts/run.mjs check-diff` after writing tests. All tests must pass.

---

## Step 5 — Update or create spec files

Every feature must be reflected in the functional specs under `./product/specs/`. After implementation and tests:

1. **Check the plan.** If the plan names specific spec files to update or create, do exactly that.
2. **Otherwise, find the right spec.** Read the existing specs in `./product/specs/` and identify which one(s) the feature belongs to. Most features extend an existing spec (e.g. a new keyboard shortcut belongs in `./product/specs/keyboard-navigation.md`, a new tab behavior belongs in `./product/specs/tabs.md`). If no existing spec covers the area, create a new one.
3. **Write or update the spec.** Follow the existing conventions: `# Title` at the top, `### Subsection` for each aspect, prose describing user-visible behavior only — no code, no implementation details, no file paths. The spec is what the feature *does*, not how it is built. Keep additions concise and factual.

Spec files are markdown and do not affect `check-diff`, so no verification run is needed after this step.

---

## Step 6 — Promote the plan

Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`:

```bash
git mv ./product/plans/ready/<plan-file> ./product/plans/complete/<plan-file>
```

---

## Step 7 — Open the pull request

Execute `ai/tasks/workspace/open-feature-pull-request.md` in full. That document owns the PR workflow — follow its steps without deviation.

Record the PR number, URL, and head branch it reports. Steps 8 and 9 work on that PR and no other.

---

## Step 8 — Review and resolve the pull request

Review the PR you just opened and resolve every finding before finishing. Delegate each review and each repair to a fresh subagent, giving it the recorded PR number and the completed plan path, so the code is judged without the context that wrote it. Run them one at a time; never run dependent steps concurrently.

1. Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with the recorded PR number. It reviews the full PR against the completed plan and records its findings in `./product/backlog/pull-request.md` on the PR branch. Preserve every rule of that task.
2. Read `./product/backlog/pull-request.md` on the PR branch. Resolve every entry in file order, one at a time, by delegating `ai/tasks/feature/work-pull-request-issue.md` to a fresh subagent with the recorded PR number and an entry selector. Finish and verify publication of each repair before selecting the next. Preserve that task's tests, scope, and branch safeguards; override only its complexity-7 cutoff so recorded review work is not abandoned for its rating.
3. After the backlog drains, review the full PR again. If it records findings, drain them one at a time before the next review. Continue until a review records no new findings and the backlog is empty (or contains only the required empty-file skeleton). If deduplication means every finding was already present, drain the existing entries and review again.
4. Confirm all commits are pushed, the PR is still open on the recorded branch, and the working tree is clean.

If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and stop without running Step 9.

---

## Step 9 — Update the pull request

Once a review records nothing and the backlog is empty, delegate `ai/tasks/feature/update-pull-request.md` to a fresh subagent with the recorded PR number. It folds the fix plans the repairs added into the plan this task promoted and removes them, brings the PR description, specs, command help pages, and key-binding reference in line with the final code, and commits and pushes on the same branch. Preserve every rule of that task. It needs no override: the plan promoted in Step 6 is in the PR's first commit, which is how it finds the PR's own plan.

If the update cannot publish its changes or the PR description edit fails, preserve the work, report the blocker, and do not claim completion. Confirm the PR is still open, its remote head matches local `HEAD`, and the working tree is clean.

---

## Step 10 — Report

Give the user a short report in this exact shape:

```
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of what was built>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
PR:             <url> (#<number>)
Reviews:        <count> full PR reviews; <count> work items resolved
Updated:        <what update-pull-request changed> | already in sync
Status:         open | blocked — <reason>
```

Keep it brief. Done.
