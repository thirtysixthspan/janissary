# PDF Find spec: the another-text-field focus-restore exception

**Complexity: 2/10** — one sentence in one spec file, no code or test change. The care is in matching the code's exact guard and keeping the user-facing wording that already allows the exception.

## Goal

Make `product/specs/pdf-tab.md` § Find state the second condition the code applies when closing the overlay: focus is restored only when the remembered element is still in the document **and** another text field has not taken focus. The spec currently promises the restore whenever the element is still connected, which overstates the behavior.

## What the code does

`web/src/plugins/pdf/usePdfFind.ts` `close()`:

1. Closes the overlay.
2. Reads the remembered origin element. If it is not connected, it returns without restoring.
3. Reads `document.activeElement`. If that is not the find input and `isTextEntryElement()` says it is a place typed text can go, it returns without restoring.
4. Otherwise it calls `origin.focus({ preventScroll: true })`.

`isTextEntryElement()` (`web/src/shared/text-entry.ts`) covers text-ish inputs, textareas, and contenteditable elements. The find input itself is explicitly exempted so that closing while focus is still in the overlay restores the origin.

The behavior is pinned by `web/src/plugins/pdf/usePdfFind.test.ts`, `describe('usePdfFind focus')`:

- `restores the remembered element with preventScroll`
- `does not restore an element that has left the document`
- `leaves focus in another text field` — focuses a second `<input>`, closes, and asserts the origin's `focus` was not called and the other input still has focus.

The code and tests already agree; only the spec sentence is wrong.

## Proposed change

In `product/specs/pdf-tab.md` § Find, in the paragraph beginning "Escape closes the overlay...", change:

> Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document.

to:

> Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document and another text field has not taken focus.

Leave every other sentence in the paragraph, and every other section of the spec, untouched. "Text field" is the spec's user-facing term for the element class `isTextEntryElement` recognizes; the spec does not name modules or functions.

## Why the user documentation stays as it is

`documentation/user-documentation/tab-types/pdf-viewer.md` says closing the search "returns the keyboard to where it was, usually the page". "Usually" already admits the case where focus is somewhere else, including another text field, so the page needs no edit and its wording should not be replaced with the spec's more precise rule. `help/keys.md` does not describe focus restore at all.

## Tests

No new tests and no test edits. The fix changes no behavior, so no test can regress. The existing `leaves focus in another text field` case is the pin that keeps the new spec sentence honest; the plan cites it rather than duplicating it.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing in source changes, so it should report no findings.

## Out of scope

- Any change to `usePdfFind.ts`, `text-entry.ts`, or their tests.
- Rewording the user documentation's "usually the page" sentence.
- Editing the historical plans `product/plans/complete/pdf-tab-find.md` and `product/plans/complete/pdf-find-05-specs-docs-and-verification.md`, which record what was planned at the time and are not live specs.
- Changing the behavior itself, for example restoring focus even when another text field holds it.
