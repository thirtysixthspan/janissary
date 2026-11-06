# Move the close, quit, and save modules into the unsaved-work feature

**Complexity: 2/10** — ten file moves, one lint-zone entry, and the import updates they force. No behavior changes, but every old path must disappear and the new feature directory must keep the same import boundaries the lint zones encode.

## Goal

Create `web/src/unsaved-work/` as the single home for the single-tab close guard, the whole-app quit guard, the save dialog and its request state, the dirty-tab check, and their tests. Update the two app-shell importers and `eslint.client-feature-zones.mjs`. Leave `web/src/UnsavedQuitDialog.tsx` and its test at the app root for now; subplan `08-quit-entry-and-cmd-w` deletes them with the retired quit path.

This subplan is deliberately behavior-neutral. Every later subplan edits files at their final location, so landing the moves first removes path churn from the behavioral diffs.

## Dependencies and ordering

This subplan depends on nothing earlier. It must land before `03-save-walk-pure-module`, `04-save-changes-dialog-variants`, `05-save-confirm-request-state`, `06-quit-walk-guard`, and `08-quit-entry-and-cmd-w`, all of which edit files inside `web/src/unsaved-work/`.

Do not start the next subplan until `$janissary/scripts/run.mjs check-diff` passes against the moved tree with no import still pointing at a file's former location.

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

- The old `web/src/SaveChangesDialog/` directory is removed once its three files move. Do not leave a re-export, stub, or compatibility module at any old path; a stale file would keep typechecking green while naming a module that no longer exists in the new home.
- `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx` stay where they are. Apart from `react`, the component imports only `./shared/ConfirmDialogShell` (`ConfirmDialogShell`), its test imports only `./UnsavedQuitDialog`, and `web/src/AppMain.tsx:10` (`import { UnsavedQuitDialog } from './UnsavedQuitDialog';`) plus `AppMain.tsx:106` (`{unsavedQuitOpen && <UnsavedQuitDialog ... />}`) keep it on the quit path. Nothing it imports moves, so it keeps typechecking and behaving exactly as today; subplan `08-quit-entry-and-cmd-w` deletes it when the walk replaces the one-button dialog.
- Relative imports in the moved files change because of the new depth, and the two dialog imports also lose the `SaveChangesDialog/` segment:
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
- A grep for `from '.*(CloseSaveGuard|useUnsavedQuitGuard|SaveChangesDialog|useSaveConfirm|dirtyTabs)'` across `web/src` confirms no other importer exists. Outside their own tests, the only importers of the moved modules are `web/src/App.tsx` (`useUnsavedQuitGuard`) and `web/src/AppMain.tsx` (`CloseSaveGuard`). In production, `dirtyTabs` is imported only by `useUnsavedQuitGuard`, and `useSaveConfirm` and `SaveChangesDialog` only by `CloseSaveGuard`; each test moves with the module it tests.
- In `eslint.client-feature-zones.mjs`, replace the `'SaveChangesDialog'` entry in `clientFeatureDirectories` with `'unsaved-work'`. The cross-feature zones, the shared-to-feature zone, and `clientFeatureRootZones` are generated from that list, so leaving the old name would leave the new directory unguarded and describe a directory that no longer exists. Replace it in place: the list is not lint-sorted, so do not re-sort the array, and do not keep or add a `SaveChangesDialog` entry.
- Every import the moved files make must stay legal under the updated zones. In production those project imports are `@shared/protocol` (the alias resolves to `src/`), `../shared/ws/ws`, `../shared/tab/handles`, `../shared/ModalDialog`, `../shared/useDialogKeyboard`, and files inside `unsaved-work/`; `CloseSaveGuard.named-close.test.tsx` additionally imports `../shared/command-bar/AppCommandBar`, which is shared and stays allowed. Nothing may import the app shell or a sibling feature. `clientFeatureZones` applies to test files too, but `clientFeatureRootZones` (the app-shell half) is configured only for non-test files, so keep the moved tests on shared imports by convention even where lint would not catch a root import.
- No Vitest, TypeScript, or Vite config change is needed. The client project's include glob is `web/src/**/*.test.{ts,tsx}` (recursive), and `@shared/*` already maps to `src/*` in `web/tsconfig.json` and in `vitest.config.ts`, so the moved modules and tests resolve from their new directory unchanged.
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

- Create `web/src/unsaved-work/` and move the ten files listed under Design decisions with `git mv`, not a copy, then rewrite their imports. Stage the moves before running `check-diff`: Vitest's `--changed` mode reads staged and unstaged changes but not untracked files, so a plain `mv` without `git add` would let `test:web` pass without running any of the moved suites. Treat the moves and import rewrites as one change; do not commit a tree where the files have moved but imports still name the old paths.
- Rewrite the relative imports in the moved files and their tests as listed.
- Update `web/src/App.tsx` and `web/src/AppMain.tsx` import specifiers.
- Replace `'SaveChangesDialog'` with `'unsaved-work'` in `eslint.client-feature-zones.mjs`.
- Delete the now-empty `web/src/SaveChangesDialog/` directory.
- Leave `web/src/UnsavedQuitDialog.tsx`, `web/src/UnsavedQuitDialog.test.tsx`, and every `AppMain` reference to the retired dialog untouched.

## Tests

No new test cases and no test-config change — the client project's include glob already covers subdirectories. The moved suites must pass with the same assertions:

- `web/src/unsaved-work/CloseSaveGuard.test.tsx` — all existing close-guard cases, including stale-save, plugin-tab, and tab-list-change cases.
- `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` — all existing named-close cases.
- `web/src/unsaved-work/useUnsavedQuitGuard.test.ts` — all existing cases. It still imports `useUnsavedQuitGuard` from its new sibling and still expects the old `unsavedQuitOpen` API; that API is removed in subplan `08`.
- `web/src/unsaved-work/SaveChangesDialog.test.tsx` — all existing dialog cases.
- `web/src/unsaved-work/dirtyTabs.test.ts` — all existing cases.

The absence of old paths is part of the check: typecheck fails if any importer still names `./CloseSaveGuard`, `./useUnsavedQuitGuard`, `./SaveChangesDialog/...`, or `./dirtyTabs` from the app root. Inside `unsaved-work/`, the sibling specifiers `./CloseSaveGuard`, `./useUnsavedQuitGuard`, `./dirtyTabs`, and `./SaveChangesDialog` are the correct new form, so a grep for those strings finds the moved files and nothing else.

## Verification

Run `$janissary/scripts/run.mjs check-diff` before committing, with the moves staged. Its summary must show `lint ✓`, `tsc ✓`, and `test:web ✓`. `check-diff` prints only that summary, so then run `npx vitest run --project client web/src/unsaved-work` and confirm five suites ran and passed: `CloseSaveGuard.test.tsx`, `CloseSaveGuard.named-close.test.tsx`, `useUnsavedQuitGuard.test.ts`, `SaveChangesDialog.test.tsx`, and `dirtyTabs.test.ts`. If `check-diff` prints `check:diff: no changes`, it verified nothing — the work is already committed, so use the explicit Vitest command.

Confirm by reading the diff and grepping:

- `rg -n "from '\./(CloseSaveGuard|useUnsavedQuitGuard|dirtyTabs)'|from '\./SaveChangesDialog/" web/src -g '!**/unsaved-work/**'` returns nothing.
- The old `web/src/SaveChangesDialog/` directory is gone, and no `web/src/CloseSaveGuard*`, `web/src/useUnsavedQuitGuard*`, or `web/src/dirtyTabs*` file remains at the app root.
- `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx` are still present and untouched.
- `eslint.client-feature-zones.mjs` lists `unsaved-work` exactly once and no longer lists `SaveChangesDialog`.

Manual smoke check in the running app, to prove the moves changed nothing yet:

- Open an editor tab, make it dirty, and close it with its ×. The same "Do you want to save changes to this file?" three-button dialog appears.
- With a dirty tab open, type `quit`. The old one-button "You have unsaved changes. Close anyway?" dialog still appears, because subplan `08` has not retired it yet.

## Out of scope

- Any behavior change, new prop, new hook, new test case, or new UI.
- Deleting `UnsavedQuitDialog` or changing `useCmdWRefs`.
- Renaming any moved file, exported symbol, type, test suite, or user-visible string; every later subplan names these paths and symbols.
- Editing specs, help pages, or user documentation.
- Regenerating the `fta/` baselines or taking a code-quality snapshot.
- Any protocol or server change.
