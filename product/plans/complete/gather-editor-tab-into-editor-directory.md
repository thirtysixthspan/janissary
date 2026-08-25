# Finish gathering the editor feature into `web/src/editor/`

**Complexity: 4/10** — four files move, one import block of twenty-three lines is rewritten in place, and eleven root files change one import path each. Nothing a user can observe changes, and no file's contents change beyond its imports. It is all path churn; the weight is only in the number of touched files.

`web/src/EditorTab.tsx` — the feature's top-level component, whose import block is eighteen `./editor/…` lines — sits in the flat `web/src/` root next to `EditorTab.test.tsx` and the editor-only `OverwriteConflictDialog.tsx` and its test, which `EditorTab.tsx:191` is the only render site for, while the feature's other fifty-nine files live under `web/src/editor/`.

That is §1 of `ai/guidelines/react-code-organization.md` (organize by feature, not by file type): the directory named for the feature does not contain the feature's entry point, so its edge is invisible and every new editor file has to guess which side of the line it belongs on.

## Goal

`web/src/editor/` contains the editor, entry point included. Its top-level component imports its own parts from `./`, and the app shell reaches the feature at `./editor/EditorTab` — one obvious door into the directory, which is what §4 asks for in place of a barrel file.

## Design decisions

**`OverwriteConflictDialog` travels with it.** `EditorTab.tsx:191` is its only render site, and its own reason for existing is the editor's save-conflict prompt. Leaving it at the root would repeat exactly the mistake this change fixes — a feature's dialog stranded in the shared layer with one consumer, which §2 forbids. Its colocated test goes too. This is the same move the file-navigator overlays just made.

**`EditorTabHandle` stays declared in `EditorTab.tsx`.** It is the editor's own imperative handle, not a contract shared between features — unlike the drop handles, which moved to `web/src/drop-handles.ts` for exactly that reason. Its eleven consumers are the app shell composing the feature, which is the direction §3 allows; they simply follow the file to its new path.

**No re-export left at `web/src/EditorTab.tsx`.** §4 rules out re-export hubs, and every consumer is in the app shell, which is allowed to import a feature. Repointing eleven one-line imports is cheaper than a permanent indirection.

**The shared dialog parts stay at the root.** `ModalDialog` and `useDialogKeyboard` have consumers well outside the editor, so `OverwriteConflictDialog.tsx` reaches up to `../` for them rather than dragging them along.

**Sequenced after the drop-handle change (#799), as the backlog item asked.** That change rewrote `EditorTab.tsx`'s import block too; doing this second means one clean rewrite rather than two conflicting ones. It also already removed `AppShell.tsx`'s and `Sidebar.tsx`'s imports of `./EditorTab`, so this change has eleven root consumers to repoint rather than the thirteen the item counted.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The feature directory this completes | `web/src/editor/` (fifty-nine files) |
| The entry point that moves | `web/src/EditorTab.tsx` and its test |
| Its only-consumer dialog | `web/src/OverwriteConflictDialog.tsx` and its test |
| The shared parts that stay at the root | `ModalDialog.tsx`, `useDialogKeyboard.ts`, `ws.ts`, `drop-handles.ts` |
| The precedent, twice over | commit `28382093` (file navigator), and the overlay move immediately before this one |

## Implementation steps

1. **Move the four files** with `git mv` into `web/src/editor/`: `EditorTab.tsx`, `EditorTab.test.tsx`, `OverwriteConflictDialog.tsx`, `OverwriteConflictDialog.test.tsx`.

2. **Rewrite `EditorTab.tsx`'s import block.** The eighteen `./editor/…` lines become `./…`. `./ws` becomes `../ws` and `./drop-handles` becomes `../drop-handles` — both stay in the shared root. `./OverwriteConflictDialog` is unchanged: it moved along.

3. **Fix `EditorTab.test.tsx`.** `./EditorTab` is unchanged; `./drop-handles` and `./ws` become `../…`.

4. **Fix `OverwriteConflictDialog.tsx`.** `./useDialogKeyboard` and `./ModalDialog` become `../…`. Its test imports only `./OverwriteConflictDialog` and needs no edit.

5. **Repoint the eleven root consumers** from `./EditorTab` to `./editor/EditorTab`: `App.tsx`, `AppMain.tsx`, `MountedViewLayers.tsx`, `CloseSaveGuard.tsx`, `dirtyTabs.ts`, `useUnsavedQuitGuard.ts`, and the five tests `MountedViewLayers.test.tsx`, `MountedViewLayers.video-playback.test.tsx`, `CloseSaveGuard.test.tsx`, `dirtyTabs.test.ts`, `useUnsavedQuitGuard.test.ts`.

6. **Repoint the module mock, not just the imports.** `MountedViewLayers.test.tsx:24` stubs the component with `vi.mock('./EditorTab', …)` to keep its async mount out of the layer tests. That path is a string the type checker does not see, so it must be moved by hand — a stale one leaves the real component mounting and six cases failing on a fake client.

## Tests

This is a move: the two colocated test files travel with their subjects and are the regression check, with no case or assertion changed. `EditorTab.test.tsx` is the big one — it renders the whole tab and drives the hooks, the save path, the conflict dialog, and the drop handle — so its passing from the new directory is what proves the twenty-three rewritten import lines are right.

No new test is written, because no behavior is added or changed. The type checker and the existing suites prove the paths.

## Out of scope

- **Any change to `EditorTab.tsx`'s contents beyond its import block** — no extraction, no prop change, no behavior change. The file is over neither limit, and reshaping it is a separate question from where it lives.
- **Moving `ModalDialog`, `useDialogKeyboard`, `ws.ts`, or `drop-handles.ts`.** All are genuinely shared.
- **Moving `EditorTabHandle` out of the component**, the way the drop handles moved. It is not shared between features; nothing asks for it.
- **The remaining flat-root components** that may belong to some other feature. Only the editor is in play.
- **Lint-enforcing the feature boundary** (`import/no-restricted-paths` zones). A repo-wide config change, worth doing, but not this fix.
- **Updating historical plan files and `CHANGELOG.md`** that mention the old `web/src/EditorTab.tsx` path. They are records of what was true when written.
