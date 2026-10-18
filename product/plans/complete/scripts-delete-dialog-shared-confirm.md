# Scripts delete dialog renders the shared ConfirmDialog

**Complexity: 3/10** — a generic optional `notes` prop on the shared confirmation, the scripts delete dialog switched to it, and one copied key module deleted. The shared markup changes additively, so every caller that does not pass the prop renders the same DOM as before.

## Goal

Make the scripts delete confirmation render the shared `ConfirmDialog`, so it registers with the app's modal-open signal. Cmd+W and Shift+Tab then stop reaching the window shortcuts while it is open, and its keyboard contract is the one the shared dialog tests already hold still.

## Problem

Checked by reading the code on `feature/scripts-tab` (PR #1739). The test suite is run after the change, not before it.

`web/src/plugins/scripts/DeleteScriptDialog.tsx` builds its own backdrop, document-level listeners, and key map. Its capture-phase `keydown` listener on `globalThis` swallows every key, but it never calls `openModal()` from `web/src/shared/modal-open.ts`.

`web/src/useCmdW.ts` (line 15) and `web/src/useSectionNav.ts` (line 69) return early on `isModalOpen()`. Both listen in the capture phase on `globalThis`. The dialog's listener cannot stop them, because `stopPropagation()` does not stop other listeners on the same target, as the comment in `modal-open.ts` notes. The signal is therefore the only guard. The copy never registers, so Cmd+W closes the tab behind the dialog and Shift+Tab moves section focus.

The shared `useDialogKeyboard` (`web/src/shared/useDialogKeyboard.ts`) calls `openModal()` in its mount effect, which is why the shared dialogs already hold the signal.

The key contracts were compared line by line:

| Input | Scripts copy (`scripts-delete-keys.ts` and `DeleteScriptDialog.tsx`) | Shared (`useConfirmDialogKeys` over `useDialogKeyboard`) |
| --- | --- | --- |
| `y` | confirm | `y` runs `onConfirm` |
| `n` | cancel | `n` runs `onCancel` |
| `Escape` | cancel | `escape` runs `onCancel` |
| `Enter` | the highlighted button | `enter` runs the highlighted button |
| `ArrowLeft`, `ArrowRight` | toggle the highlight | `arrowleft`, `arrowright` toggle it |
| any other key | swallowed, no action | swallowed (`dispatchByKey` calls `preventDefault` and `stopPropagation` for every key) |
| initial highlight | Cancel | Cancel |
| click outside `.modal` | swallowed | swallowed (`useDialogKeyboard` click listener) |
| click inside `.modal` | passes through | passes through |
| focus on mount | the dialog | the dialog |
| listeners removed on unmount | yes | yes |
| modal-open signal | never registered | `openModal()` on mount |

Both sides lowercase the key before matching. The only difference is the modal-open signal. The scripts spec (`product/specs/scripts-tab.md`, Delete section, lines 60-69) describes exactly the shared behavior, so the behavior does not change.

Callers of the shared components, checked for the new optional prop:

- `ConfirmDialog` is used by `web/src/plugins/sql/DeleteRowDialog.tsx`, `web/src/plugins/sessions/SessionList.tsx`, `web/src/plugins/conversations/ConversationList.tsx`, and `web/src/shared/RemoteSessionButton.tsx`. None passes `notes`, so no note elements render and their DOM is unchanged.
- `ConfirmDialogShell` is used by `web/src/QuitDialog/QuitDialog.tsx`, `web/src/UnsavedQuitDialog.tsx`, and `web/src/file-navigator/DeleteFileDialog.tsx`. None passes `notes`, and the shell defaults it to `[]`, which renders nothing.

Published surface: `web/src/plugins/api.ts` (line 58) already exports `ConfirmDialog`, and its props type flows through to plugins. The added optional prop is the only surface change. `api.ts` is not edited, and `TAB_PLUGIN_API_VERSION` (`src/plugins/api-capabilities.ts`, currently 2) does not move.

## Approach

1. The shared shell renders the note lines. `ConfirmDialogShell` takes an optional `notes` array, defaulting to `[]`, and renders each string between the title and the buttons, in the element order the scripts copy used.
2. `ConfirmDialog` takes the same optional prop and forwards it. Its doc comment gains one sentence naming it.
3. `DeleteScriptDialog` renders `ConfirmDialog` imported from `../api`. It passes the title from `deleteTitle(name)`, the confirm label `Delete`, and the note lines built from the existing `systemScheduleLine` and `openEditorLine` helpers. Its props do not change, so `ScriptsTab.tsx` is untouched.
4. The copied key module goes. `web/src/plugins/scripts/scripts-delete-keys.ts` and its test are deleted.

Note styling. The copy's note lines were muted by `.scripts-delete-note` in `web/src/plugins/scripts/scripts.css`, a scripts-only rule. The shared stylesheet has no note class, and the authorized edit set does not include a stylesheet. The shell therefore sets the same muted color inline, `color: var(--muted)`, using the token `web/src/theme.css` defines for every theme. Shared components already use inline style objects, for example `web/src/shared/command-bar/CommandBarShell.tsx`. The now-unused `.scripts-delete-note` rule stays in `scripts.css` and is reported as a follow-up.

## Implementation steps

1. `web/src/shared/ConfirmDialogShell.tsx`: add `notes?: string[]` defaulting to `[]`, render each note as a `div` with `style={{ color: 'var(--muted)' }}` between the title and the actions, and extend the comment's "Callers only vary" line to name the notes.
2. `web/src/shared/ConfirmDialog.tsx`: add `notes?: string[]` to the props, forward it to the shell, and add one sentence to its doc comment.
3. `web/src/shared/ConfirmDialog.test.tsx`: add the new shared test described under Tests.
4. `web/src/plugins/scripts/DeleteScriptDialog.tsx`: render `ConfirmDialog` from `../api` as described above. Drop the `react` hook imports and the `scripts-delete-keys` import.
5. `web/src/plugins/scripts/DeleteScriptDialog.test.tsx`: add the new modal-signal test described under Tests, and the `isModalOpen` import from `../../shared/modal-open`.
6. Delete `web/src/plugins/scripts/scripts-delete-keys.ts` and `web/src/plugins/scripts/scripts-delete-keys.test.ts`.

## Tests

Every existing test in `web/src/shared/ConfirmDialog.test.tsx`, `web/src/shared/useConfirmDialogKeys.test.tsx`, `web/src/shared/useDialogKeyboard.test.tsx`, and `web/src/plugins/scripts/DeleteScriptDialog.test.tsx` stays unchanged. The one removed test is the `deleteKeyAnswer` suite in `scripts-delete-keys.test.ts`, removed with its module. Its cases stay covered by existing behavior tests:

- `y` and `Y` confirm: `useDialogKeyboard.test.tsx` "dispatches by lowercased key in map form", and `DeleteScriptDialog.test.tsx` "confirms on Y".
- `n`, `N`, and `Escape` cancel: `DeleteScriptDialog.test.tsx` "cancels on %s without sending a delete".
- Enter runs the highlighted button: `DeleteScriptDialog.test.tsx` "runs the selected option on Enter, whichever that is".
- Left and Right toggle: `DeleteScriptDialog.test.tsx` "moves the selection with Left and Right".
- Unmapped keys are swallowed and do nothing: `DeleteScriptDialog.test.tsx` "swallows a key it has no answer for", which uses `a`, and `useDialogKeyboard.test.tsx` "swallows unmapped keys too". `Tab`, `Delete`, and `ArrowDown` take the same swallow-every-key path.

New tests:

- `web/src/shared/ConfirmDialog.test.tsx`: "shows its notes and reports an open modal while mounted, releasing it on unmount". It renders one note, asserts the note text is in the dialog and `isModalOpen()` is true, unmounts, and asserts `isModalOpen()` is false. Without the change the note assertion fails, because the prop is ignored and no element holds the text. The signal assertions alone already pass on the current shared code, which is why the note assertion is the one that fails.
- `web/src/plugins/scripts/DeleteScriptDialog.test.tsx`: "reports an open modal while the confirmation is up, and releases it on unmount". Without the change the first assertion fails. The copy never calls `openModal()`, so `isModalOpen()` is false while the dialog is on screen. This is the regression the entry describes.

Verification: `./scripts/run.mjs check-diff` after each implementation step, and the web tests for the whole web project, since the shared component changes.

## Spec

Unchanged. The Delete section of `product/specs/scripts-tab.md` (lines 58-69) already states the note lines and their order, the key contract, the highlight rule, and the swallowed clicks. The shared component delivers each of them, so no sentence changes.

## Docs

None needed. `help.md` and `documentation/user-documentation/` do not describe the delete dialog's internals.

## Out of scope

- Removing `.scripts-delete-note` from `web/src/plugins/scripts/scripts.css`. It becomes unused. Removing it needs an edit to a stylesheet outside the authorized edit set, so it is reported as a follow-up.
- The `leaves out both lines` test in `DeleteScriptDialog.test.tsx` queries `.scripts-delete-note`, which nothing renders after the change. It still passes, but its absence check no longer guards anything. It stays unchanged, because existing scripts delete tests must not change. It is reported.
- Any change to `web/src/plugins/api.ts`, `TAB_PLUGIN_API_VERSION`, or other shared dialog behavior.
