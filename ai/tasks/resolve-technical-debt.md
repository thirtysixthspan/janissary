# Resolve Technical Debt (first resolvable backlog item, if simple enough)

Your job: walk `./product/backlog/technical-debt.md` from the top, rating each item's complexity in order, and **resolve the first one that does not exceed a complexity threshold of 7**: develop a plan, implement the fix, update functional specs, update `help.md` and public documentation where the fix changes behavior they already document, record the plan in `./product/plans/complete/`, remove the item from the technical-debt file, and merge the change to master.

Some items are not resolved by a plan you write at all — they describe work that one of the hygiene task playbooks in `ai/tasks/hygiene/` already owns (a namespace move, a modularity split, a complexity reduction, a dead-code or duplication removal, a coverage gap). For those you **trigger the hygiene task against the backlog item** instead of planning the fix yourself; see Step 2A. Any item you rate **above** the threshold while walking the list — including the eventual pick's rejected predecessors — gets moved into the file's `## deferred` section with a note of its rated complexity, instead of being resolved; you never implement an over-threshold item, you only defer it and move on to the next one. All deferrals and the eventual fix (if any) merge to master together in one change. You change source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the technical-debt file, and the plan file's location — nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This overrides CLAUDE.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. When an item's complexity exceeds the threshold, defer it and move on to the next item (Step 1) rather than stopping outright. Only stop early for the conditions explicitly listed under "Forbidden" below, or when `./product/backlog/technical-debt.md` has no items at all.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Edit source, tests, CSS, and spec files as the fix requires. Update `help.md` and files under `documentation/user-documentation/` when the fix changes behavior they already document. Write a plan file to `./product/plans/complete/`. Execute a hygiene playbook under `ai/tasks/hygiene/` when the item is one that playbook owns (Step 2A). Remove the resolved item from `./product/backlog/technical-debt.md`, and move any over-threshold item(s) encountered along the way into its `## deferred` section with a complexity note. Run `./scripts/run.mjs check-diff` after each change. Execute the full merge workflow via `ai/tasks/workspace/merge-change-to-master.md` once, at the end, covering every deferral plus the fix (if any).

### Forbidden — no exceptions

1. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
2. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` during development.
3. **Skipping tests.** Every fix needs tests that cover the changed behavior. Verify with `./scripts/run.mjs check-diff`.
4. **Resolving an item whose complexity exceeds the threshold.** If an item rates above 7/10, do not attempt to implement it — defer it and move to the next item instead (Step 1).
5. **Editing `./product/backlog/technical-debt.md` beyond the entries in play.** Only remove the line for the item you resolved, and move the line(s) for the item(s) you deferred into `## deferred` with a note (its complexity rating, or the playbook that blocked it per Step 2A) — do not reorder, rephrase, or otherwise modify any other entry.
6. **Merging before all checks pass.** The `ai/tasks/workspace/merge-change-to-master.md` workflow handles merge; do not bypass it.
7. **Hand-resolving an item a hygiene task owns.** If the item names a hygiene playbook, or asks for work in Step 2A's routing table, run that playbook against it — do not write your own plan for the same work, and do not reimplement what the playbook already automates.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Walk the list, deferring anything too complex, until you find one to fix

1. Read `./product/backlog/technical-debt.md`. If it has no items anywhere in the file (not even in `## deferred`), report "No items in `./product/backlog/technical-debt.md`" and stop.
2. Work through the items **in the order they're listed**, starting from the top. For each item, in turn:
   1. Review the codebase to understand what areas the item touches, then rate its complexity on a 1–10 scale (1 = trivial, localized change; 10 = a rewrite touching architecture across many files). Use the same judgment `ai/tasks/work-an-issue.md` applies to issues: an item needing significant new architecture rates 7 or above.
   2. **If the rating is 8 or higher** (exceeds the threshold of 7): do not resolve it. Remove the item's line from wherever it currently sits in `./product/backlog/technical-debt.md` and add it under the `## deferred` section, appending a note of the rated complexity and a one-sentence reason, e.g.:
      ```
      * <original item text> — deferred: complexity 8/10, requires a new persistence layer across three subsystems.
      ```
      Then move on to the **next** item in the list and repeat from 2.1.
   3. **If the rating is 7 or lower**: stop walking. This is your pick — state it and its rating, then route it: read Step 2A's routing rules and decide whether a hygiene task owns this item. If one does, say which and go to **Step 2A**. If none does, go to **Step 2** and plan the fix yourself.
3. If you reach the end of the list without finding an item rated 7 or lower, every item you passed over is now deferred with its complexity note. Skip Step 2 through Step 7 and go straight to **Step 8** to merge the backlog changes, then report per the all-deferred shape in Step 9.

Keep a running list of every item you deferred along the way (text + rating) — you need it for the Step 9 report regardless of which path you end up on.

---

## Step 2A — Trigger the hygiene task that owns the item

Some backlog items describe work an existing hygiene playbook already automates. Resolving those by hand duplicates the playbook and gets the mechanics wrong; run the playbook against the item instead.

**Recognize a hygiene-owned item.** An item belongs to a hygiene task when either:

1. **It names one.** The entry says so outright — e.g. "Resolve by running the `ai/tasks/hygiene/improve-namespacing.md` task against the `widget` prefix." Research tasks such as [`find-namespaces.md`](research/find-namespaces.md) write this sentence deliberately; take it at its word and use the task it names.
2. **Its described work matches one.** No task is named, but the fix the entry asks for is exactly what a playbook does:

| What the item asks for | Task to trigger |
| --- | --- |
| Move a flat prefix cluster (`src/widget-*`) into a namespace directory | [`improve-namespacing.md`](hygiene/improve-namespacing.md) |
| Split an over-long file, or retire a `max-lines` suppression, by extracting a module | [`improve-modularity.md`](hygiene/improve-modularity.md) |
| Reduce a function's cognitive complexity in place | [`reduce-complexity.md`](hygiene/reduce-complexity.md) |
| Delete unused files, exports, or dependencies | [`remove-deadcode.md`](hygiene/remove-deadcode.md) |
| Collapse a duplicated block into one shared implementation | [`remove-duplication.md`](hygiene/remove-duplication.md) |
| Add missing tests for an untested or under-covered file | [`improve-test-coverage.md`](hygiene/improve-test-coverage.md) |
| Fix a CSS issue stylelint reports | [`improve-style.md`](hygiene/improve-style.md) |
| Apply a security or dependency-advisory patch | [`improve-security.md`](hygiene/improve-security.md) |

If neither test matches — the item asks for a design change, a behavior fix, a type moved across a boundary, a new validation guard, or anything else the table does not cover — it is **not** hygiene-owned. Go back to Step 2 and plan it yourself.

**Trigger it.** When the item is hygiene-owned:

1. State which playbook you are triggering and what target the backlog item names (the prefix, file, function, or module).
2. Execute `ai/tasks/hygiene/<task>.md` in full, **against the target the backlog item names** — the item, not the playbook, chooses the target. Every hygiene playbook documents this handoff under its own "The work item" section and accepts a target the same way a user-named one arrives; it skips its candidate-selection step and applies every other step as written.
3. **Three parts of the playbook do not run here**, because this task already owns them: its workspace-preparation step (done in Step 0), any merge or pull-request step it ends with (done in Step 8), and its own final report (folded into Step 9's report instead). Everything between them — its verification gates, its undo rules, its file-by-file recipe — you follow exactly as written.
4. If the playbook's own blocked-work rules rule the target out (a name collision, a change that would need a logic edit, a config file hard-coding a path, and so on), do **not** substitute a different target of your own and do not fall back to hand-resolving the item. Move the item into the `## deferred` section of `./product/backlog/technical-debt.md` with a one-sentence note naming the playbook and why it blocked, then return to Step 1 and continue walking from the next item.
5. Run `./scripts/run.mjs check-diff` and confirm it is clean before leaving this step.

A hygiene-triggered run produces **no plan file** — the playbook is the plan. Skip Step 2, Step 3, Step 4, and the plan-promotion half of Step 7; continue at **Step 5**.

---

## Step 2 — Develop a plan

1. Read the project constraints in [`CLAUDE.md`](../../CLAUDE.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.tsx`).
2. Read every file relevant to the item to understand the code involved.
3. Write a plan file following the format of existing plans in `./product/plans/complete/` — include a complexity rating, goal, approach, implementation steps, tests, and out-of-scope items. Write it to `./product/plans/draft/<item-name>.md`.
4. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`:
   ```bash
   git mv ./product/plans/draft/<item-name>.md ./product/plans/ready/<item-name>.md
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

**Hygiene-triggered runs (Step 2A).** Most hygiene playbooks are pure refactors — they move, split, or de-duplicate code without changing anything a user can observe — and a spec records user-visible behavior only. When nothing observable changed, write nothing here and record `Spec: none needed (refactor only)` in the report. Update a spec only if the playbook genuinely changed behavior.

---

## Step 6 — Update help and public documentation if affected

The fix only needs a documentation update if it changes behavior that `help.md` or `documentation/user-documentation/` already describes — a changed flag, a renamed command, a corrected default, a behavior that no longer matches what's written. Do not add new documentation for behavior that wasn't previously documented; that is out of scope for this task.

1. Check `help.md` for any command, flag, or behavior description the fix changes. Update it in place if found.
2. Check `documentation/user-documentation/` for any page describing the changed behavior. Update it in place if found.
3. If neither documents the changed behavior, do nothing here — do not create new documentation.

---

## Step 7 — Promote the plan and remove the item

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`:
   ```bash
   git mv ./product/plans/ready/<item-name>.md ./product/plans/complete/<item-name>.md
   ```
   **Hygiene-triggered runs (Step 2A) have no plan file** — skip this sub-step entirely and do not write one after the fact.
2. Remove the resolved item's line from `./product/backlog/technical-debt.md`. Leave any `## deferred` entries you added in Step 1 as they are — only remove the single line for the item you resolved, and do not otherwise modify the file.

---

## Step 8 — Merge the change to master

Execute `ai/tasks/workspace/merge-change-to-master.md` in full. That document owns the merge workflow — follow its steps without deviation.

---

## Step 9 — Report

Give the user a short report in this exact shape:

```
Item:           <the item text you resolved>
Complexity:     N/10 (threshold: 7)
Deferred:       <count> item(s) skipped first — <item text (N/10)>, <item text (N/10)>, ... or "none"
Resolved by:    <ai/tasks/hygiene/<task>.md against <target>> or "own plan"
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>   (or "none — hygiene task")
Implementation: <one-line summary of the fix>
Tests:          <count> new tests across <files>
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
PR:             <url> (#<number>)
Status:         merged
```

If Step 1 reached the end of the list without finding a resolvable item, report instead:

```
Deferred:       <count> item(s), all above threshold — <item text (N/10)>, <item text (N/10)>, ...
PR:             <url> (#<number>)
Status:         all deferred, merged
```

Keep it brief. Done.
