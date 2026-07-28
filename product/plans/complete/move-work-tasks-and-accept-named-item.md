# Move build-a-feature/fix-a-bug/fix-an-issue/plan-ready-features into ai/tasks/work/, and let each accept a named work item

**Complexity: 4/10** — a file move (4 files, one renamed) plus mechanical relative-link depth updates, plus adding an argument-acceptance branch to each task's Step 1 selection logic (mirroring a pattern one of them already has). No source code, architecture, or new-subsystem changes — matches the precedent set by `product/plans/complete/move-hygiene-tasks-to-hygiene-subdirectory.md` (rated 4/10 for a same-shaped, larger move).

## Goal

`ai/tasks/build-a-feature.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/fix-an-issue.md`, and `ai/tasks/plan-ready-features.md` move into a new `ai/tasks/work/` subdirectory. `plan-ready-features.md` is renamed to `plan-new-feature.md` and rewritten to plan a single feature (the first one under `## ready`, or one named in the invocation) rather than walking the entire ready queue. `build-a-feature.md` and `fix-an-issue.md` gain the ability to accept a specific work item named in the task invocation, falling back to their existing "pick the first/simplest" default when none is given — mirroring the argument-acceptance pattern `fix-a-bug.md` already has (`ai/tasks/fix-a-bug.md:43`). Every real, live reference to these files' old paths is updated.

## Design decisions

**No source code change needed**, same as the two prior `ai/tasks/` moves this mirrors (`move-ai-tasks-to-subdirectory.md`, `move-find-tasks-to-research-subdirectory.md`, `move-hygiene-tasks-to-hygiene-subdirectory.md`). `src/tasks.ts`'s `listTasks()` already recurses generically into subdirectories; `product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md` already describe recursion generically with no fixed-depth claim (re-verified for this move) and use `build-a-feature.md`/`fix-an-issue.md` only as bare example filenames, so neither needs correcting.

**Root-relative plain-text mentions of these files (no `[]()` link syntax) stay as-is when the referencing file doesn't move.** `commands.md` and `ai/tasks/hygiene/reduce-technical-debt.md` both name `ai/tasks/fix-an-issue.md` as a full root-relative path in backticks; since that file's path is genuinely changing (it now lives at `ai/tasks/work/fix-an-issue.md`), these do need updating — the "stays correct" rule from the precedent plan only applies when the *referenced* file isn't moving, not when the referencing file isn't moving.

**`[]()` relative-link syntax updates by one `../` level.** The only real relative markdown links inside the four moving files are each file's `[`CLAUDE.md`](../../CLAUDE.md)` (in `build-a-feature.md`, `fix-a-bug.md`, `fix-an-issue.md`) — these become `../../../CLAUDE.md` now that the file is one directory deeper. Every other cross-reference inside these four files (to `prepare-workspace.md`, `merge-change-to-master.md`, `open-feature-pull-request.md`, `ai/guidelines/code-guidelines.md`) is already written as a root-relative backtick mention (e.g. `` `ai/tasks/workspace/prepare-workspace.md` ``), not a relative link, so those stay correct unchanged — same convention the precedent plan documents.

**Argument-acceptance mirrors `fix-a-bug.md`'s existing Step 1 exactly**, adapted per task: find a named entry by quoted text/paraphrase/position, fall back to "first ready entry" (or "lowest complexity" for `build-a-feature.md`, since its plans aren't a flat ordered backlog) when nothing is named, and report + stop if a named argument doesn't match anything.

**`plan-new-feature.md` drops the multi-feature queue.** The original interviews the user through every `## ready` feature in one run; the issue asks it to "take the first feature on the backlog and plan just that feature." The queue-building (old Step 1's numbered list), the "process one at a time / do not start feature 2" framing (old Step 2's intro), and the "return to the top of Step 2 for the next feature" loop-back (old Step 2e) are removed. Steps 2a–2e's actual per-feature work (code reconnaissance, complexity checks, clarifying questions, drafting, backlog removal) is unchanged in substance — it now simply runs once, for the one feature selected in the new Step 1.

**Left unchanged (verified, not overlooked):**
- `product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md` — generic examples, no fixed-depth claim.
- `product/plans/complete/*.md` and `CHANGELOG.md` — historical records, not retroactively rewritten.
- Test fixtures using `build-a-feature.md`/`fix-a-bug.md` as arbitrary example filenames (`src/tasks.test.ts`, `src/controller.test.ts`, `web/src/useWindowKeys.test.ts`, `web/src/useTaskPicker.test.ts`) — synthetic temp-directory fixtures unrelated to the real repo layout, same reasoning as the prior rename precedent (`product/plans/complete/rename-fix-a-small-issue-task.md`).
- `ai/tasks/research/find-feature-ideas.md` and `find-feature-gaps.md`'s bare mention of `build-a-feature.md` — unaffected by the move (same filename, no path given); their mention of `plan-ready-features.md` does need updating to `plan-new-feature.md` since that file is renamed, not just moved.

## File-by-file changes

**Move (`git mv`), 4 files, into `ai/tasks/work/`:**
- `ai/tasks/build-a-feature.md` → `ai/tasks/work/build-a-feature.md`
- `ai/tasks/fix-a-bug.md` → `ai/tasks/work/fix-a-bug.md`
- `ai/tasks/fix-an-issue.md` → `ai/tasks/work/fix-an-issue.md`
- `ai/tasks/plan-ready-features.md` → `ai/tasks/work/plan-new-feature.md`

**Within the moved files:**
- `build-a-feature.md`, `fix-a-bug.md`, `fix-an-issue.md`: each `[`CLAUDE.md`](../../CLAUDE.md)` → `[`CLAUDE.md`](../../../CLAUDE.md)`.
- `build-a-feature.md`: rewrite Step 1 ("List ready plans and pick the simplest" → "List ready plans and pick one") to add the named-argument branch before the existing lowest-complexity fallback.
- `fix-an-issue.md`: rewrite Step 1 ("List small fixes and pick the first available" → "List small fixes and pick one") to add the named-argument branch before the existing full-list complexity scan and first-pick fallback.
- `plan-new-feature.md`: rename title to "Plan a New Feature"; rewrite the intro paragraph, Step 1 ("Read the ready backlog" → "Pick a feature from the ready backlog", now selecting one entry — named or first — rather than building a queue), Step 2's intro (drop the "one feature at a time"/queue-order framing), Step 2e (drop "return to the top of Step 2 for the next feature"), and Step 3's report shape (singular feature, not "N ready features processed").

**Other real, live references updated:**
- `commands.md` — 2 lines: both `./ai/tasks/fix-an-issue.md` → `./ai/tasks/work/fix-an-issue.md`.
- `ai/tasks/hygiene/reduce-technical-debt.md` — its one `` `ai/tasks/fix-an-issue.md` `` mention → `` `ai/tasks/work/fix-an-issue.md` ``.
- `ai/tasks/research/find-feature-ideas.md` and `ai/tasks/research/find-feature-gaps.md` — each mentions `` `plan-ready-features.md` `` → `` `plan-new-feature.md` ``.

## Tests

None — no source or behavior code changes; same reasoning as the three prior `ai/tasks/` moves.

## Verification

- `./scripts/run.mjs check-diff` — confirms nothing else was inadvertently broken (touches no source or test files, but the gate still runs clean per the standard workflow).
- Manual (not run in this environment): open the app, press Ctrl+A, expand the `tasks` row — confirm a new `work ▸` row appears alongside `hygiene ▸` and `research ▸` with the 4 moved/renamed files inside it, and picking one still populates `execute ./ai/tasks/work/<file>`.

## Out of scope

- Any change to `build-a-feature.md`'s or `fix-an-issue.md`'s logic beyond the Step 1 selection branch — implementation, testing, spec-update, and PR/merge steps are untouched.
- `fix-a-bug.md`'s content — it already accepts a named argument; only its path changes.
- Reworking `plan-new-feature.md`'s per-feature reconnaissance, question-asking, or plan-drafting steps (2a–2d) beyond removing the multi-feature queue framing.
- `product/specs/`, `documentation/`, or `CHANGELOG.md` — no user-visible application behavior changes as a result of this move.
