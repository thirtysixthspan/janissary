# Pull request description names the editor opener and lists the oversized-runscript refusal

**Complexity: 2/10** — a description correction. No source, test, spec, config, or documentation file changes. The only edits are to the plan and backlog files and to the body of pull request #1739, which is applied after the push.

## Goal

Make the body of pull request #1739 match the diff in two places. Files changed must name `src/openers/editor.ts`, the shared editor opener the branch changes. Flow 7 must list the oversized-runscript refusal that the spec's Failure text table carries. The title stays as it is.

## Problem

Checked against `git diff --name-only origin/master...HEAD`, `product/specs/scripts-tab.md`, and the source, the body is wrong in these places.

- The branch changes `src/openers/editor.ts`. It adds `editorSizeRefusal`, which `openInEditor` now calls, and the tab's runscript actions in `src/plugins/runscript-topic-actions.ts` call it as well. No area under Files changed names that file.
- The spec's Failure text table gives `edit: <name>.rs is <size> — too large to edit in-app (limit <size>).` for Open and Duplicate. Flow 7 has no line for it.

## Decision

Keep the four section headings in their order. Under the Server part of Files changed, add one bullet for `src/openers/editor.ts` after the `src/commands/execute.ts` bullet, and name its colocated test. Add one numbered item at the end of Flow 7 with the spec's wording exactly, for Open and Duplicate, and note that for Duplicate the name is the copy's.

The entry's Proposal also lists Enter. The spec's table names Open and Duplicate only, and Enter sends the same `open` action as Open, so the Flow 7 line follows the table.

Make no source change. The refusal's wording is unchanged by the helper, and the refusal is already pinned by `src/openers/editor.test.ts` and `src/plugins/runscript-topic-actions.test.ts`.

## Changes

### Pull request body, applied after the push

- Files changed, Server part: one bullet naming `src/openers/editor.ts`, the `editorSizeRefusal` helper that `openInEditor` now calls, and its test `src/openers/editor.test.ts`.
- Flow 7: one numbered item after item 8, quoting the spec's refusal line for Open and Duplicate.
- Every other paragraph, section, and heading stays as the author wrote it, and the Additional test cases section is not present in this body.

### Backlog

- `product/backlog/pull-request.md`: the description entry is removed whole, with its separating blank lines. The spec-basis entry stays byte-for-byte.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request text and to plan and backlog files, and it changes no behavior. The refusal's behavior is already pinned by `src/openers/editor.test.ts`, which covers `editorSizeRefusal` and the inline refusal, and by `src/plugins/runscript-topic-actions.test.ts`, which covers the Open and Duplicate refusal lines. Verification is re-reading the new body against `git diff --name-only origin/master...HEAD` and against the spec's table row, and `check-diff` gates the change.

## Spec

`product/specs/scripts-tab.md` is unchanged. Its Failure text table already carries the refusal row that the body now quotes.

## Docs

None needed. This change alters no behavior, so `help.md` and `documentation/user-documentation/` stay as they are.

## Out of scope

- Any source, test, spec, or config change, including the `src/openers/editor.ts` helper itself.
- The pull request title.
- The other parts of the body.
- The spec-basis backlog entry about the scripts refresh tick gate, which stays for its own run.
- `product/backlog/issues.md`.
