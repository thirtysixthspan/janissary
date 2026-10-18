# Pull request description names the shared theme stylesheet

**Complexity: 1/10** — a description correction. No source, test, spec, or documentation file changes. The only edits are to the plan and backlog files and to the body of pull request #1739, which is applied after the push.

## Goal

Make the Files changed list in the body of pull request #1739 name `web/src/theme.css`, the shared stylesheet this branch changes to add the `.modal-note` class. The title stays as it is.

## Problem

Checked against `git diff --name-only origin/master...HEAD`, the body's Files changed list names every non-test, non-plan file the branch changes except `web/src/theme.css`. The branch adds the rule `.modal-note { color: var(--muted); }` to that stylesheet. `ConfirmDialogShell` renders each note line with the `modal-note` class between the title and the buttons, so the muted color of the scripts tab's delete dialog notes comes from that stylesheet. A reviewer who scopes the shared dialog from the list would miss that the stylesheet changed.

## Decision

Under the Client part of Files changed, add a bullet for `web/src/theme.css` beside the shared confirmation dialog bullets. The bullet states that the file adds the `.modal-note` class, which sets the muted color for the note lines `ConfirmDialogShell` renders between the title and the buttons. Keep the author's section headings and their order, and leave every other paragraph as written.

## Changes

### Pull request body, applied after the push

- Files changed: under Client, one bullet for `web/src/theme.css` placed after the shared confirmation dialog's test bullet.
- No other part of the body changes.

### Backlog

- `product/backlog/pull-request.md`: the first entry, the theme stylesheet correction, is removed whole. The entry for the oversized-runscript feed report stays byte-for-byte unchanged, and the file keeps its leading comment and heading.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. Verification is reading the edited body back and checking its named files against the output of `git diff --name-only origin/master...HEAD`, with `check-diff` as the gate.

## Spec

`product/specs/scripts-tab.md` is unchanged. The change alters no behavior the spec describes.

## Docs

None needed. `help.md` and `documentation/user-documentation/` describe the implemented behavior, and this change alters no documentation.

## Out of scope

- Any source, test, spec, or config change.
- The pull request title.
- The other parts of the body, including the What, Behavior examples, and How to verify sections.
- The other backlog entry, which concerns the oversized-runscript feed report.
- `product/backlog/issues.md`.
