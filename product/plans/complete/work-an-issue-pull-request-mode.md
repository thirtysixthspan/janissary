# Work-an-issue pull request mode

**Complexity: 2/10** — one markdown task file changes. No source, no test, no protocol, no UI. The care is in the routing rule and in defining precisely when the pull-request backlog file is deleted rather than merely emptied.

## Goal

`ai/tasks/work-an-issue.md` should accept a **pull request number** as its invocation argument, and that argument alone should put the run in PR mode. In that mode the work item is drawn from `./product/backlog/pull-request.md` **on the pull request's own head branch** — the file `ai/tasks/pull-request-review.md` writes — rather than from `./product/backlog/issues.md` on master. When the fix is complete the resolved entry is removed from that pull-request backlog, and when no entries remain anywhere in the file, the file itself is deleted from the branch.

The existing `PR <number>: <issue text>` text-prefix trigger is removed. Issues in `./product/backlog/issues.md` are no longer prefixed with `PR #`, and a pull-request work item is never recorded there: it lives strictly in the branch's own pull-request backlog.

## Approach

Today PR mode is entered by a *text prefix* on the named work item (`PR 232: keep the palette open`), which makes the pull request number part of a string that is otherwise the issue text, and leaves the issue text itself coming from the invocation or from `issues.md`. After this change the argument *is* the pull request reference, and the issue text comes from the branch's backlog. That inverts where the work item is read from, so the edits cluster in the preamble's mode paragraph, Step 0, Step 1, Step 7, and Step 9.

The change is confined to `ai/tasks/work-an-issue.md`. A repository-wide grep for the `PR <number>:` convention found it defined nowhere else — the other matches are historical plan files in `./product/plans/complete/` recording past runs, which stay as written because they are records of what happened, not instructions.

## Design decisions

1. **PR mode is triggered by the shape of the argument, not by a prefix on it.** An invocation argument that is a bare positive integer, a `#`-prefixed integer, or a GitHub pull request URL is a pull request reference and enters PR mode. Anything else is ordinary work-item text and runs the existing master-merge path. Each of those three forms is accepted directly by `gh pr view`, which is what Step 0 already calls. A head branch name is deliberately **not** accepted even though `gh pr view` would resolve one: branch names and issue text are both free-form strings, and no rule could tell them apart without guessing.

2. **The `PR <number>:` prefix is deleted outright, not deprecated.** These task files carry no compatibility window — they are prompts read fresh on each run, not a published API with callers to migrate. Leaving both triggers in place would mean two ways to reach the same mode with different sources for the work item, which is precisely the confusion this change exists to remove.

3. **In PR mode the work item comes from `./product/backlog/pull-request.md` on the checked-out branch, and `./product/backlog/issues.md` is neither read nor written.** That file lives on master and describes master's problems; a pull request's problems belong to the pull request. This is also what makes "no longer prefixed with `PR #`" true in practice rather than by convention — there is no longer any path by which a pull-request work item reaches the issues file.

4. **An optional selector may follow the reference.** `execute ai/tasks/work-an-issue.md 978` takes the first resolvable entry; `execute ai/tasks/work-an-issue.md 978 "the untracked file check"` selects a specific one. Step 1 already has the matching language for this ("quoted text, a paraphrase, or a position such as 'the second one'"), so the selector reuses it rather than inventing a second scheme. Unlike an ordinary named work item, a selector that matches no entry is an error rather than a new work item — in PR mode the backlog is the only source, so an unmatched selector means the caller is asking for something that is not there.

5. **Entries are walked `## ready` first, then `## development`; `## deferred` and `## declined` are never taken from.** `pull-request-review.md` appends to `## development`, and a human promoting an entry to `## ready` is expressing priority, so `## ready` is read first. The two remaining sections record decisions a human made to not do the work, and silently overriding them would make triage meaningless.

6. **The complexity threshold is unchanged and applies per entry.** Walk from the top, rate each entry, and take the first rated below 7. If every entry rates 7 or higher, report the list with ratings and stop, which is exactly what Step 1 already does for the issues file.

7. **Removing an entry removes the whole entry, not a line.** A pull-request backlog entry is the five-part structure `pull-request-review.md` defines: an entry begins at its `*` bullet and runs through its `Proposal` paragraph. Step 7's existing "remove the line" wording is correct for `issues.md`, whose entries are single bullets, and wrong here, so PR mode gets its own sentence rather than sharing that one.

8. **The file is deleted only when no entries remain in any of the four sections.** An entry sitting in `## deferred` or `## declined` is a human decision on the record, and deleting the file would erase it — so "no issues remain" means the file has been fully drained, not that the actionable sections are empty. When entries remain anywhere, the emptied section is left with its heading in place, matching every other backlog file in `./product/backlog/`.

9. **The deletion is staged with `git rm`, and rides the same commit as the fix.** The file is tracked on the branch by the time this task runs, since `pull-request-review.md` committed it. `pr-commit` stages with `git add -A`, which records a deletion made with a plain `rm` as well — but `git rm` states the intent at the point it happens and fails loudly if the file is not tracked, which is the better failure.

10. **A pull request with no backlog file, or an empty one, stops the run.** In PR mode the backlog is the only source of work, so a missing or fully-drained `./product/backlog/pull-request.md` is not an invitation to fall back to `issues.md` or to the argument text — it means there is nothing to do, and the run reports that and stops.

## Implementation steps

One file changes: `ai/tasks/work-an-issue.md`.

1. **Opening paragraph.** Replace the sentence "A named work item prefixed with `PR <number>:` instead updates that open pull request's branch and leaves the pull request open" with one describing the new trigger: a pull request number as the argument enters PR mode, drawing the work item from the pull request branch's own `./product/backlog/pull-request.md`. Add `./product/backlog/pull-request.md` to the closing list of what this task may change.

2. **The "PR update mode" preamble paragraph.** Rewrite it around the new trigger. State the three accepted reference forms and the optional selector (decisions 1 and 4), that the work item is drawn from the branch's pull-request backlog and never from `issues.md` (decision 3), that the completed entry is removed from that backlog, that the file is deleted when it is fully drained (decision 8), and that the pull request is left open. Keep the existing closing sentence that these rules override every general instruction to merge to master.

3. **Allowed list.** Add reading, editing, and deleting `./product/backlog/pull-request.md` on the pull request's head branch. Leave the `issues.md` entry as it is — it is the ordinary-mode source.

4. **Forbidden list.** Rules 7 and 8 (never merge or replace a pull request in PR mode; never update a pull request that is not `OPEN`) stay as written. Add two: in PR mode, never read or edit `./product/backlog/issues.md`, and never delete `./product/backlog/pull-request.md` while any entry remains in any of its four sections. Amend rule 5 so its "never add a work item named at invocation to the file" clause reads as ordinary-mode only.

5. **Step 0.** The PR-mode branch already checks out the head branch correctly and needs only its trigger reworded from the prefix to the argument. Keep its five sub-steps unchanged, including the dependency install — unlike `pull-request-review.md`, this task builds and tests, so it needs `node_modules`.

6. **Step 1.** Give PR mode its own branch ahead of the two existing ones. It reads `./product/backlog/pull-request.md` from the checked-out branch; stops with a clear report when the file is absent or holds no entries (decision 10); walks `## ready` then `## development` (decision 5); applies the selector when one was given, stopping if it matches nothing (decision 4); rates each entry and takes the first below 7, stopping with the list if all are 7 or higher (decision 6). Delete the existing "In PR update mode, use only the text after `PR <number>:` as the issue text throughout selection, planning, backlog matching, and reporting" sentence from the named-item branch, and state that the entry's `*` bullet is the issue text while its `Proposal` paragraph is the starting point for Step 2's plan.

7. **Step 7.** Add a PR-mode branch to sub-step 2. It removes the resolved entry whole — `*` bullet through `Proposal` paragraph, plus the blank lines separating it from the next entry — leaving every other entry and all four headings byte-for-byte untouched; then, if no entry remains in any section, removes the file with `git rm ./product/backlog/pull-request.md` (decisions 7, 8, 9). State that `./product/backlog/issues.md` is not touched in this mode.

8. **Step 9.** In the PR-mode report shape, change the `Issue` line from "the issue text after the PR prefix" to the resolved entry's summary bullet, and add a `Backlog` line recording what happened to the file — the entry removed with a count of what remains, or the file deleted because it was drained.

## Tests

No automated tests. The change is one markdown file under `ai/tasks/`, so there is no test surface: `./scripts/run.mjs check-diff` classifies changed files and runs lint only for lintable extensions and `tsc`/tests only for paths under `src/` or `web/`, so it will assemble an empty tool list and exit 0 printing a blank summary and a `total:` line. That is the expected result, not a gap.

The behaviors worth checking by hand, because they are the ones a reader of the task file could execute wrongly, are listed under Verification below.

## Out of scope

- Changing what `ai/tasks/pull-request-review.md` writes, or the five-part entry format itself. This task consumes that file; it does not redefine it.
- Any change to `./product/backlog/issues.md` or to ordinary mode's behavior beyond removing the prefix trigger.
- Retrofitting the historical `PR #` references in `./product/plans/complete/`. Those are records of runs that happened under the old convention and stay accurate as records.
- Accepting a head branch name as a pull request reference (decision 1).
- A compatibility period in which both the prefix and the number work (decision 2).
- Draining more than one entry per run. One work item per run is unchanged.
- Teaching `resolve-technical-debt.md` or any other consumer to read the pull-request backlog.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual, PR mode: with pull request 978 open and carrying a `./product/backlog/pull-request.md` with five entries, run `execute ./ai/tasks/work-an-issue.md 978`. Confirm it checks out the head branch, picks the first entry under `## development`, never reads `./product/backlog/issues.md`, and on completion removes exactly that entry — leaving four, with all four headings intact and the other entries byte-identical — then commits and pushes to the branch with the pull request still open.

Manual, the selector: run `execute ./ai/tasks/work-an-issue.md 978 "the untracked file check"` and confirm it resolves to that specific entry. Run it with a selector matching nothing and confirm it stops rather than treating the selector as a new work item.

Manual, the drain: run it repeatedly against the same pull request until one entry remains, then once more, and confirm the file is removed from the branch with `git rm` in that final commit. Repeat with one entry left in `## deferred` and confirm the file is **kept**, with `## development` left empty but present.

Manual, the refusals: run it against a merged pull request number and confirm it stops without checking anything out; run it against an open pull request that has no `./product/backlog/pull-request.md` and confirm it reports that there is nothing to work and stops rather than falling back to `issues.md`.

Manual, ordinary mode unaffected: run `execute ./ai/tasks/work-an-issue.md "<some issue text>"` and confirm it behaves exactly as before — master, `issues.md`, merge at the end. Run it with a work item whose text begins `PR 232:` and confirm that text is now treated as ordinary issue text rather than as routing metadata.
