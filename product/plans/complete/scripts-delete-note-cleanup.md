# Scripts delete note cleanup

**Complexity: 1/10** — one dead CSS rule deleted, one class added beside `.modal-title`, one inline style replaced by that class, and one test assertion rewritten. The note color and the markup of every caller that passes no notes stay the same.

## Goal

Give the delete dialog's note lines one home for their color, retire the dead rule that nothing renders, and make the scripts delete test's absent-note check able to fail.

## Problem

Checked by reading the code on `feature/scripts-tab` (PR #1739) before any change.

- `web/src/plugins/scripts/scripts.css` line 27 defines `.scripts-delete-note`. A grep of `web/src` finds no component that renders it. The only other reference is the query in `web/src/plugins/scripts/DeleteScriptDialog.test.tsx` line 54.
- The test named "leaves out both lines for a runscript with no schedule and no open tab" checks `querySelector('.scripts-delete-note')` for null. No element carries that class, so the check passes whatever the dialog shows.
- `web/src/shared/ConfirmDialogShell.tsx` line 23 colors each note with `style={{ color: 'var(--muted)' }}`, because `web/src/theme.css` has no class for note lines beside `.modal-title` (line 660).
- The token is the right one. `--muted` is defined in all six theme blocks of `web/src/theme.css` (lines 39, 63, 82, 101, 120, 139), and the inline style already uses it, so the rendered color does not move.

## Approach

1. Delete `.scripts-delete-note` from `web/src/plugins/scripts/scripts.css`. A grep of the whole project shows only the test names it, and that query is rewritten in step 4.
2. Add `.modal-note { color: var(--muted); }` to `web/src/theme.css`, directly after `.modal-title`.
3. In `web/src/shared/ConfirmDialogShell.tsx`, replace the inline style on each note element with `className="modal-note"`. The key, the text, and the order stay as they are.
4. In `web/src/plugins/scripts/DeleteScriptDialog.test.tsx`, rewrite the named test so it asserts with `queryByText` that neither note text is in the document, and drop the dead class query.

## Shared-component check

`ConfirmDialogShell` renders note elements only inside `notes.map`, and `notes` defaults to `[]`, so a caller that passes no notes gets no note element at all. Only `DeleteScriptDialog` passes notes, through `ConfirmDialog`. The callers that pass none are `QuitDialog`, `UnsavedQuitDialog`, and `DeleteFileDialog` (shell), and `DeleteRowDialog`, `SessionList`, `ConversationList`, and `RemoteSessionButton` (`ConfirmDialog`). The edit changes only the attribute on a note element, so their markup is identical. No rule under `.modal` in any stylesheet targets a child `div`, so the new class cannot restyle anything else. `.modal-note` is not already used anywhere.

## Implementation steps

1. `web/src/plugins/scripts/scripts.css`: delete the `.scripts-delete-note` rule.
2. `web/src/theme.css`: add `.modal-note { color: var(--muted); }` after `.modal-title`.
3. `web/src/shared/ConfirmDialogShell.tsx`: replace the inline style with `className="modal-note"`.
4. `web/src/plugins/scripts/DeleteScriptDialog.test.tsx`: rewrite the named test as described under Tests.

## Tests

The rewritten test is "leaves out both lines for a runscript with no schedule and no open tab". With zero schedules and the runscript closed, it asserts that `queryByText` returns null for "Used by 1 system schedule. It will fire as missing after this." and for "Open in an editor tab. The tab keeps its text.". The `.scripts-delete-note` query is removed. The test name stays the same.

The rewritten assertions fail when a note line is wrongly shown, because `queryByText` matches an element whose text equals the string. An open-tab line rendered for a closed runscript, or a singular schedule line rendered for zero schedules, would be found, and the assertion would fail. The check is confirmed by reading the logic, not by a mutation run.

The known limit is that the plural zero-count text is not one of the two strings. `systemScheduleLine` returns null for a count below one, so the dialog does not produce that line today. The entry names these two strings, so the plural case is recorded here rather than added.

Every other test in `DeleteScriptDialog.test.tsx` and `web/src/shared/ConfirmDialog.test.tsx` stays unchanged. The note tests there query note text, which still renders with the class in place of the inline style.

## Spec

Unchanged. The note lines keep their text, order, and color, and `product/specs/scripts-tab.md` does not describe color or class names. No user-visible behavior changes.

## Docs

None needed. `help.md` and `documentation/user-documentation/` do not describe the delete dialog's styling.

## Out of scope

- A zero-count plural assertion in the rewritten test, as described under Tests.
- The pull request description correction, which is a separate entry in `product/backlog/pull-request.md`.
- Changes to `ConfirmDialog.tsx`, to the other shared-dialog callers, or to `web/dist`, which is gitignored build output.
- Completed plans that mention `.scripts-delete-note` in `product/plans/complete/`, which stay as historical records.
