# Build a Feature

Your job: pick the simplest available plan from `docs/plans/ready/`, implement it end to end, promote the plan to `docs/plans/complete/`, and open a pull request. You change source code, tests, and the plan file's location — nothing else.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, and CSS as the plan directs. Move the chosen plan file from `docs/plans/ready/` to `docs/plans/complete/`. Run `./scripts/run.mjs check-diff` after each change. Run the full PR workflow via `ai/open-feature-pull-request.md` when implementation is done.

### Forbidden — no exceptions

1. **Editing files the plan does not touch.** Stay inside the plan's scope. If you discover the plan missed a file, stop and report — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** If the plan specifies tests, write them. If it does not, still verify with `./scripts/run.mjs check-diff`.
4. **Choosing a plan at complexity 7 or above.** If every plan in `docs/plans/ready/` is rated 7+, stop and report — do not pick one anyway.
5. **Merging the PR.** `ai/open-feature-pull-request.md` opens it; merging is the human's decision.

---

## Step 1 — List ready plans and pick the simplest

1. List every `.md` file in `docs/plans/ready/`.
2. For each file, read the first few lines to find the complexity rating line: `**Complexity: N/10**`.
3. If no plans exist, report "No plans in `docs/plans/ready/`" and stop.
4. If the lowest complexity found is **7 or above**, report the list with ratings and stop — do not pick one.
5. Otherwise, pick the plan with the **lowest** complexity number. On a tie, pick whichever plan name comes first alphabetically.

State your pick and its complexity in one sentence.

---

## Step 2 — Read the plan and the project constraints

1. Read the entire chosen plan.
2. Read the project constraints that shape implementation: the ESLint rules and file-size limit in [`CLAUDE.md`](../CLAUDE.md) (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), and the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
3. Read every file the plan references to confirm the line anchors and code fragments still match. If a reference is stale, locate the correct position by the quoted code fragment — line numbers drift.

---

## Step 3 — Implement the plan

Follow the plan's implementation steps **in order**. After each step:

1. Run `./scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `CODE_GUIDELINES.md` — do not compact code, strip comments, or delete spacing.

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

## Step 5 — Final verification

1. Run `./scripts/run.mjs check-diff` one last time. It must pass clean.
2. Manually verify the behavior if the plan's Verification section describes manual steps. If manual verification is not possible in this environment, note that in the report.

---

## Step 6 — Promote the plan

Move the plan file from `docs/plans/ready/` to `docs/plans/complete/`:

```bash
git mv docs/plans/ready/<plan-file> docs/plans/complete/<plan-file>
```

---

## Step 7 — Open the pull request

Execute `ai/open-feature-pull-request.md` in full. That document owns the PR workflow — follow its steps without deviation.

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Plan:           docs/plans/ready/<file> → docs/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of what was built>
Tests:          <count> new tests across <files>
PR:             <url> (#<number>)
Status:         open
```

Keep it brief. Done.
