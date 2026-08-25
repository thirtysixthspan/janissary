# Move the file-navigator's four overlay components into its directory

**Complexity: 4/10** — ten files move, four import lines are rewritten in the two overlay hosts, two moved files fix up a `./` that becomes `../`, and one emptied directory is deleted. No file's contents change beyond its import block, and nothing a user can observe changes. The whole diff is paths.

`web/src/file-navigator/FileNavigatorOverlays.tsx` (lines 2-4) pulls `MoveConflictDialog` from `../MoveConflictDialog/MoveConflictDialog`, `DeleteFileDialog` from `../DeleteFileDialog`, and `FileSearchPopup` from `../FileSearchPopup`; `FileNavigatorOpenerOverlay.tsx:2` pulls `FileOpenerPicker` from `../FileOpenerPicker`. Grepping each name shows the navigator is the only consumer of all four — against §2 of `ai/guidelines/react-code-organization.md` (colocate; promote to shared only on a second real consumer).

## Goal

`web/src/file-navigator/` contains the file navigator, including its dialogs. Nothing in the flat root exists solely to serve it, and the two overlay hosts import their children from `./`.

## Design decisions

**These are not generic primitives awaiting a second caller.** `DeleteFileDialog.tsx`'s own comment says it is "shown when Backspace/Delete is pressed on a selected file-navigator row". `FileSearchPopup.tsx` imports `file-search-match.ts`, which nothing else in the app uses either. Both are navigator features that happen to be stored elsewhere, which is exactly the case §2 describes: they look shared enough that the next feature will reuse one and cement the wrong boundary.

**`file-search-match.ts` travels with `FileSearchPopup.tsx`.** It is the popup's ranking rule and its only consumer, so leaving it at the root would move the component away from the logic it exists to render. Its test goes with it.

**The genuinely shared pieces stay put.** `ModalDialog`, `ConfirmDialogShell`, `useDialogKeyboard`, and `rel-path` all have consumers outside the navigator, so the moved files reach up to `../` for them rather than dragging them along. That is the boundary §3 draws: a feature imports shared, never the reverse.

**`MoveConflictDialog/` loses its directory.** It is a one-component directory holding a component and its test — the flat pattern every other dialog at the root uses. Landing both files directly in `file-navigator/` matches the twenty-odd files already there, and the emptied directory is deleted rather than left behind.

**No re-exports at the old paths.** §4 rules them out, and every consumer is inside the navigator, so nothing outside has to change.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The feature directory these join | `web/src/file-navigator/` (thirty-odd files) |
| The two overlay hosts whose imports change | `FileNavigatorOverlays.tsx:2`–`:4`, `FileNavigatorOpenerOverlay.tsx:2` |
| The colocated tests that move unchanged | `MoveConflictDialog.test.tsx`, `DeleteFileDialog.test.tsx`, `FileSearchPopup.test.tsx`, `file-search-match.test.ts` |
| The shared dialog parts that stay at the root | `ModalDialog.tsx`, `ConfirmDialogShell.tsx`, `useDialogKeyboard.ts`, `rel-path.ts` |
| The precedent — the same gathering, already done | commit `28382093`, "gather the file-navigator feature into web/src/file-navigator/" |

## Implementation steps

1. **Move the files** with `git mv` into `web/src/file-navigator/`: `MoveConflictDialog/MoveConflictDialog.tsx` and its test (flattened out of their directory), `DeleteFileDialog.tsx` and its test, `FileSearchPopup.tsx` and its test, `FileOpenerPicker.tsx`, and `file-search-match.ts` and its test.

2. **Fix the two `./` imports that became `../`.** `DeleteFileDialog.tsx` imports `ConfirmDialogShell`, and `file-search-match.ts` imports `rel-path`; both now sit one level down. `MoveConflictDialog.tsx` already reaches `../useDialogKeyboard` and `../ModalDialog`, and `../` still resolves to `web/src/` from its new home, so it needs no edit. `FileSearchPopup.tsx` keeps `./file-search-match` — they moved together. `FileOpenerPicker.tsx` imports only `@shared/protocol`.

3. **Repoint the two overlay hosts.** `FileNavigatorOverlays.tsx`'s three imports become `./MoveConflictDialog`, `./DeleteFileDialog`, `./FileSearchPopup`; `FileNavigatorOpenerOverlay.tsx`'s becomes `./FileOpenerPicker`.

4. **Delete the emptied `web/src/MoveConflictDialog/` directory.**

## Tests

This is a move: the four colocated test files travel with their subjects and are the regression check. None of their cases or assertions change — each already imports its subject as `./X`, which still resolves from the new directory. The verification is that all four run from `web/src/file-navigator/` and that `FileNavigatorOverlays.test.tsx` and `FileNavigatorTab.test.tsx`, which render the overlays through the hosts, pass untouched.

No new test is written, because no behavior is added or changed — the type checker and the existing suites are what prove the paths are right.

## Out of scope

- **Moving `ModalDialog`, `ConfirmDialogShell`, `useDialogKeyboard`, or `rel-path`.** Each has consumers outside the navigator and belongs in the shared layer.
- **Changing any component's props, markup, or behavior.** Import blocks only.
- **The other flat-root dialog directories** (`QuitDialog/`, `SaveChangesDialog/`). They are not the navigator's, and nothing here says where they belong.
- **`EditorTab.tsx`'s move into `web/src/editor/`.** That is the separate backlog item below this one.
- **Lint-enforcing the feature boundary** (`import/no-restricted-paths` zones). A repo-wide config change, not this fix.
