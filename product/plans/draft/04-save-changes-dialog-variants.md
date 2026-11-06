# Extend the save-changes dialog for the walk

**Complexity: 3/10** — three optional props, a controlled/uncontrolled selection branch, one width-capping class, and tests that must leave every existing dialog case unchanged.

## Goal

Extend the moved `web/src/unsaved-work/SaveChangesDialog.tsx` so the quit walk can reuse it without changing the single-tab close dialog:

- an optional `title`, defaulting to the existing `Do you want to save changes to this file?`;
- an optional controlled selection (`selected` plus `onSelect`), while the dialog keeps its own Save-first selection when those props are absent;
- an optional `className` passed through to `ModalDialog`, plus one `.save-walk-dialog` class in `web/src/theme.css` that caps the walk dialog's width and lets its title wrap and break inside long words.

The single-tab close dialog passes none of the new props. Its title, default selection, keyboard behavior, and markup stay exactly as they are.

## Dependencies and ordering

This subplan depends on `01-move-unsaved-work-modules` for `web/src/unsaved-work/SaveChangesDialog.tsx` and its test. Subplan `05-save-confirm-request-state` imports the exported three-choice type, and subplan `06-quit-walk-guard` passes all three new props. No behavior in the walk exists until `06`.

## Design decisions

- The existing private three-value union `'save' | 'discard' | 'cancel'` becomes an exported `SaveChoice` type from `SaveChangesDialog.tsx`. The values and their order stay unchanged. `useSaveConfirm` and `useQuitWalk` import it as a type; the dialog remains the one definition of the three choices.
- `title?: string` defaults to the current sentence. The dialog renders it through `ModalDialog`'s existing `title` prop, so it stays the visible heading inside the `role="alertdialog"` modal. No second title element is added.
- The controlled selection is a union: either both `selected` and `onSelect` are present, or neither is. Passing only one is a type error. This prevents a dialog that reports selections nobody owns.
- In uncontrolled mode (neither prop), the dialog keeps its local state starting at `'save'`. The arrow keys cycle that local state, `Enter` runs the current local choice, and every existing test passes unchanged.
- In controlled mode, the dialog does not keep a competing local selection for the rendered choice. The arrow keys compute the next choice from the `selected` prop and report it through `onSelect`; they do not update local state. `Enter` runs the choice passed in `selected`. The parent is expected to feed the new choice back; that is what carries the selection between walk steps.
- `y` still calls Save and `n` still calls Don't Save regardless of which choice is selected, in both modes. `Escape` still calls Cancel. Save still does nothing while `saving` is true, and the Save button stays disabled while pending. Don't Save and Cancel stay available.
- `className?: string` is passed straight through to `ModalDialog`'s existing `className` prop, which already appends it to the modal root's `modal` class. No dialog shell logic is duplicated.
- Name the walk class `.save-walk-dialog`. It is applied only by the walk branch in `06`; the close dialog passes no class, so other modals are untouched.
- In `web/src/theme.css`, place `.save-walk-dialog` and its title rule next to `.modal-title` near line 661. The class caps the dialog's width at `min(560px, calc(100vw - 32px))`, keeping the existing `min-width: 280px` behavior below that cap. Its `.modal-title` descendant uses `overflow-wrap: anywhere` so a long unbroken file name wraps instead of overflowing; the full name is still shown, never truncated. This follows the wrapping precedent in `.question-panel-text`, which also uses `overflow-wrap: anywhere`.
- `ModalDialog` already accepts `className` at `web/src/shared/ModalDialog.tsx:8` and 15, so it is not changed. `useDialogKeyboard` already traps every key and focuses on mount, so the dialog keeps `role="alertdialog"`, the same button order, and the accessible names `Save (y)`, `Don't Save (n)`, and `Cancel (Esc)`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Three-button dialog | `web/src/unsaved-work/SaveChangesDialog.tsx` (after subplan `01`) | Modified in place. The existing `Action` union becomes `SaveChoice`, and the new props are added. |
| Modal shell and class pass-through | `web/src/shared/ModalDialog.tsx` (`className?: string`, the `modal` root, `modal-title`) | Reused unchanged. The walk class is appended to `modal`. |
| Dialog keyboard trap and focus | `web/src/shared/useDialogKeyboard.ts` | Reused unchanged. It focuses the dialog on mount and swallows every key. |
| Modal CSS | `web/src/theme.css:656-661` (`.modal`, `.modal-title`) and `.question-panel-text` for `overflow-wrap: anywhere` | One new class and one descendant rule are added; no existing rule changes. |
| Dialog tests and their conventions | `web/src/unsaved-work/SaveChangesDialog.test.tsx` (after subplan `01`) | Existing cases stay; new cases are added in the same file. |

## Proposed changes

- In `web/src/unsaved-work/SaveChangesDialog.tsx`:
  - Export the three-choice type as `SaveChoice`; keep the three values.
  - Add the optional `title` prop and use it as `ModalDialog`'s title, defaulting to the current sentence.
  - Add the controlled/uncontrolled selection contract. In controlled mode, arrows call `onSelect` and `Enter` reads `selected`; in uncontrolled mode, keep the local state exactly as today.
  - Add the optional `className` and pass it to `ModalDialog`.
- In `web/src/theme.css`, add `.save-walk-dialog` and `.save-walk-dialog .modal-title` beside the existing `.modal-title` rule.
- In `web/src/unsaved-work/SaveChangesDialog.test.tsx`, add the cases listed under Tests; do not rewrite the existing cases.

## Tests

In `web/src/unsaved-work/SaveChangesDialog.test.tsx`, keep every existing case and add:

- A supplied `title` replaces the default heading; with no `title`, the heading is still `Do you want to save changes to this file?`.
- With `selected` set to `'discard'` and an `onSelect` spy, the Don't Save button starts with the `selected` class, `ArrowRight` calls `onSelect('cancel')`, and `ArrowLeft` calls `onSelect('save')`. The dialog does not change the rendered selected button on its own when the parent does not feed the value back.
- With a controlled `selected` of `'cancel'`, `Enter` calls `onCancel`; with `'discard'`, `Enter` calls `onDiscard`; with `'save'`, `Enter` calls `onSave`. The mapping is the `selected` prop, not the default.
- `y` and `n` still call Save and Don't Save regardless of the controlled selection.
- A supplied `className` appears on the `alertdialog` element alongside `modal`; with no `className`, no walk class is present.
- Saving still disables the Save button and makes repeated `y`/`Enter`/clicks no-ops in controlled mode, while Don't Save and Cancel remain available.

The existing cases that assert the default title, Save-first selection, every key, the outside-click swallow, and listener cleanup must pass with no edits. They are the proof that the no-new-props path is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual check after subplan `06` wires the walk: the walk dialog is capped in width and a long file name wraps onto multiple lines instead of being clipped or pushing the buttons off screen. The single-tab close dialog keeps its current size and title.

## Out of scope

- No walk state, no walk handlers, no reveal, no save or quit logic.
- No new button, key binding, progress line, or "n of total" text.
- No change to `ModalDialog` or `useDialogKeyboard`.
- No change to the single-tab close dialog's default title or default Save selection.
- No change to any other modal's width or styling.
