# Add a `workspace/resolve-conflicts` AI task that clears conflicts on an open pull request

**Complexity: 3/10** — one new markdown task prompt under `ai/tasks/workspace/`, modeled on the existing `build-a-feature.md` shape and composed entirely from `scripts/pr-*.sh` steps that already exist. No source code, no new scripts, no architecture. Same class of change as `product/plans/complete/move-work-tasks-and-accept-named-item.md` (4/10), which additionally moved and rewrote four files; this adds one.

## Goal

A new executable task prompt at `ai/tasks/workspace/resolve-conflicts.md` takes an **already-open pull request**, brings its head branch back into a mergeable state against `master`, confirms the implementation on that branch still delivers what the PR's plan promised, gets the build green, pushes the result — and **leaves the pull request open**. It never merges.

The pull request is identified either from a value passed in the task invocation (a number, `#number`, URL, or head branch name) or, when nothing is passed, recognized from context — the branch currently checked out, falling back to the single open pull request when there is exactly one.

The distinguishing work beyond a mechanical rebase is the plan check: a feature PR produced by `ai/tasks/build-a-feature.md` carries its plan file in the diff (moved into `./product/plans/complete/`). Conflict resolution routinely drops or mangles hunks, so after the rebase the task re-reads that plan and verifies, item by item, that the implementation still meets its goal — restoring or adapting whatever the rebase cost, then proving it with the check gate.

## Design decisions

**It lives in `ai/tasks/workspace/`, not the `ai/tasks/` root.** The task is a git/PR workflow like its neighbors `merge-change-to-master.md`, `open-feature-pull-request.md`, `prepare-workspace.md`, and `quick-commit.md`, and the invocation names it `workspace/resolve-conflicts`. Relative markdown links from that depth follow the neighbors' convention: `../../guidelines/…` for guidelines, `../../../CLAUDE.md` for the root guide.

**It reuses the `pr-*` scripts rather than inlining git.** `pr-resolve-remote`, `pr-check-mergeable`, `pr-rebase`, `pr-check-gate`, `pr-check-changes`, `pr-commit`, and `pr-push-branch` already exist and already encode this project's rules (single author, no co-author, `--force-with-lease` only, gate before push). `pr-rebase` in particular is purpose-built for this loop: it fetches `master`, rebases, re-runs the gate, and force-pushes when clean, exiting 2 with the conflicted file list when judgment is required. The new task orchestrates those; it introduces no new script and no raw `git rebase`/`git push --force`.

**The conflict loop mirrors `merge-change-to-master.md` Step 6, capped at 5 attempts.** Same script, same exit-code contract, same "preserve the intent of *both* sides" rule, same "stop and leave it for a human after 5" ceiling. Copying the established loop keeps one behavior for conflict resolution across the two tasks that perform it.

**Force-pushing is permitted, but only through `pr-rebase`.** Rebasing a PR branch onto `master` necessarily rewrites that branch, so the no-force-push rule that `work-an-issue.md`'s PR update mode carries cannot apply here — resolving conflicts *is* the job. The task confines the rewrite to `pr-rebase`'s `--force-with-lease` and forbids a bare `git push --force`, so a branch someone else advanced aborts the push instead of losing their commits.

**The plan is located from the PR's own diff, not guessed.** `gh pr diff <number> --name-only` lists the PR's files; a `product/plans/**/*.md` entry is the plan. This works for the `build-a-feature.md` output (plan moved `ready/` → `complete/`) and for `work-an-issue.md`'s output (plan written straight into `complete/`). When a PR carries no plan file — a hygiene or docs PR, say — the task falls back to the PR body and commit subjects as the statement of intent rather than stopping, since a conflicted PR still needs clearing either way.

**Verification uses `pr-check-gate`, not `check-diff`.** `scripts/changed-files.mjs` scopes `check-diff` to the *uncommitted* working tree, so immediately after a clean rebase it would find nothing and report success over an untested branch. The task therefore uses `check-diff` only while iterating on uncommitted repair edits and requires `pr-check-gate` (typecheck, lint, tests, CSS) as the gate that actually proves the build. `npm run check` stays forbidden, as in every other task.

**Not merging is stated three ways.** The job sentence, an explicit Forbidden entry (no `gh pr merge`, no `merge-change-to-master.md`, no replacement PR, no pushing to a different branch), and a final confirmation step that re-reads the PR state and asserts it is still `OPEN`. The task also stops rather than acting when the target PR's state is not `OPEN` to begin with.

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| Task-prompt shape (job sentence, lead-in notes, Allowed/Forbidden, numbered steps, fixed report) | `build-a-feature.md` | `ai/tasks/build-a-feature.md` |
| Rebase-and-resolve loop with exit-code contract | `pr-rebase`, and the Step 6 loop that drives it | `scripts/pr-rebase.sh`, `ai/tasks/workspace/merge-change-to-master.md` |
| Conflict-status polling | `pr-check-mergeable` | `scripts/pr-check-mergeable.sh` |
| Checking out and preparing an existing PR branch without returning to `master` | PR update mode's Step 0 (checkout, pull, then only Steps 2–3 of prepare-workspace) | `ai/tasks/work-an-issue.md` |
| Commit with a single author, and push with the retry rules | `pr-commit`, `pr-push-branch`, and `quick-commit.md`'s push→rebase loop | `scripts/pr-commit.sh`, `scripts/pr-push-branch.sh`, `ai/tasks/workspace/quick-commit.md` |
| Hard build gate | `pr-check-gate` | `scripts/pr-check-gate.sh` |
| Precedent that an `ai/tasks/` change needs no spec or test | `move-work-tasks-and-accept-named-item.md`, `ai-tasks-project-product-directory.md` | `./product/plans/complete/` |

## File-by-file changes

**New file — `ai/tasks/workspace/resolve-conflicts.md`.** One task prompt, written in the voice and structure of `build-a-feature.md`:

- **Job sentence** — take an open PR, resolve its conflicts with `master`, confirm the implementation still meets its plan, get the build green, push, and leave the PR open.
- **Lead-in notes** — the standard `./product/` project-directory note, the no-AI-attribution note, the run-autonomously note, and the stay-within-the-project-directory note, worded as in the sibling tasks.
- **Allowed** — read anything; check out and rebase the PR's head branch; edit source, tests, CSS, spec, and plan files as conflict resolution and the plan's goal require; run `check-diff` and `pr-check-gate`; commit and push to the PR's own head branch; force-push through `pr-rebase` only.
- **Forbidden** — merging or closing the PR (`gh pr merge`, `merge-change-to-master.md`, a replacement PR, pushing to any other branch); working a PR whose state is not `OPEN`, or proceeding when the target PR cannot be identified unambiguously; `npm run check`; bare `git push --force`; resolving a conflict by discarding one side wholesale; expanding beyond the PR's plan into unrelated changes; pushing on a red gate.
- **Step 0 — Identify the pull request.** Use the invocation value when given (number, `#number`, URL, or head branch, all accepted by `gh pr view`); otherwise recognize it from context: `gh pr view` with no argument resolves the PR for the current branch, and failing that `gh pr list --state open` is used, taking the PR only when exactly one is open. Record `state`, `number`, `headRefName`, `url`. Stop if the state is not `OPEN` or if the context is ambiguous.
- **Step 1 — Get onto the PR branch.** `gh pr checkout <number>`, `git pull --rebase`, confirm `git branch --show-current` matches the recorded head branch, then execute only Steps 2 and 3 of `ai/tasks/workspace/prepare-workspace.md` (its Step 1 would switch back to `master`).
- **Step 2 — Read the plan the PR is delivering.** `gh pr diff <number> --name-only` to find the `./product/plans/**/*.md` entry; read that plan in full, plus `gh pr view <number> --json title,body` for stated intent. With no plan file in the diff, fall back to the PR body and `git log origin/master..HEAD` subjects, and say so in the report.
- **Step 3 — Determine the conflict status.** `./scripts/run.mjs pr-resolve-remote` for `OWNER_REPO`, then `./scripts/run.mjs pr-check-mergeable <branch> <owner/repo>`. `MERGEABLE` → skip to Step 5. `CONFLICTING` → Step 4. `UNKNOWN` → re-run once, then treat as conflicting and let Step 4's rebase settle it.
- **Step 4 — Rebase onto `master` and resolve (at most 5 attempts).** `./scripts/run.mjs pr-rebase origin <branch>`; exit 0 means rebased, gate green, force-pushed — re-check Step 3's status. Exit 2 lists the conflicted files: open each, resolve preserving the intent of both sides, guided by the plan read in Step 2 — keep `master`'s change and re-express the plan's intent on top of it, never drop either — then re-run the same command to continue. After 5 attempts still conflicting, stop and report, PR left open.
- **Step 5 — Verify the implementation still meets the plan's goal.** Read the post-rebase diff (`git diff origin/master...HEAD`) against the plan's goal, proposed changes, tests, and out-of-scope list, item by item, because a resolved conflict silently loses hunks. Restore anything the rebase dropped and adapt anything `master` invalidated, staying inside the plan's scope; when the plan's stated approach is no longer possible on the new `master`, implement the plan's *goal* the way `master` now shapes it and append a one-paragraph note recording the adaptation to the plan file in the PR. Confirm the spec and documentation edits the plan called for survived too.
- **Step 6 — Make the build pass.** Iterate with `./scripts/run.mjs check-diff` on uncommitted repairs, and require `./scripts/run.mjs pr-check-gate` green before pushing — with the explicit note that `check-diff` sees only uncommitted work, so it is not sufficient on its own here. Never weaken a test or a lint rule to get green.
- **Step 7 — Commit and push the adjustments.** `./scripts/run.mjs pr-check-changes` first; if Step 5 and Step 6 produced nothing, the branch is already pushed by `pr-rebase` and this step is skipped. Otherwise commit through `./scripts/run.mjs pr-commit "<subject>" "<body>"` with a Conventional Commits subject, then `./scripts/run.mjs pr-push-branch origin <branch>`; on rejection, `git pull --rebase`, resolve, re-run the gate, retry — at most 3 times, never a bare force-push.
- **Step 8 — Confirm the PR is updated and still open.** `gh pr view <number> --json state,headRefName,headRefOid,url` must report `OPEN` with `headRefOid` equal to `git rev-parse HEAD`; re-confirm `MERGEABLE`. Do not merge.
- **Step 9 — Report**, in this fixed shape:

  ```
  PR:             <url> (#<number>)
  Branch:         <head branch>
  Plan:           <./product/plans/... file from the PR, or "none in the PR — used the PR body">
  Conflicts:      none | resolved in <n> rebase attempt(s) | unresolved after 5 attempts
  Plan goal:      met as written | met after adjustment — <one line> | not met — see above
  Adjustments:    <one-line summary of what was restored or adapted, or "none needed">
  Build:          pass | red — see errors above
  Status:         open (not merged)
  ```

**No other file changes.** No source, test, config, spec, or documentation edits — the task file is a prompt for agents, not executable code, and the task picker reads `ai/tasks/` fresh from disk on every open, so the new file appears with no registration step.

## Tests

None. This adds a markdown prompt with no code path, matching the precedent of every prior `ai/tasks/` change (`move-work-tasks-and-accept-named-item.md`, `ai-tasks-project-product-directory.md`, `rename-fix-a-small-issue-task.md`). `./scripts/run.mjs check-diff` must still run clean over the changed file.

## Spec and documentation

None needed. `./product/specs/task-picker.md` describes the picker's listing generically — files are read fresh from disk, recursing into subdirectories, with no enumerated task list and no fixed-depth claim — so a new file under `ai/tasks/workspace/` is already covered by the existing spec. `documentation/user-documentation/command-bar/tasks.md` likewise names tasks only as illustrative examples. Neither describes behavior that this change alters, and `work-an-issue.md`'s Step 6 rule is to not add documentation for previously undocumented behavior.

## Verification

- `./scripts/run.mjs check-diff` — clean over the new markdown file.
- Manual: `gh pr list --state open` in a repo with a conflicted feature PR, then `execute ./ai/tasks/workspace/resolve-conflicts.md <number>` — confirm the branch is rebased onto `master`, the plan's promises still appear in the diff, `pr-check-gate` is green, and `gh pr view <number> --json state` still reports `OPEN`.
- Manual: open the app, press `Ctrl+A`, expand the `workspace ▸` row — confirm `resolve-conflicts` is listed and picking it inserts `execute ./ai/tasks/workspace/resolve-conflicts.md`.

## Out of scope

- Any change to `build-a-feature.md`, `work-an-issue.md`, `merge-change-to-master.md`, or the other existing tasks — this adds a sibling, it does not rewire the ones that already handle conflicts inside their own merge flow.
- New or modified `scripts/pr-*.sh` — the task composes the existing scripts only.
- Merging, closing, reopening, or re-targeting pull requests, and any automation around PR review comments or check failures on GitHub's side.
- Resolving conflicts on multiple pull requests in one run — the task targets exactly one PR.
- Any source, test, spec, or user-documentation change in this repository.
