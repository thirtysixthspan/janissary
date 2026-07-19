# Build a Feature

Your job: pick the simplest available plan from `./product/plans/ready/`, implement it end to end, update the functional specs, promote the plan to `./product/plans/complete/`, and open a pull request. You change source code, tests, spec files, and the plan file's location — nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below (e.g. no plans available, only 7+ complexity plans, discovering out-of-scope file edits).

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the plan directs. Move the chosen plan file from `./product/plans/ready/` to `./product/plans/complete/`. Run `./scripts/run.mjs check-diff` after each change. Run the full PR workflow via `ai/tasks/open-feature-pull-request.md` when implementation is done.

### Forbidden — no exceptions

1. **Editing files the plan does not touch.** Stay inside the plan's scope. If you discover the plan missed a file, stop and report — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** If the plan specifies tests, write them. If it does not, still verify with `./scripts/run.mjs check-diff`.
4. **Choosing a plan at complexity 7 or above.** If every plan in `./product/plans/ready/` is rated 7+, stop and report — do not pick one anyway.
5. **Merging the PR.** `ai/tasks/open-feature-pull-request.md` opens it; merging is the human's decision.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — List ready plans and pick the simplest

1. List every `.md` file in `./product/plans/ready/`.
2. For each file, use the `Read` tool to read the first few lines and find the complexity rating line: `**Complexity: N/10**`. Do not use a shell loop to do this.
3. If no plans exist, report "No plans in `./product/plans/ready/`" and stop.
4. If the lowest complexity found is **7 or above**, report the list with ratings and stop — do not pick one.
5. Otherwise, pick the plan with the **lowest** complexity number. On a tie, pick whichever plan name comes first alphabetically.

State your pick and its complexity in one sentence.

---

## Step 2 — Read the plan and the project constraints

1. Read the entire chosen plan.
2. Read the project constraints that shape implementation: the ESLint rules and file-size limit in [`CLAUDE.md`](../../CLAUDE.md) (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), and the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
3. Read every file the plan references to confirm the line anchors and code fragments still match. If a reference is stale, locate the correct position by the quoted code fragment — line numbers drift.

---

## Step 3 — Implement the plan

Follow the plan's implementation steps **in order**. After each step:

1. Run `./scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
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

Run `./scripts/run.mjs check-diff` after writing tests. All tests must pass.

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

Execute `ai/tasks/open-feature-pull-request.md` in full. That document owns the PR workflow — follow its steps without deviation.

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of what was built>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
PR:             <url> (#<number>)
Status:         open
```

Keep it brief. Done.
