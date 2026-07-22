# Editor tab: use editor-tab/editor-meta classes and a single metadata row

**Complexity: 4/10** — a class rename shared with two other tab components plus moving one button between two existing rows into one. No new components, no protocol changes, contained to `web/src` markup/CSS/tests.

## Goal

`EditorTab.tsx` renders a plain-text editor, not an image, but its root and metadata-row markup borrow the `image-tab`/`image-meta`/`image-name`/`image-size`/`image-loc` classes from `ImageTab.tsx` (`data-doc-shot="editor-view"` already marks it as distinct). Per the backlog request, the editor tab's DOM should carry its own `editor-tab`/`editor-meta` classes instead. Separately, the editor tab currently renders its buttons across **two** metadata rows: the save button sits in the top `image-meta` row, while the connections button renders in a second `tab-meta` row (via `AgentTabMeta`, reached through `EditorConnectionsPanel`). Per the backlog request, both buttons belong in one row.

## Approach

`image-tab`/`image-meta`/`image-name`/`image-size`/`image-loc` are also used by `ImageTab.tsx` and `MarkdownTab.tsx`, so the classes can't just be renamed in place — `theme.css` needs sibling `.editor-tab`/`.editor-meta`/`.editor-name`/`.editor-loc` rules added alongside the existing `.image-*` ones, and `EditorTab.tsx` switches to the new names while `ImageTab.tsx`/`MarkdownTab.tsx` keep the old ones unchanged.

For the single-row merge, `EditorConnectionsPanel.tsx` currently renders `AgentTabMeta` (which produces the second `tab-meta` row, here holding only the connections button) alongside `StatusPanels` (the floating connections window). The simplest fix that doesn't touch `AgentTabMeta` (shared by `AgentTabBody`/`HarnessTab`/`ShellTab`, each of which legitimately wants their own single `tab-meta` row) is to stop routing the editor's connections button through `AgentTabMeta` at all: render the `StatusWindowButton` for connections directly inside `EditorTab.tsx`'s existing meta row, next to `EditorSaveButton`, and have `EditorConnectionsPanel` render only the floating `StatusPanels` window. This also means the floating connections window's DOM position becomes a direct sibling of the single merged row rather than sitting after a now-removed second row — satisfying the related backlog note that the connections window should render below the metadata row.

## Implementation steps

1. In `web/src/theme.css`, add `.editor-tab`, `.editor-meta`, `.editor-meta .editor-name`, `.editor-meta .editor-loc` rules mirroring the existing `.image-tab`/`.image-meta`/`.image-meta .image-name`/`.image-meta .image-loc` rules (same declarations). Add `.editor-meta` to the shared `user-select: text` selector list (currently `.image-meta, .page-meta, .tab-meta, .monitor-meta, .files-meta`).
2. In `web/src/EditorTab.tsx`:
   - Change the root `<div>` className from `"image-tab editor-tab"` to `"editor-tab"`.
   - Change the meta `<div>` className from `"image-meta"` to `"editor-meta"`, and its child `<span>` classNames from `image-name`/`image-size`/`image-loc` to `editor-name`/`editor-size`/`editor-loc`.
   - Import `StatusWindowButton` and `connectionsWindowIcon`; render a `StatusWindowButton` for `connections.connectionsButton` inside the `editor-meta` row, immediately after `EditorSaveButton`, using the same props (`icon`, `className="tab-connections"`, `hasContent`, `activeTitle`/`emptyTitle`, `onEnter`/`onLeave`/`onClick`) `AgentTabMeta` currently passes for its `connectionsButton`.
3. In `web/src/editor/EditorConnectionsPanel.tsx`, remove the `AgentTabMeta` element and its import; render only `StatusPanels`. Update the file's header comment (it currently says it renders "the connections button ... and its floating window together").
4. In `web/src/EditorTab.test.tsx`, update the `.image-meta`/`.image-name` selectors used by the existing tests (`nameText`, and the two `.image-meta` queries) to `.editor-meta`/`.editor-name`.
5. In `web/src/theme.test.ts`, update the regex in the "makes every metadata text container selectable" test to include `.editor-meta` in the selector list it matches.

## Tests

- Update existing `EditorTab.test.tsx` assertions (step 4 above) rather than adding new cases — the behavior under test (name display, mouse-up focus, save button state) is unchanged, only the class names it queries by change.
- Add one assertion (in `EditorTab.test.tsx`, alongside the existing save-button/meta-row tests) confirming both `.editor-save-button` and `.tab-connections` are present within the same `.editor-meta` container, so a regression back to two rows is caught.
- Update `theme.test.ts`'s metadata-selectable test regex (step 5) so it keeps passing and continues covering `.editor-meta`.

## Spec updates

- `product/specs/` — check for an existing editor-tab spec; if the metadata row or connections placement is documented there, update the class/row description to match (no user-visible behavior changes otherwise, so keep the edit minimal).

## Docs

- Checked `help.md` and `documentation/user-documentation/` for editor-tab DOM class or row-layout descriptions — these are implementation details not previously documented; no update expected, but re-check during implementation in case a doc happens to describe the two-row layout explicitly.

## Out of scope

- `ImageTab.tsx`/`MarkdownTab.tsx` and their `image-tab`/`image-meta` classes — unchanged.
- `AgentTabMeta.tsx` itself and its other consumers (`AgentTabBody`, `HarnessTab`, `ShellTab`) — unchanged; they keep their own single `tab-meta` row as before.
- The "Accept or decline... N of M remaining" residual-counter issue and the ACP-connection-row transcript-button issue — separate backlog entries, not touched here.
