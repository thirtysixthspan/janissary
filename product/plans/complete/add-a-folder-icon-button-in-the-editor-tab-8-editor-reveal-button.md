# Editor reveal button

**Complexity: 5/10** — ~65 added lines, 4 files, 8 requirements, 13 test scenarios (p=5.735, below the 5.739 six threshold). The component is small; the cost is three exact wordings, focus protection against a row that restores focus on mouse-up, a sender that must stay silent while blocked, and the existing actions-group button count that has to move with it.

## Goal

Add the folder icon button to the editor tab's metadata row. It renders first in the actions group, uses the same folder icon as the shell and harness rows, carries the exact enabled and disabled wording in both its tooltip and its accessible name, and sends `revealInFileNavigator` for the editor tab's label when it is not blocked. A click never hands focus back to the buffer.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-1-reveal-target-and-blocked-state` for the `EditorView.revealBlocked` payload and on `add-a-folder-icon-button-in-the-editor-tab-5-reveal-rpc` for the request it sends. Both live in `./product/plans/ready/` and must have landed first: without `01` the prop type does not resolve, and without `05` the `send` call is not a known RPC method. `09-editor-key-binding` reuses the sender and the bound callback. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; this is its "Editor client" button and sender bullets plus the "UI design" placement, wording, focus-protection, and styling decisions.

- A new presentational component `web/src/editor/EditorRevealButton.tsx` takes `revealBlocked: EditorView['revealBlocked']` and `onReveal: () => void`. It imports `FontAwesomeIcon` from `@fortawesome/react-fontawesome`, `openFilesIcon` from `../shared/icons`, and the `EditorView` type from `@shared/protocol` — the icon import matching `EditorCommitButton.tsx:2` and the shared type matching `EditorMetaRow.tsx:2`. It holds one module-level table from each blocked reason to its note, the way `EditorCommitButton`'s `STATE_NOTES` table maps commit states (`web/src/editor/EditorCommitButton.tsx:7`), with the enabled `Reveal in file navigator` as the default used when no reason is set. The table is typed over `NonNullable<EditorView['revealBlocked']>`, so a new reason cannot be added without its wording. One module-level helper turns `revealBlocked` into that one string, and the component assigns it to `title` and `aria-label` from that same value; never compute the two separately.
- The three exact titles are the enabled `Reveal in file navigator`, the unsaved `Reveal in file navigator (save the file first)`, and the orphaned remote `Reveal in file navigator (reopen from a remote navigator)`. The same string is both `title` and `aria-label` in every state; there is no separate accessible name and no separate disabled explanation.
- The component renders an ordinary `<button type="button">` with class `editor-reveal-button` and the `openFilesIcon` from `web/src/shared/icons.ts:4` (Font Awesome `faFolder`), the icon the shell and harness metadata rows already use. It is `disabled` exactly when `revealBlocked` is defined. It carries no second class and no reason modifier: unlike `EditorCommitButton`, its blocked state is expressed only through the wording and the `disabled` attribute, so there is nothing to style per reason.
- Its `onMouseUp` stops propagation. The metadata row's outer `onMouseUp` (`web/src/editor/EditorMetaRow.tsx:35`) calls `onMetaMouseUp`, which puts focus back in the hidden textarea when no text is selected (`web/src/editor/EditorTab.tsx:138`). Without the stop, the click would focus the tree and the mouse-up would immediately take focus back, which is the one behavior that distinguishes this button from the shell and harness folder buttons. The stop is the whole of the implementation: it is attached to the button itself, and no wrapper element or second handler is added. A disabled control delivers no click, so the blocked case is inert without further protection. Do not move the stop to `.editor-meta` or to the actions group; the row's refocus must keep working for every other control and for a plain click on the header text.
- `EditorMetaRow` gains a required `onReveal: () => void` prop, added beside `onCommitOrigin` in the `Properties` type (`EditorMetaRow.tsx:25`) and in the destructured parameters (`:32`), and renders `EditorRevealButton` first inside the `editor-actions` span (`EditorMetaRow.tsx:44`), ahead of `EditorSyncIcon`. It is required rather than optional because `EditorTab` is its only caller (`EditorTab.tsx:156`), so an omitted prop is a compile error rather than a silently inert button. That placement matches the shell and harness rows, where the folder button leads the actions group. The other actions keep their order: sync, save, commit, connections, Split.
- The sender is a plain function in `web/src/editor/editor-file-commands.ts`, beside `commitAfterSave`, `renameAndRefocus`, and `sendResync`. Its signature is `sendRevealInFileNavigator(client: Pick<JanusClient, 'send'>, label: string, revealBlocked: EditorView['revealBlocked']): void`, with the `EditorView` type imported from `@shared/protocol` as a type-only import beside the existing `JanusClient` import (`editor-file-commands.ts:1`). It returns before sending when `revealBlocked` is defined, and otherwise sends `{ method: 'revealInFileNavigator', params: { label } }`. This guard is the only blocked check on the client: `09` routes the chord through this same function, so do not duplicate the check in the component or the key handler. It calls no React hook, so it is not a `use*` function, per `ai/guidelines/react-code-organization.md` §6.
- `EditorTab` binds the sender once with `useCallback` over `client`, `tab.label`, and `editor.revealBlocked`, placed above the `useEditorInteractions` call at `EditorTab.tsx:88`, and passes the bound callback to `EditorMetaRow` as `onReveal`. Binding it above that call now means `09` passes the same value to `useEditorInteractions` without moving or duplicating it; a `const` read below its declaration would throw on the first render. `useCallback` is already imported at `EditorTab.tsx:1`; do not add a memo wrapper around `EditorMetaRow` for this. The label is the editor tab's own `tab.label`, which is what the RPC names.
- The button is present in every editor state. It is not hidden for a new file or an orphaned remote file; it is dimmed and inert with the reason in its wording, as the source plan requires. It opens no overlay, popup, or menu of its own, so it adds no Escape handling and has nothing to dismiss; Tab reaches it in DOM order and Enter or Space activates it.
- Styling is a new `.editor-reveal-button` class in `web/src/theme.css` beside `.editor-commit-button` (`theme.css:956`), with the same declarations: transparent background, no border, `--muted`, 13px, small padding, pointer cursor. `:hover` sets `--fg`. `:disabled` uses `--faint` and the default cursor, and `:disabled:hover` keeps `--faint`, matching `.editor-save-button:disabled` (`theme.css:885`). Write the `:disabled` and `:disabled:hover` rules after the `:hover` rule so the cascade dims a blocked button instead of brightening it, the ordering hazard `theme.test.ts:131` pins for `.tab-launch-shell:disabled`. No other CSS changes: `.editor-meta` already wraps (`theme.css:237`, `flex-wrap: wrap`) and `.editor-actions` already refuses to shrink (`theme.css:254`, `flex-shrink: 0`), so on a narrow pane the whole actions group moves to its own line rather than clipping.
- `EditorTab.tsx` is 174 counted lines under the 200-line `max-lines` rule (218 raw; the rule skips blanks and comments). This subplan adds roughly six counted lines — one import, a four-line `useCallback`, and one prop pass — so it does not extract anything, and neither does `09`, which adds one more prop pass. If a later subplan crosses 200, extract the metadata-row callback bindings (the save, rename, commit, sync, and reveal closures) into a small colocated hook or module in `web/src/editor/` per `ai/guidelines/code-guidelines.md`; never compact the file or strip comments. Do not extract speculatively here: a new module with one caller is the churn the 200-line limit exists to avoid.
- The app shell and the navigator feature are not imported. The button talks only to the client and the server.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Metadata-row action component model | `web/src/editor/EditorCommitButton.tsx` (`STATE_NOTES`, lines 7 to 11; `<button>` with `title` and `aria-label`) | The shape of the new presentational component and its title table. |
| Folder icon | `web/src/shared/icons.ts:4` (`faFolder as openFilesIcon`) | Reused unchanged. |
| Actions group | `web/src/editor/EditorMetaRow.tsx:44` (`.editor-actions`) | New button rendered first. |
| Metadata-row focus restore | `web/src/editor/EditorMetaRow.tsx:35`, `web/src/editor/EditorTab.tsx:138` (`onMetaMouseUp`) | The handler the button's mouse-up must not reach. |
| Command senders | `web/src/editor/editor-file-commands.ts` (`commitAfterSave`, `renameAndRefocus`, `sendResync`) | Home for the new plain sender. |
| Existing button styling | `web/src/theme.css:956` (`.editor-commit-button`), `:885` (`.editor-save-button:disabled`) | Declarations and disabled state copied, not shared or refactored. |
| Editor payload reasons | `src/tab/types.ts` (`EditorView.revealBlocked`, from `01`) | The prop that drives the title and `disabled`. |
| Reveal RPC | `src/protocol/file-navigator.ts` (`revealInFileNavigator`, from `05`) | The request the sender emits. |
| Component test precedent | `web/src/editor/EditorCommitButton.test.tsx`, `web/src/editor/EditorSaveButton.test.tsx` | The render, title, class-name, `toBeDisabled`, and click patterns. |
| Metadata-row button order | `web/src/harness/HarnessTab.test.tsx:426` (`.toEqual(['tab-open-files', 'tab-launch-shell', 'tab-open-diff', 'tab-open-transcript'])`) | The pattern for asserting the reveal button leads the group, not just that it exists. |
| CSS rule assertions | `web/src/theme.test.ts:62` (`draws the workspace diff button flat and muted, including while disabled`) | The pattern for pinning the new class's base, hover, and disabled rules. |

## Proposed changes

- Create `web/src/editor/EditorRevealButton.tsx` with the props, table, button, icon, disabled state, and mouse-up stop described above.
- Add the required `onReveal` prop to `EditorMetaRow` and render the new button first in `.editor-actions`.
- Add `sendRevealInFileNavigator` to `editor-file-commands.ts`, importing the `EditorView` type from `@shared/protocol`.
- Bind it once in `EditorTab` and pass it to `EditorMetaRow`. Keep the existing `onMetaMouseUp` behavior for every other part of the row.
- Add the `.editor-reveal-button` rules to `theme.css` beside `.editor-commit-button`.
- Update the existing actions-group button count in `EditorTab.test.tsx:751` from 5 to 6 in the same change; it is the only place in `web/src/` that counts them, and it fails as soon as the button renders.
- Add the `.editor-reveal-button` rule assertions to `web/src/theme.test.ts` beside the workspace diff button case.
- Do not add a command, a context-menu entry, or any other entry point.

## Tests

In a new `web/src/editor/EditorRevealButton.test.tsx`, modelled on `web/src/editor/EditorCommitButton.test.tsx`:

- The enabled state renders `Reveal in file navigator` as both `title` and `aria-label`, is not disabled, and appends no note. Assert `button.className` is exactly `editor-reveal-button` the way `EditorCommitButton.test.tsx:11` asserts its class.
- `'unsaved'` renders `Reveal in file navigator (save the file first)` and `'no-route'` renders `Reveal in file navigator (reopen from a remote navigator)`, each as both attributes, and each is disabled (the `toBeDisabled` matcher used at `EditorSaveButton.test.tsx:14`).
- The folder icon is rendered.
- A click calls `onReveal`, and `fireEvent.mouseUp` on the button does not reach a parent `onMouseUp` spy wrapped around the component.
- A `click` on the disabled button calls nothing.
- Do not assert focus restoration for the disabled state. jsdom still bubbles a synthetic `mouseup` fired at a disabled button up to the row, because React suppresses only the disabled element's own listeners, while a browser delivers no click there at all. A focus assertion in that case would describe the test environment instead of the product.

In `web/src/editor/editor-file-commands.test.ts`, beside the `sendResync` case (`:33`):

- The sender sends `{ method: 'revealInFileNavigator', params: { label } }` with the editor label when unblocked.
- It sends nothing for `'unsaved'` and nothing for `'no-route'`.

In `web/src/editor/EditorTab.test.tsx`:

- Update `groups every metadata button in the right-side actions` (`:737`) to expect 6 buttons in `.editor-actions` (`:751`); keep its second assertion that no button sits directly under `.editor-meta` (`:752`). Do not relax the count to a range or `toBeGreaterThan`.
- The reveal button is the first control in the `.editor-actions` group, before the sync icon. Render `makeView({ sync: 'synced' })` for this case, as the sync-icon case at `:1019` does: `EditorSyncIcon` renders nothing without a sync state (`EditorSyncIcon.tsx:23`), so an unsynced view would pass the ordering assertion no matter where the button sat. Assert the first `button` inside `.editor-actions` has class `editor-reveal-button` and that it precedes `actions.querySelector('.editor-sync-icon')`, following the class-list assertion at `HarnessTab.test.tsx:426`.
- A full press on the button sends the RPC and leaves the textarea unfocused. Move focus to an outside element first, as the selection case at `:817` does, then fire `mouseDown`, `mouseUp`, and `click` on the button; assert `client.send` was called with the label (`client.send` is the fake at `:53`, and `:1024` is the assertion pattern for a fire-and-forget RPC) and that `document.activeElement` is not the textarea. A bare `fireEvent.click` never runs the row's mouse-up handler, so it would not prove the stop is there.
- A blocked view (`makeView({ revealBlocked: 'unsaved' })`) renders a disabled reveal button, and a full press on it sends nothing. Do not assert focus in this case, for the reason given above.
- The existing metadata-row cases stay green unchanged: `a plain metadata click restores focus to the textarea on mouse-up` (`:805`) and `does not restore editor focus when metadata text is selected` (`:817`). They are the guard that the stop is scoped to the button and did not move to the row.

In `web/src/theme.test.ts`, beside `draws the workspace diff button flat and muted, including while disabled` (`:62`):

- `.editor-reveal-button` declares a transparent background, no border, `color: var(--muted)`, `font-size: 13px`, and a pointer cursor; `:hover` sets `color: var(--fg)`; `:disabled` sets `color: var(--faint)` and the default cursor. The rule that no component test can see is exactly the one the theme suite exists for.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project client web/src/editor/EditorRevealButton.test.tsx web/src/editor/editor-file-commands.test.ts web/src/editor/EditorTab.test.tsx web/src/theme.test.ts`. Read the diff to confirm the button is first in the actions group, that the mouse-up stop is on the button rather than on the row, that the `.editor-actions` count moved from 5 to 6 in that one assertion, and that no other metadata-row action changed behavior.

## Out of scope

- The Cmd+Shift+E binding; `09` owns it and reuses this sender and callback.
- Any server change; the RPC landed in `05`.
- The navigator side's held selection, focus, acknowledgement, and sidebar selection; `06`, `07`, `10`, and `11` own those.
- Spec, help, and user documentation; `12` owns those.
- A command, a context-menu entry, or a second click target.
- Revealing the target directory of a not-yet-saved new file; the button stays inert until the first save creates the file.
- Refactoring the button styles into a shared class; the source plan asks for a separate editor-scoped class.
