# Correct the reveal step's undo expectation

**Complexity: 1/10** — a description-only correction: no production lines or production files change, 4 stated requirements, no test scenarios (p=2.713). The work is confined to step 13's two lines in the pull request body, one backlog entry, and this plan.

## Goal

Make step 13 of pull request #2009's "How to verify" section describe the undo behavior a reviewer actually gets: one undo after typing past the reveal chord removes only the text typed after the click back into the buffer, and a second undo removes the first typed character. The chord itself swallows no keystroke and records no undo step.

## Problem

The body's current step 13 reads:

> **The chord leaves the buffer and its undo history alone**
> Do: Click into the `long-line.md` buffer, type `x`, press Cmd+Shift+E, type `y`, then press Cmd+Z once.
> Expect: The buffer immediately after the chord shows `x` and no `e`, and one undo removes both `x` and `y`, returning the line to `one two three four five`. The chord recorded no undo step and sealed nothing.

Checked against the code, the expectation is wrong in two ways.

- After the chord focuses the tree, typing `y` requires clicking back into the buffer. That click runs the editor's mousedown handler, which calls `api.sealUndo()` (`web/src/editor/useEditorMouse.ts:78`) before placing the caret. `UndoBuffer.seal()` clears only the coalescing kind (`web/src/editor/undo.ts:34`), so it starts a new typing group without recording an undo step.
- Undo records the state before each edit (`web/src/editor/applyKeyAction.ts:134`). The entry pushed for `y` holds the buffer with `x` already typed, so one undo leaves `xone two three four five`; a second undo pops the entry recorded before `x` and restores `one two three four five`.

The chord itself is not the cause. `actionForKey` maps Cmd+Shift+E to the `revealInNavigator` action, and `useEditorInteractions.claimKey` calls `reveal()` and returns without applying an editor action, sealing undo, or touching state (`web/src/editor/useEditorInteractions.ts:100`). `sendRevealInFileNavigator` only sends the request RPC (`web/src/editor/editor-file-commands.ts:38`). A no-chord control run — click a tree row, then click back into the buffer — produced the same two-step undo, confirming the seal comes from the pre-existing click-into-buffer behavior, not from the feature.

The existing test `adds no undo step and seals no typing group on Cmd+Shift+E` (`web/src/editor/EditorTab.test.tsx:813`) remains correct: it drives key events without a refocus click, so the two typing groups coalesce and one undo removes both characters. It asserts the chord's own behavior, which the corrected step now states explicitly.

## Decision

Replace only step 13's `Do:` and `Expect:` lines. Keep the heading and every other paragraph of the body byte-for-byte. The replacement wording is:

> Do: Click into the `long-line.md` buffer, type `x`, press Cmd+Shift+E, click back into the buffer, type `y`, then press Cmd+Z once and again.
> Expect: the buffer immediately after the chord shows `x` and no `e`, so the chord swallowed no keystroke and added no undo step. Returning focus to the buffer starts a new undo group, so one undo removes only `y` and the line reads `xone two three four five`; a second undo removes `x` and the line returns to `one two three four five`.

Applying this after the push keeps the live description from claiming work that is not yet on the branch.

## Changes

### Pull request body, applied after the push

- Step 13's `Do:` line gains `click back into the buffer` after the chord and changes the undo instruction to `press Cmd+Z once and again`.
- Step 13's `Expect:` line states that the chord swallowed no keystroke and added no undo step, that returning focus starts a new undo group, that one undo leaves `xone two three four five`, and that a second undo restores `one two three four five`.
- Every other paragraph, including the whole `### Additional test cases` section, stays as the author wrote it. The title is untouched.

### Backlog

- `product/backlog/pull-request.md`: remove the single entry whole. The file is then drained and restored to the master comment-and-heading skeleton.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to pull request prose, plan text, and backlog text, and it changes no behavior. `./scripts/run.mjs check-diff` assembles an empty tool list because nothing under `src/` or `web/` changes; that is the expected result. Verification is re-reading the applied body against the code behavior above and confirming step 13 is the only changed part.

## Spec

No spec change. `product/specs/editor-tab.md` already describes the reveal's focus behavior and the rule that cursor-only moves never become undo steps; it makes no claim about a single undo spanning the refocus click. The corrected description now matches that spec, so nothing in it is stale.

## Docs

None needed. This change alters no documented command, flag, key binding, or user-facing behavior.

## Out of scope

- Any source, test, spec, config, help, or user-documentation change.
- The pull request title.
- The canonical feature plan, `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`.
- Other parts of the body, including the `### Additional test cases` section, which belongs to the test task.
- The existing test's name or assertions; it covers the chord's own behavior, not the refocus click.
- `product/backlog/issues.md`.
