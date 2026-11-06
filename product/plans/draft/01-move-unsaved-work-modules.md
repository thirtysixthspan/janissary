# Move the close, quit, and save modules into the unsaved-work feature

**Complexity: 2/10** — ten file moves, one lint-zone entry, and the import updates they force. No behavior changes, but every old path must disappear and the new feature directory must keep the same import boundaries the lint zones encode.

## Goal

Create `web/src/unsaved-work/` as the single home for the single-tab close guard, the whole-app quit guard, the save dialog and its request state, the dirty-tab check, and their tests. Update the two app-shell importers and `eslint.client-feature-zones.mjs`. Leave `web/src/UnsavedQuitDialog.tsx` and its test at the app root for now; subplan `08-quit-entry-and-cmd-w` deletes them with the retired quit path.

This subplan is deliberately behavior-neutral. Every later subplan edits files at their final location, so landing the moves first removes path churn from the behavioral diffs.

## Dependencies and ordering

This subplan depends on nothing earlier. It must land before `03-save-walk-pure-module`, `04-save-changes-dialog-variants`, `05-save-confirm-request-state`, `06-quit-walk-guard`, and `08-quit-entry-and-cmd-w`, all of which edit files inside `web/src/unsaved-work/`.

Do not start the next subplan until `$janissary/scripts/run.mjs check-diff` passes against the moved tree with no old-path imports left.

## Design decisions

- The new directory is flat. There is no `SaveChangesDialog/` subdirectory and no `index.ts` barrel; callers import each file directly, per `ai/guidelines/imports-and-barrel-files.md`.
- Move these files exactly:

  | Current path | New path |
  | --- | --- |
  | `web/src/CloseSaveGuard.tsx` | `web/src/unsaved-work/CloseSaveGuard.tsx` |
  | `web/src/CloseSaveGuard.test.tsx` | `web/src/unsaved-work/CloseSaveGuard.test.tsx` |
  | `web/src/CloseSaveGuard.named-close.test.tsx` | `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` |
  | `web/src/useUnsavedQuitGuard.ts` | `web/src/unsaved-work/useUnsavedQuitGuard.ts` |
  | `web/src/useUnsavedQuitGuard.test.ts` | `web/src/unsaved-work/useUnsavedQuitGuard.test.ts` |
  | `web/src/SaveChangesDialog/SaveChangesDialog.tsx` | `web/src/unsaved-work/SaveChangesDialog.tsx` |
  | `web/src/SaveChangesDialog/useSaveConfirm.ts` | `web/src/unsaved-work/useSaveConfirm.ts` |
  | `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx` | `web/src/unsaved-work/SaveChangesDialog.test.tsx` |
  | `web/src/dirtyTabs.ts` | `web/src/unsaved-work/dirtyTabs.ts` |
  | `web/src/dirtyTabs.test.ts` | `web/src/unsaved-work/dirtyTabs.test.ts` |

- The old `web/src/SaveChangesDialog/` directory is removed once its three files move. No re-export file is left behind.
- `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx` stay where they are. `web/src/AppMain.tsx:10` keeps importing the component and `AppMain.tsx:106` keeps rendering it until subplan `08`.
- Relative imports in the moved files change only by depth:
  - `web/src/CloseSaveGuard.tsx` imports `./shared/ws/ws`, `./shared/tab/handles`, `./SaveChangesDialog/useSaveConfirm`, and `./SaveChangesDialog/SaveChangesDialog`. After the move these are `../shared/ws/ws`, `../shared/tab/handles`, `./useSaveConfirm`, and `./SaveChangesDialog`.
  - `web/src/useUnsavedQuitGuard.ts` imports `./shared/tab/handles` and `./dirtyTabs`. After the move these are `../shared/tab/handles` and `./dirtyTabs`.
  - `web/src/dirtyTabs.ts` imports `./shared/tab/handles`. After the move it is `../shared/tab/handles`.
  - `web/src/SaveChangesDialog/SaveChangesDialog.tsx` already imports `../shared/useDialogKeyboard` and `../shared/ModalDialog`; the new directory has the same depth, so those imports do not change.
- Test imports follow the same depth rule:
  - `CloseSaveGuard.test.tsx` imports `./shared/tab/handles` and `./CloseSaveGuard`; after the move these are `../shared/tab/handles` and `./CloseSaveGuard`.
  - `CloseSaveGuard.named-close.test.tsx` imports `./shared/tab/handles`, `./CloseSaveGuard`, and `./shared/command-bar/AppCommandBar`; after the move the shared imports gain `../`.
  - `useUnsavedQuitGuard.test.ts` imports `./shared/tab/handles` and `./useUnsavedQuitGuard`; after the move these are `../shared/tab/handles` and `./useUnsavedQuitGuard`.
  - `dirtyTabs.test.ts` imports `./shared/tab/handles` and `./dirtyTabs`; after the move these are `../shared/tab/handles` and `./dirtyTabs`.
  - `SaveChangesDialog.test.tsx` imports only `./SaveChangesDialog`, which remains valid.
- `web/src/App.tsx:9` changes its `useUnsavedQuitGuard` import to `./unsaved-work/useUnsavedQuitGuard`.
- `web/src/AppMain.tsx:11` changes its `CloseSaveGuard` import to `./unsaved-work/CloseSaveGuard`.
- A grep for the old import specifiers confirms no other production importer exists. The only non-test importers of the moved modules are `web/src/App.tsx` (`useUnsavedQuitGuard`) and `web/src/AppMain.tsx` (`CloseSaveGuard`). `dirtyTabs` is imported only by `useUnsavedQuitGuard`; `useSaveConfirm` and `SaveChangesDialog` only by `CloseSaveGuard`.
- In `eslint.client-feature-zones.mjs`, replace the `'SaveChangesDialog'` entry in `clientFeatureDirectories` with `'unsaved-work'`. The cross-feature and feature-to-root zones are generated from that list, so leaving the old name would leave the new directory unguarded and describe a directory that no longer exists. Keep the entry in the same position to keep the diff to one word.
- The moved files may import only `@shared/protocol` and the allowed shared modules (`shared/ws/ws`, `shared/tab/handles`, `shared/ModalDialog`, `shared/useDialogKeyboard`), plus files inside `unsaved-work/`. They must not import the app shell or a sibling feature. This is what the updated zones enforce.
- No production behavior changes: the same components, hooks, tests, titles, and RPC calls, only at new paths.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Single-tab close guard and its tests | `web/src/CloseSaveGuard.tsx`, `web/src/CloseSaveGuard.test.tsx`, `web/src/CloseSaveGuard.named-close.test.tsx` | Moved unchanged except import paths. |
| Whole-app quit guard and its test | `web/src/useUnsavedQuitGuard.ts`, `web/src/useUnsavedQuitGuard.test.ts` | Moved unchanged except import paths. |
| Save dialog, request state, and test | `web/src/SaveChangesDialog/SaveChangesDialog.tsx`, `web/src/SaveChangesDialog/useSaveConfirm.ts`, `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx` | Moved flat into `web/src/unsaved-work/`, unchanged except import paths. |
| Dirty-tab check and test | `web/src/dirtyTabs.ts`, `web/src/dirtyTabs.test.ts` | Moved unchanged except import paths. |
| Shared dialog primitives | `web/src/shared/ModalDialog.tsx` (`ModalDialog`), `web/src/shared/useDialogKeyboard.ts` (`useDialogKeyboard`) | Imported by the moved dialog as they are today. No code change. |
| Dirty-tab contract | `web/src/shared/tab/handles.ts` (`DirtyTabHandle`) | Imported by the moved guard, quit guard, and dirty-tab module as today. No code change. |
| Feature-zone list | `eslint.client-feature-zones.mjs` (`clientFeatureDirectories`) | One entry renamed. The generated zones do the rest. |
| App-shell render tree | `web/src/App.tsx`, `web/src/AppMain.tsx` | Their two imports follow the moves. No behavior change. |

## Proposed changes

- Move the ten files listed under Design decisions with a file move, not a copy.
- Rewrite the relative imports in the moved files and their tests as listed.
- Update `web/src/App.tsx` and `web/src/AppMain.tsx` import specifiers.
- Replace `'SaveChangesDialog'` with `'unsaved-work'` in `eslint.client-feature-zones.mjs`.
- Delete the now-empty `web/src/SaveChangesDialog/` directory.
- Leave `web/src/UnsavedQuitDialog.tsx`, `web/src/UnsavedQuitDialog.test.tsx`, and every `AppMain` reference to the retired dialog untouched.

## Tests

No new test cases. The moved suites must pass with the same assertions:

- `web/src/unsaved-work/CloseSaveGuard.test.tsx` — all existing close-guard cases, including stale-save, plugin-tab, and tab-list-change cases.
- `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` — all existing named-close cases.
- `web/src/unsaved-work/useUnsavedQuitGuard.test.ts` — all existing cases. It still imports `useUnsavedQuitGuard` from its new sibling and still expects the old `unsavedQuitOpen` API; that API is removed in subplan `08`.
- `web/src/unsaved-work/SaveChangesDialog.test.tsx` — all existing dialog cases.
- `web/src/unsaved-work/dirtyTabs.test.ts` — all existing cases.

The absence of old paths is part of the test: typecheck fails if any importer still names `./CloseSaveGuard`, `./useUnsavedQuitGuard`, `./SaveChangesDialog/...`, or `./dirtyTabs` from the app root.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm by reading the diff that the old `web/src/SaveChangesDialog/` directory is gone, that `web/src/UnsavedQuitDialog.tsx` is still present, and that `eslint.client-feature-zones.mjs` lists `unsaved-work` exactly once.

Manual smoke check in the running app, to prove the moves changed nothing yet:

- Open an editor tab, make it dirty, and close it with its ×. The same "Do you want to save changes to this file?" three-button dialog appears.
- With a dirty tab open, type `quit`. The old one-button "You have unsaved changes. Close anyway?" dialog still appears, because subplan `08` has not retired it yet.
- Open the browser devtools or the app's import graph only if a path is suspect; no runtime behavior should differ.

## Out of scope

- Any behavior change, new prop, new hook, new test case, or new UI.
- Deleting `UnsavedQuitDialog` or changing `useCmdWRefs`.
- Editing specs, help pages, or user documentation.
- Any protocol or server change.
