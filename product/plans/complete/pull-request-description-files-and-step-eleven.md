# Pull request description lists the shared dialog and step eleven reopens the dialog

**Complexity: 2/10** — a description correction. No source, test, spec, or documentation file changes. The only edits are to the plan and backlog files and to the body of pull request #1739, which is applied after the push.

## Goal

Make the body of pull request #1739 match the diff in two places: its Files changed list must name the shared confirmation dialog the delete dialog renders through, and How to verify step 11 must reopen the delete dialog before each dismissal. The title stays as it is.

## Problem

Checked against `git diff --name-only origin/master...HEAD`, `product/specs/scripts-tab.md`, and the dialog sources, the body is wrong in these places.

- Files changed names no area for `web/src/shared/ConfirmDialog.tsx`, `web/src/shared/ConfirmDialogShell.tsx`, or their test `web/src/shared/ConfirmDialog.test.tsx`. The branch adds the optional `notes` prop to both dialog files. The scripts delete dialog renders through `ConfirmDialog` with its notes. The other `ConfirmDialog` callers leave `notes` unset.
- Step 11 presses Cancel, then Escape, then clicks outside the dialog, and never reopens it. After Cancel no dialog is open, so the later Escape and click are not swallowed, and the click can select a different row. The following Delete and confirm then act on that row. The spec says a click outside the dialog is swallowed while the dialog is open, and that Cancel, Escape, and a click outside leave the file in place.

## Decision

Keep the four section headings in their order. Under the Client part of Files changed, add the two shared dialog files and their test, and state that the delete dialog renders through the shared `ConfirmDialog` with the optional `notes` prop, which the other callers leave unset.

Rewrite step 11 so each dismissal is followed by a fresh open of the dialog: Delete then Cancel; Delete then Escape; Delete then a click outside the dialog, which leaves the dialog open. The final confirm is `y` alone, not Delete then `y`, because the open dialog takes every key and a second Delete does nothing. The step still confirms the next row is selected.

## Changes

### Pull request body, applied after the push

- Files changed: under Client, the two shared dialog files and their colocated test are listed, with the statement about the optional `notes` prop and the callers that leave it unset.
- How to verify: step 11 is rewritten as described in the Decision. Every other step, section, and paragraph stays as the author wrote it.

### Backlog

- `product/backlog/pull-request.md`: the only entry is removed whole. The file is then restored to the master skeleton with `git checkout master -- product/backlog/pull-request.md`, after `git show origin/master:product/backlog/pull-request.md` is confirmed to be that skeleton.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. Verification is re-reading the rewritten body against `product/specs/scripts-tab.md` and the output of `git diff --name-only origin/master...HEAD`, and confirming that the two named dialog files and their test appear in Files changed. `check-diff` gates the change.

## Spec

`product/specs/scripts-tab.md` is unchanged. Its Delete section already states that `y` confirms, `n` and Escape cancel, a click outside the dialog is swallowed so the dialog stays open, and Cancel leaves the file in place. Step 11 now quotes that behavior.

## Docs

None needed. `help.md` and `documentation/user-documentation/` describe the implemented behavior, and this change alters no documentation.

## Out of scope

- Any source, test, spec, or config change.
- The pull request title.
- The other parts of the body, including the What and Behavior examples sections and the How to verify steps other than step 11.
- `web/src/theme.css`. The diff changes it, but no Files changed area names it. The entry does not name it, so it is not added here.
- `product/backlog/issues.md`.
