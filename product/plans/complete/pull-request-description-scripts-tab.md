# Pull request description names the scripts tab it implements

**Complexity: 2/10** — a description correction. No source, test, spec, or documentation file changes. The only edits are to the plan and backlog files and to the body of pull request #1739, which is applied after the push.

## Goal

Make the body of pull request #1739 describe the aggregate diff of `feature/scripts-tab` against `origin/master`, which is the scripts tab the code implements, instead of a planning-only change. The title stays as it is.

## Problem

The body was written when the branch held only planning documents. Checked against `git rev-list --count origin/master..HEAD` (57 commits), `git diff --name-only origin/master...HEAD`, and `product/specs/scripts-tab.md`, it is wrong in these places.

- It says the pull request adds planning documents only, that no code, tests, or user documentation change, and that nothing is implemented. The diff adds the tab across `src/`, `web/src/`, the specs, `help.md`, and the user and developer docs.
- It says the branch has two commits and that the verification steps apply only once commits land.
- It says the Git exclusion step runs once when the tab opens. The Command and tab section of the spec says every `scripts` run sends `ensureDirectory`, including a run that only focuses an open tab, and `src/plugins/scripts/activate.ts` sends that action before it opens or focuses the tab.
- It says failures go to the feed "as `execute` already does". The Execute section of the spec says the command prints its failure lines in the transcript, and the tab sends the same lines to the feed.
- Its flows omit the row numbering. The Rows section says each row is numbered `1)`, `2)`, and so on.
- Its flows omit the failure lines `Could not run runscript "<name>".` and `Could not use the runscripts directory.`, which the Failure text table lists.
- Its delete dialog flow omits the keys. The Delete section says `y` confirms, `n` and Escape cancel, Left and Right move the highlight between the two buttons, and Enter chooses the highlighted button, with the highlight starting on `Cancel`.
- It says the row buttons are execute, delete, and clone. The spec and the tooltips are Run, Duplicate, and Delete.
- Its Delete flow says the selection moves to the next row after any delete. The Delete section says it moves only when the deleted row was the selected one.

## Decision

Rewrite the body in place and keep its four section headings in their order: What, Behavior examples, How to verify, and Files changed. There is no additional test cases section. Quote the spec's wording for the failure lines and the delete keys rather than paraphrasing it. Summarize the commits by stage and point to `git log origin/master..HEAD` for the full list, so the body does not carry a count that goes stale on the next commit. List the Files changed areas rather than every file. Keep the How to verify steps unchanged except for removing the sentence about when they apply.

## Changes

### Pull request body, applied after the push

- What: the first paragraph states that the pull request adds the scripts tab and describes the commits by stage. The second paragraph names the row buttons as Run, Duplicate, and Delete, and says each row is numbered. The fourth paragraph says the exclusion step runs on every `scripts` command, and that failures go to the feed while `execute` keeps its transcript output.
- Behavior examples: the intro no longer says the flows are planned. The layout block is numbered and uses the spec's button names. Flow 4 gains a step for the dialog's keys and corrects the selection rule. Flow 7 gains the `Could not run runscript` line and the `Could not use the runscripts directory.` line, quoted from the Failure text table.
- How to verify: the sentence saying the steps apply only once commits land is removed. The steps and their expected results are unchanged.
- Files changed: rewritten to list the aggregate areas from `git diff --name-only origin/master...HEAD`, with the planning-only paragraph removed.

### Backlog

- `product/backlog/pull-request.md`: the first entry is removed whole, with its separating blank lines. The other two entries stay byte for byte.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. Verification is re-reading the rewritten body against the spec sections named in the Decision and against the output of `git diff --name-only origin/master...HEAD`, and confirming that no sentence still says planning documents only. `check-diff` gates the change.

## Spec

`product/specs/scripts-tab.md` is unchanged. It already states the behavior the body now quotes.

## Docs

None needed. `help.md` and `documentation/user-documentation/` already describe the implemented behavior, and this change alters no documentation.

## Out of scope

- Any source, test, or spec change. If the code and the spec disagree on a point the body describes, that is a separate entry.
- The pull request title.
- The other two entries in `product/backlog/pull-request.md`.
- Rewording the How to verify steps beyond removing the sentence about when they apply.
