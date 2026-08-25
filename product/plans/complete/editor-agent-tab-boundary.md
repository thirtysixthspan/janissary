# Break the editor feature's boundary with the agent tab

**Complexity: 3/10** — one type declaration moves into a module that already builds its shape, five import lines change, and two files move into the editor directory. No logic changes, no new modules with behavior, and nothing a user can observe changes.

The editor feature and the agent-tab feature are tangled in both directions, in ways that §3 of [`react-code-organization.md`](../../ai/guidelines/react-code-organization.md) exists to prevent:

- `web/src/editor/EditorMetaRow.tsx:5` and `web/src/editor/useEditorConnections.ts:8` both import `type { StatusWindowButtonProps }` from `../AgentTabMeta` — a type declared inside the agent tab's meta-row component. That is one feature importing another.
- `web/src/EditorSaveButton.tsx` is an editor-only control sitting in the flat `web/src/` root with exactly one non-test consumer, `editor/EditorMetaRow.tsx`, against §2 (colocate; promote only on a second consumer).

The cost is that the editor cannot be moved, tested, or deleted without the agent tab coming along, and the coupling is invisible because it is type-only — so the next editor file copies it.

## Goal

Nothing under `web/src/editor/` imports from `AgentTabMeta.tsx`, and the editor's save button lives beside the only component that renders it. `StatusWindowButtonProps` is owned by a shared module that both features import downward.

## Design decisions

**`web/src/status-button.ts` is the type's new home, not a new file.** That module is already beside `useStatusWindows.ts` (which owns the matching `StatusWindowHandlers`), already imports from it, and its `statusButton()` helper already returns the `StatusWindowButtonProps` shape written out inline as an anonymous return type. Moving the declaration there names that return type instead of duplicating it, and adds no module to a root directory that has too many already.

**`AgentTabMeta.tsx` re-imports the type rather than keeping a copy or re-exporting it.** §2 says promote by moving — no copy left behind, no re-export from the old home. Every consumer, the agent tab included, imports from `status-button.ts` directly, so there is no indirection hop for "go to definition" to lose (§4).

**`EditorSaveButton` moves with its test.** The test is colocated today and stays colocated; only its directory changes. Its `./icons` import becomes `../icons`, matching how the editor's other components (`EditorMetaRow.tsx`, `EditorSyncIcon.tsx`) already reach the shared icon module.

**No lint zones in this change.** Enforcing §3 mechanically with `import/no-restricted-paths` is worth doing and is repo-wide config work, not this fix.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The helper that builds the button props shape | `statusButton()` in `web/src/status-button.ts` |
| The matching handlers type it consumes | `StatusWindowHandlers` in `web/src/useStatusWindows.ts` |
| The presentational button both features render | `web/src/StatusWindowButton.tsx` |
| The editor components that already import `../icons` | `web/src/editor/EditorMetaRow.tsx`, `web/src/editor/EditorSyncIcon.tsx` |
| The save button's existing tests | `web/src/EditorSaveButton.test.tsx` (four cases, moving unchanged) |

## Implementation steps

1. **`web/src/status-button.ts`: own the type.** Add `export type StatusWindowButtonProps = { hasContent: boolean; onEnter: () => void; onLeave: () => void; onClick: () => void }` and change `statusButton()`'s return annotation to `StatusWindowButtonProps`.

2. **`web/src/AgentTabMeta.tsx`: stop declaring it.** Delete the local `export type StatusWindowButtonProps` and import the type from `./status-button` instead.

3. **`web/src/HarnessTab.tsx`: split the import.** `import { AgentTabMeta } from './AgentTabMeta'` plus `import type { StatusWindowButtonProps } from './status-button'`.

4. **`web/src/editor/useEditorConnections.ts` and `web/src/editor/EditorMetaRow.tsx`: point at the shared module.** Both change `from '../AgentTabMeta'` to `from '../status-button'`. Nothing else in either file changes.

5. **Move the save button into the feature.** `git mv web/src/EditorSaveButton.tsx web/src/editor/EditorSaveButton.tsx` and `git mv web/src/EditorSaveButton.test.tsx web/src/editor/EditorSaveButton.test.tsx`. In the component, `./icons` becomes `../icons`; the test's `./EditorSaveButton` import is already correct at its new path. In `EditorMetaRow.tsx`, `'../EditorSaveButton'` becomes `'./EditorSaveButton'`.

## Tests

- `web/src/editor/EditorSaveButton.test.tsx` — the four existing cases (Save tooltip, disabled when clean, enabled when dirty, `onSave` fires on click) must pass unchanged at the new path. That is the check that the move preserved the component.
- `web/src/AgentTabMeta.test.tsx` and `web/src/HarnessTab.test.tsx` must pass unchanged — they exercise the agent tab through props, and the type's new home must not disturb them.
- `web/src/editor/useEditorConnections.test.ts` must pass unchanged — it pins the button props the hook builds, which is the shape the moved type describes.
- New in `web/src/editor/useEditorConnections.test.ts`: assert the hook's `connectionsButton` satisfies the shared `StatusWindowButtonProps` contract by importing the type from `web/src/status-button` and binding the result to it, so the seam is exercised from the editor side rather than only by the compiler.

## Out of scope

- **Gathering the file-navigator feature into `web/src/file-navigator/`.** A separate backlog item.
- **Moving any other editor-only file out of the flat root.** `EditorTab.tsx` has consumers beyond the editor directory; only the save button meets §2's one-consumer test today.
- **Adding `import/no-restricted-paths` zones** to enforce §3 mechanically. Repo-wide config, not this fix.
- **Changing `useStatusWindows`, `StatusWindowButton`, or the connections/schedule window behavior.** This change moves a type and a file; it touches no runtime logic.
