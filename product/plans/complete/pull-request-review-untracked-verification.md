# Verify a newly created pull-request backlog on the path where git cannot see it

**Complexity: 3/10** — one step of one markdown task file. No source, no test, no protocol, no UI. The care is in splitting the check on a signal that is already available (`git status --porcelain`'s status code) rather than adding a new command, and in matching each of the two revert remedies to the state it actually applies to.

## Goal

`ai/tasks/pull-request-review.md` Step 4's point 5 tells the reader to confirm the write with `git diff` and to revert strays with `git checkout -- <file>`. Both commands act only on **tracked** files. On the most common path — the first review on a branch, which creates `./product/backlog/pull-request.md` — the file is untracked, so `git diff` prints nothing at all and `git checkout --` cannot remove a stray. The verification is vacuous exactly when it matters most, and the stated remedy cannot do what the sentence claims for half the states it covers.

Split the check on the marker `git status --porcelain` already reports, and name both remedies.

## Approach

`git status --porcelain` distinguishes the two states in its first two columns: `??` for an untracked file, a modification marker (`M`, ` M`) for a tracked one that changed. The step already runs that command, so the signal needed to route the check is present before any new command is introduced — this is a rewording, not a new mechanism.

For the untracked case the substitute for `git diff` is reading the file back and confirming its contents: the four standard headings plus the entries just written and nothing else. That is a strictly stronger check than `git diff` gives in the tracked case, since it inspects the whole file rather than the delta.

For the revert, `git checkout -- <file>` stays correct for a tracked file that was modified, and deleting the file is the remedy for an untracked stray. Both are named, each against the state it applies to.

The reason this matters is worth stating in the step itself: Step 5 runs `pr-commit`, which stages with `git add -A`. An untracked stray that survives the revert is swept into the review's commit, breaching the task's own tenth forbidden rule ("Committing anything other than `./product/backlog/pull-request.md`").

## Design decisions

1. **Route on the porcelain status code, not on a separate existence test.** The step already runs `git status --porcelain` and must read its output to satisfy the "names the backlog file and nothing else" half of the check. Reading two more characters of that same line is free; adding a `test -f` or a `git ls-files` call would be a second command answering a question the first already answered.

2. **The untracked case is verified by reading the file, not by `git add` followed by `git diff --cached`.** Staging to make the file visible to `git diff` would work, but it moves a step's verification into the index and leaves the run in a different git state than it started in, which the commit step then inherits. Reading the file back has no side effect.

3. **Both revert remedies are named explicitly rather than replaced by a single catch-all.** `git checkout -- <file>` is right for a tracked modification and cannot help an untracked stray; deleting the file is right for an untracked stray and would discard committed content for a tracked one. A single instruction covering both would have to be vague enough to be useless.

4. **Only the task file changes; the plan keeps its original wording.** The same flawed sentence appears in `./product/plans/complete/pull-request-review.md` under its Step 4, which was verified before writing this plan. That file is the record of what was planned and shipped, not an executable copy — editing it would rewrite history to look as though the flaw was never there. The task file is the copy an agent actually runs.

## Implementation steps

One file changes: `ai/tasks/pull-request-review.md`.

1. Rewrite Step 4's point 5. Keep its opening requirement — `git status --porcelain` names `./product/backlog/pull-request.md` and nothing else — then branch on the marker that command reports:
   - When the line begins `??`, the file is newly created and invisible to `git diff`. Verify it by reading it back and confirming it carries the four standard `##` headings plus the entries just written, and nothing else.
   - When the line carries a modification marker, the file was already tracked, and `git diff` showing only appended lines inside `## development` is the right check — the existing wording applies unchanged.
2. Replace the single revert sentence with both remedies, each against its state: `git checkout -- <file>` for a tracked file that was modified, and deleting the file for an untracked stray.
3. Add one sentence naming why the step exists: Step 5 stages with `git add -A`, so anything left behind rides along in the review's commit, which forbidden rule 10 prohibits.

Keep the step's position, numbering, and surrounding points as they are. Nothing else in the task file changes.

## Tests

No automated tests. The change is one markdown file under `ai/tasks/`, so there is no test surface: `./scripts/run.mjs check-diff` runs lint only for lintable extensions and `tsc`/tests only for paths under `src/` or `web/`, so it assembles an empty tool list and exits 0. That is the expected result, not a gap.

The behavior this fixes is verified by running the task, which is what the Verification section covers.

## Out of scope

- Editing `./product/plans/complete/pull-request-review.md`, which carries the same wording as the historical record (decision 4).
- Any other step of `ai/tasks/pull-request-review.md`, and the other four entries in `./product/backlog/pull-request.md`, each of which is its own unit of work.
- Making the check enforceable rather than a prose instruction. An agent can still skip the step; closing that would mean a wrapper script around the commit, which is a different and much larger change.
- The `git add -A` behavior of `scripts/pr-commit.sh` itself, which is shared by every task that commits and is not this entry's to change.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual, the untracked path: on a branch with no `./product/backlog/pull-request.md`, run `execute ./ai/tasks/pull-request-review.md <number>` against an open pull request with at least one finding. At Step 4's verification, confirm the run reads the file back rather than relying on `git diff`, and that it does not report the empty `git diff` as a failed write.

Manual, the tracked path: run it a second time against the same pull request after a change that yields a new finding. Confirm the file now shows a modification marker rather than `??`, that `git diff` is used, and that it shows only appended lines inside `## development`.

Manual, the stray: with an untracked stray file present in the working tree alongside the backlog file, confirm the step names deletion as the remedy and that the resulting commit contains only `./product/backlog/pull-request.md`.
