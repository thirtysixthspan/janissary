# Lift the two drop-handle contracts into a shared module

**Complexity: 4/10** — one new type-only module holding two four-line type declarations, two declaration sites deleted, and an import line rewritten in fourteen consumers. Every reference is a type-only import, so nothing survives to runtime and no behavior a user can observe changes. No new architecture, no wire-protocol change, no signature change.

`web/src/file-navigator/file-navigator-tab-types.ts` (lines 4-5) and `web/src/file-navigator/useFileNavigatorDrag.ts` (lines 7-8) import `CommandInputDropHandle` from `../CommandInput` and `EditorDropHandle` from `../EditorTab`, and `useFileNavigatorDrag.test.ts` and `FileNavigatorTab.test.tsx` copy the same reach. That is one feature importing two sibling features, against §3 of `ai/guidelines/react-code-organization.md` (no feature imports another feature).

Both are one-method drop contracts that happen to be declared inside the component implementing them — `CommandInput.tsx:13` and `EditorTab.tsx:28`. The navigator's drag code therefore cannot be compiled, tested, or moved without the editor and the command bar coming with it, and the next drop target (a terminal, a plugin tab) will add a third such import.

## Goal

`CommandInputDropHandle` and `EditorDropHandle` are declared in one shared module at the flat root, `web/src/drop-handles.ts`. Every reference — the two implementing components, the app shell, the file navigator, and the tests — imports the type from there. No feature imports another feature to name a drop target.

## Design decisions

**One module for both handles, not one each.** They are the same contract at two drop targets — "something that accepts a dropped path at its caret" — and they are always reached for together: five of the fourteen consumers import both. Splitting them into `command-input-drop-handle.ts` and `editor-drop-handle.ts` would double the import lines without separating anything that changes independently.

**The flat root, beside `status-button.ts`.** This is the same fix `status-button.ts` already applied to `StatusWindowButtonProps` — a shape shared between a feature and the shell, lifted out of the component that happened to declare it. Following the established placement keeps the shared layer legible rather than inventing a `types/` bucket, which §1 forbids.

**No re-export from the original files.** §4 rules out re-export hubs, and a re-export left behind in `CommandInput.tsx` would preserve exactly the import the navigator must stop making. Every consumer is repointed instead, tests included.

**The types keep their names.** `EditorDropHandle` and `CommandInputDropHandle` name the drop target, not the file they lived in, so they read correctly from a shared module and the fourteen consumers need only their import line changed.

**Both keep their explanatory comments**, moved with them. Each says what the handle is exposed through and why, which is the non-obvious part and is worth more next to the declarations than next to the components.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The precedent for a shared shape at the flat root | `web/src/status-button.ts` (`StatusWindowButtonProps`) |
| `CommandInputDropHandle`'s declaration and comment | `web/src/CommandInput.tsx:11`–`:16` |
| `EditorDropHandle`'s declaration and comment | `web/src/EditorTab.tsx:26`–`:28` |
| The drag hook that consumes both | `web/src/file-navigator/useFileNavigatorDrag.ts` |
| The navigator's tab-prop types that consume both | `web/src/file-navigator/file-navigator-tab-types.ts` |

## Implementation steps

1. **New module `web/src/drop-handles.ts`.** Declare and export both types, each with the comment that currently sits above it. Type-only — no imports, no runtime code.

2. **`web/src/CommandInput.tsx`.** Delete the `CommandInputDropHandle` declaration and its comment; add `import type { CommandInputDropHandle } from './drop-handles';`. The type is still used by `CommandInputProperties.dropRef`.

3. **`web/src/EditorTab.tsx`.** Delete the `EditorDropHandle` declaration and its comment; add `import type { EditorDropHandle } from './drop-handles';`. `EditorTabHandle` stays where it is — it is the editor's own imperative handle, not a drop contract, and nothing outside the editor and the shell names it.

4. **Repoint the ten root consumers** at `./drop-handles`: `App.tsx`, `AppMain.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `MountedViewLayers.tsx`, `AgentTabBody.tsx`, `useTaskPicker.ts`, `usePopulatePickers.ts`, `populate-command-line.ts`, and the `EditorTabHandle`/`EditorDropHandle` split imports in `AppMain.tsx` and `MountedViewLayers.tsx` (which keep importing `EditorTabHandle`, and now `EditorTab` itself, from `./EditorTab`).

5. **Repoint the two file-navigator consumers** at `../drop-handles`: `file-navigator-tab-types.ts` and `useFileNavigatorDrag.ts`. After this the navigator imports nothing from `../CommandInput` or `../EditorTab`.

6. **Repoint the five test files**: `CommandInput.test.tsx`, `EditorTab.test.tsx`, `useTaskPicker.test.ts`, `file-navigator/useFileNavigatorDrag.test.ts`, `file-navigator/FileNavigatorTab.test.tsx`. Each keeps importing its component from where it lives and takes the handle type from `drop-handles` instead.

## Tests

The change is type-only, so the existing suites are the regression check and must pass unchanged in substance — only their import lines move:

- `web/src/file-navigator/useFileNavigatorDrag.test.ts` — the drop-to-command-bar and drop-to-editor cases already build both handles; they now build them against the shared types.
- `web/src/CommandInput.test.tsx` and `web/src/EditorTab.test.tsx` — the `dropRef` cases pin that each component still satisfies its handle.
- New: `web/src/drop-handles.test.ts` — pins the contract the shared module publishes, so a later edit cannot quietly drop a method the drag code calls. A structural check that an object with `insertAtCaret`/`setDropHighlighted` satisfies `CommandInputDropHandle` and that one with `insertAtCaret` satisfies `EditorDropHandle`.

## Out of scope

- **Moving `EditorTab.tsx` into `web/src/editor/`.** That is the separate backlog item below this one, which this change is deliberately sequenced before because both rewrite `EditorTab.tsx`'s import block.
- **Merging the two handles into one type.** They differ — the command bar's also carries `setDropHighlighted` — and collapsing them would widen the editor's contract to a method it does not implement.
- **Adding a third drop target.** The module is shaped to take one; this change adds none.
- **Lint-enforcing the no-cross-feature-import rule** (`import/no-restricted-paths` zones). Worth doing, but it is a repo-wide config change, not this fix.
- **`EditorTabHandle` and any other type still declared in a component file.** Only the two drop contracts the navigator reaches for are in play.
