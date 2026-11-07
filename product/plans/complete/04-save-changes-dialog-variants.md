# Extend the save-changes dialog for the walk

**Complexity: 3/10** — an exported three-choice type, two plain optional props (`title` and `className`), a controlled/uncontrolled selection pair, one width-capping CSS variant, and tests that must leave every existing dialog case unchanged.

## Goal

Extend the moved `web/src/unsaved-work/SaveChangesDialog.tsx` with three optional additions (four props) and one presentational variant so the quit walk can reuse it without changing the single-tab close dialog:

- an optional `title`, defaulting to the existing `Do you want to save changes to this file?` only when it is `undefined`;
- an optional controlled selection (`selected` plus `onSelect`), while the dialog keeps its own Save-first selection when those props are absent;
- an optional `className` passed through to `ModalDialog`, plus a `.save-walk-dialog` variant rule in `web/src/theme.css` that caps the walk dialog's width and a `.save-walk-dialog .modal-title` descendant rule that lets its title wrap and break inside long words.

The single-tab close dialog passes none of the new props. Its title, default selection, keyboard behavior, and markup stay exactly as they are.

## Dependencies and ordering

This subplan depends only on `01-move-unsaved-work-modules`, which is already landed in this checkout. It edits `web/src/unsaved-work/SaveChangesDialog.tsx` and its test at their final location, does not depend on `02-tab-full-name` or `03-save-walk-pure-module`, and can land immediately after `01`.

Subplan `05-save-confirm-request-state` imports the exported `SaveChoice` type, and subplan `06-quit-walk-guard` passes `title`, `selected`, `onSelect`, and `className` when it renders the walk branch. Both must land after this subplan; in order that is `04`, then `05`, then `06`, and `06` also depends on `05`'s request state. `04` has no dependency on either. No behavior in the walk exists until `06`, so this subplan ships an unused prop surface and an unused CSS class on purpose.

## Design decisions

- The existing private three-value union `'save' | 'discard' | 'cancel'` (`type Action` at `web/src/unsaved-work/SaveChangesDialog.tsx:5`) becomes an exported `SaveChoice` type from the same module. The values stay exactly `'save' | 'discard' | 'cancel'`. Subplan `05` imports the type with `import type`, so no runtime module edge is added; `06` receives the value through the request state and adds no second definition. That import is web-side and extensionless (`./SaveChangesDialog`); the NodeNext `.js` rule applies to `src/`, not `web/src/`. The dialog remains the one definition; do not add a second alias in `useSaveConfirm`, `useQuitWalk`, or a new module.
- `title?: string` defaults to the current sentence only when the prop is `undefined`. An explicit empty string renders an empty `.modal-title`; do not use a truthiness fallback. The value goes to `ModalDialog`'s existing `title` prop, so it stays the visible heading inside the `role="alertdialog"` modal (`web/src/shared/ModalDialog.tsx:20`). No second title element is added.
- The controlled selection is a union: either both `selected` and `onSelect` are present, or neither is. The props type keeps `onSave`, `onDiscard`, `onCancel`, `saving`, `title`, and `className` in both branches. One branch requires a `selected` value of type `SaveChoice` and an `onSelect` callback that accepts a `SaveChoice`; the other allows neither. Passing only one is a type error; no runtime guard is added because typecheck is the enforcement. If a runtime caller bypasses the type and passes a half pair, treat the dialog as uncontrolled rather than reading a missing `selected`.
- In uncontrolled mode (neither prop), the dialog keeps its local state starting at `'save'`. The component still calls `useState` unconditionally because hooks cannot be conditional; rename the existing local `selected` state to `localSelection` and derive the rendered choice into a local `currentChoice` that is the prop when controlled and `localSelection` otherwise. The arrow keys cycle the local state, `Enter` runs the current local choice through the existing mapping at `web/src/unsaved-work/SaveChangesDialog.tsx:17-21`, and every existing test passes unchanged.
- In controlled mode (both props present), `currentChoice` is the `selected` prop, never a competing local value. The arrow keys compute the next choice from `selected` and report it through `onSelect`; they do not call the local setter. `Enter` runs the choice passed in `selected`. The parent is expected to feed the new choice back through subplan `05`'s request state and subplan `06`'s guard; that is what carries the selection between walk steps. If the parent does not feed it back, the highlight stays on the prop value and repeated arrows report the same next choice.
- The cycle is the existing one at `web/src/unsaved-work/SaveChangesDialog.tsx:23-24`, unchanged: `ArrowRight` moves Save → Don't Save → Cancel → Save, and `ArrowLeft` moves Save → Cancel → Don't Save → Save. Use one local pure helper named `nextChoice` that takes the current choice and a `'left'` or `'right'` direction and returns the next choice, for both modes so the two paths cannot drift; do not duplicate the two ternaries. The arrow keys stay active while `saving` is true.
- Only the arrow keys call `onSelect`. `y`, `n`, `Escape`, `Enter`, and clicks on the three buttons run the same actions as today and do not call `onSelect` or change the highlighted selection. This preserves the close dialog's behavior, where a click acts without moving the highlight, and means a click on Don't Save does not make Don't Save the carried selection for the next walk step; only the arrow keys do that.
- `y` still calls Save and `n` still calls Don't Save regardless of which choice is selected, in both modes. `Escape` still calls Cancel. Save still does nothing while `saving` is true, and the Save button stays disabled while pending. Don't Save and Cancel stay available.
- `className?: string` is passed straight through to `ModalDialog`'s existing `className` prop (`web/src/shared/ModalDialog.tsx:8`, appended to the `modal` root at `:15`). No dialog shell logic is duplicated. An absent or empty class adds nothing; `ModalDialog` already guards the append with a truthiness check.
- Name the walk class `.save-walk-dialog`. It is applied only by the walk branch in `06`; the close dialog passes no class, so other modals are untouched.
- In `web/src/theme.css`, place `.save-walk-dialog` and `.save-walk-dialog .modal-title` immediately after the existing `.modal-title` rule at `web/src/theme.css:661`. The variant sets `max-width` to `min(560px, calc(100vw - 32px))`; it does not set `width`, so a short title keeps the existing content-sized dialog and the inherited `min-width: 280px` at `:658` is left alone. The 32px leaves 16px on each side of the viewport. Below a 312px viewport the inherited minimum wins over the cap; that narrow case is accepted and not reworked here. `min()` is already used by `.question-panel` at `:671`, so this adds no new CSS primitive.
- The descendant rule sets `overflow-wrap: anywhere` on `.modal-title` so a long unbroken file name wraps instead of overflowing; the full name is still shown, never truncated. This follows the wrapping precedent in `.question-panel-text` at `web/src/theme.css:673`, which uses the same declaration. Do not switch to `text-overflow: ellipsis` or `white-space: nowrap`.
- `ModalDialog` already accepts `className` and has the `modal` root and `.modal-title` heading; `useDialogKeyboard` already focuses the dialog on mount (`web/src/shared/useDialogKeyboard.ts:35`) and swallows every key in capture phase (`:9-15` and `:44-45`). Neither module changes. The dialog keeps `role="alertdialog"`, the same button order, the same outside-click swallow, and the accessible names `Save (y)`, `Don't Save (n)`, and `Cancel (Esc)`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Three-button dialog | `web/src/unsaved-work/SaveChangesDialog.tsx` (after subplan `01`; `type Action` at `:5`, `type Properties` at `:7`, title literal at `:28`) | Modified in place. `Action` becomes the exported `SaveChoice`, `Properties` gains the new props, and the title literal becomes the `title` default. |
| Modal shell and class pass-through | `web/src/shared/ModalDialog.tsx` (`className?: string` at `:8`, the `modal` root and append at `:15`, the `.modal-title` heading at `:20`) | Reused unchanged. The walk class is appended to `modal`; the title prop supplies the heading. |
| Dialog keyboard trap and focus | `web/src/shared/useDialogKeyboard.ts` (`dialogRef.current?.focus()` at `:35`; the every-key `dispatchByKey` at `:9-15`; capture-phase listeners at `:44-45`) | Reused unchanged. The key map is refreshed through a ref on every render, so an `onSelect` that updates the parent needs no new wiring. |
| Modal CSS | `web/src/theme.css:656-661` (`.modal` with `min-width: 280px` at `:658`, `.modal-title` at `:661`), `:671` (`.question-panel` uses `min()`), and `:673` (`.question-panel-text` uses `overflow-wrap: anywhere`) | One variant rule and one descendant rule are added; no existing rule changes, including the `min-width`. |
| Dialog tests and their conventions | `web/src/unsaved-work/SaveChangesDialog.test.tsx` (after subplan `01`; 198 raw / 180 effective lines; `max-lines` is off for test files at `eslint.config.mjs:114-118`) | Existing cases stay; new cases are added in the same file. Do not split the suite or compact the existing cases. The keyboard tests use `fireEvent.keyDown(document, …)`; the click tests use `userEvent.click`. |
| Only production consumer | `web/src/unsaved-work/CloseSaveGuard.tsx:48` renders `SaveChangesDialog` with `saving`, `onSave`, `onDiscard`, and `onCancel` only. | Not edited by this subplan. Passing none of the new props is the proof that the close path keeps its default title, uncontrolled Save-first selection, and class-free shell. |

## Proposed changes

- In `web/src/unsaved-work/SaveChangesDialog.tsx`:
  - Rename the private `Action` union to `SaveChoice` and export it as a type; keep the three values and the exported component name `SaveChangesDialog`.
  - Add `title`, defaulting only on `undefined` to `Do you want to save changes to this file?`, and pass it to `ModalDialog`'s `title`.
  - Add the controlled/uncontrolled selection contract. Rename the existing local `selected` state to `localSelection`, derive `currentChoice` from the prop or that state, and use one `nextChoice` helper for both arrow directions. Only arrows call `onSelect`; `y`, `n`, `Escape`, `Enter`, and clicks call actions only.
  - Add `className` and pass it to `ModalDialog`; do not add shell markup.
- In `web/src/theme.css`, add the `.save-walk-dialog` variant (`max-width`) and the `.save-walk-dialog .modal-title` descendant (`overflow-wrap: anywhere`) immediately after `.modal-title` at `:661`, before `.modal-note`. Do not edit the `.modal` or `.modal-title` rules themselves.
- In `web/src/unsaved-work/SaveChangesDialog.test.tsx`, add the cases listed under Tests; do not rewrite the existing cases. The file is exempt from `max-lines` as a test file, so keep the suite together.
- Do not edit `web/src/unsaved-work/CloseSaveGuard.tsx`, `web/src/unsaved-work/useSaveConfirm.ts`, `web/src/shared/ModalDialog.tsx`, or `web/src/shared/useDialogKeyboard.ts`. The guard's close render is the no-new-props proof; `05` owns `useSaveConfirm.ts` and `06` owns `CloseSaveGuard.tsx`; `ModalDialog` and `useDialogKeyboard` already provide what this subplan needs.
- No new files. `SaveChangesDialog.tsx` is 37 effective lines today and the additions stay well under the 200-line limit, so no extraction is planned.

## Tests

In `web/src/unsaved-work/SaveChangesDialog.test.tsx`, keep every existing case and add:

- A supplied `title` replaces the default heading, and the default heading is absent. The existing `renders the title and three buttons` case is the no-title proof and stays unchanged. A supplied empty `title` renders an empty `.modal-title` rather than falling back to the default, pinning the `undefined`-only default.
- Controlled initial state: with `selected` set to `'discard'`, the Don't Save button starts with the `selected` class and the other two do not.
- Controlled arrows: add a table over all three starting selections and both directions asserting `onSelect` receives the next choice from the existing cycle: `ArrowRight` Save→Don't Save→Cancel→Save and `ArrowLeft` Save→Cancel→Don't Save→Save. Also assert the arrow press does not call `onSave`, `onDiscard`, or `onCancel`, and that the rendered selected button stays on the prop value when the parent does not feed the new value back.
- Controlled prop feedback: rerender with a different `selected` value and assert the `selected` class moves to that button, proving the parent's feed-back is what drives the highlight.
- Controlled `Enter` runs the `selected` prop, not the default: table over `'save'`, `'discard'`, and `'cancel'`, asserting exactly the matching handler fires and the other two do not.
- Actions never report selection: `y`, `n`, `Escape`, `Enter`, and clicks on each of the three buttons call their action handler as before and never call `onSelect`. Include a controlled click on Don't Save while Save is selected, proving the click does not silently move the carried selection.
- The three buttons stay in DOM order Save, Don't Save, Cancel, so the existing layout is unchanged.
- A supplied `className` appears on the `alertdialog` element alongside `modal`; with no `className`, no `save-walk-dialog` class is present.
- Controlled saving: while `saving` is true, the Save button is disabled and `y`, `Enter`, and a click on Save are no-ops; Don't Save and Cancel still work. Arrow keys still call `onSelect` while a save is pending, because only Save is disabled. After a rerender with `saving` set back to false, the actions work again.

The existing cases that assert the default title, Save-first selection, every key, the outside-click swallow, and listener cleanup must pass with no edits. They are the proof that the no-new-props path is unchanged. The existing `web/src/unsaved-work/CloseSaveGuard.test.tsx` and `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` must also pass unchanged, since the guard is the only production consumer and it passes none of the new props.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. It prints only a summary, so then run `npx vitest run --project client web/src/unsaved-work/SaveChangesDialog.test.tsx web/src/unsaved-work/CloseSaveGuard.test.tsx web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` and confirm the dialog suite plus both close-guard suites pass. The close-guard suites are the integration proof that the guard's no-new-props render is unchanged.

Manual check now, before the walk is wired: open two editor tabs, make one dirty, and close it with its ×. The dialog still reads `Do you want to save changes to this file?`, Save is selected, `ArrowRight` moves the highlight to Don't Save, and pressing `Escape` leaves the tab open. The dialog's width and buttons look as they do on the current build. There is no way to see `.save-walk-dialog` in the app yet because no call site passes it; the class-presence test is the only check available in this subplan.

Manual check after subplan `06` wires the walk: the walk dialog is capped in width and a long file name wraps onto multiple lines instead of being clipped or pushing the buttons off screen. The single-tab close dialog keeps its current size and title.

## Out of scope

- No walk state, no walk handlers, no reveal, no save or quit logic.
- No new button, key binding, progress line, or "n of total" text.
- No change to `ModalDialog` or `useDialogKeyboard`, and no change to `CloseSaveGuard.tsx` or `useSaveConfirm.ts`; subplan `05` owns `useSaveConfirm.ts` and subplan `06` owns `CloseSaveGuard.tsx`.
- No change to the single-tab close dialog's default title, default Save selection, keyboard behavior, or markup.
- No change to any other modal's width or styling; only the new `.save-walk-dialog` variant and its `.modal-title` descendant are added.
- No spec, help, or user-documentation edit; subplan `09` owns the walk wording.
- No protocol, server, or persistence change; this is client-side dialog work only.
- No new test file or suite split; the dialog cases stay in `SaveChangesDialog.test.tsx`.
