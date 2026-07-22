# Editor tab: anchor the floating connections window below the metadata row

**Complexity: 3/10** — moves one existing element to a different parent in the same file; no new components, no CSS rule changes, no protocol changes.

## Goal

`StatusPanels` (the floating "connections"/"schedule" window, `.status-panels`) is `position: absolute`, so it renders relative to its nearest positioned ancestor. For agent tabs (`AgentTabBody.tsx`), that ancestor is `.main` — a sibling that comes *after* the metadata row (`AgentTabMeta`) and wraps only the transcript, so the floating window is correctly anchored below the header. In the editor tab, `EditorConnectionsPanel` (which renders `StatusPanels`) is a sibling of `EditorMetaRow` inside `.editor-tab`, but neither `.editor-tab` nor `.tab-body` (its own parent) sets `position: relative` — so the floating window escapes to whatever positioned ancestor happens to be further up the tree instead of anchoring below the editor tab's own metadata row, per the backlog request.

## Approach

`.editor-body` (`web/src/theme.css:625`) already has `position: relative` and, like agent tabs' `.main`, is the sibling that comes after the metadata row and fills the remaining space. Rendering `EditorConnectionsPanel` as the first child inside `.editor-body` (before the hidden textarea) gives `StatusPanels` the same positioned-ancestor relationship agent tabs already have with `.main`, with no new CSS. This mirrors the existing pattern rather than introducing a new one.

## Implementation steps

1. In `web/src/EditorTab.tsx`, move the `<EditorConnectionsPanel tab={tab} api={connections} />` element from its current position (a sibling before `PendingSuggestPanel` and the `.editor-body` div) to be the first child inside the `.editor-body` div, before the `<textarea>`.

## Tests

- Add a test to `EditorTab.test.tsx` rendering a tab with an open connection (`tab.connections` non-empty) and asserting the resulting `.status-panels` element is a descendant of `.editor-body` (e.g. `container.querySelector('.editor-body .status-panels')` is non-null), guarding against the window being rendered outside `.editor-body` again.

## Spec updates

- `product/specs/connection.md:45` already describes the connections button/window generically ("floats at the top-right of the active tab") without pinning its exact DOM anchor — no wording change needed since the user-visible behavior (window appears near the top of the tab's content area) is unchanged, only its precise anchor within the editor tab is corrected.

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither documents the connections window's DOM anchoring; no update needed.

## Out of scope

- `AgentTabMeta.tsx`, `StatusPanels.tsx`, and `.status-panels`/`.panel` CSS rules — unchanged.
- The editor tab's metadata-row classes and single-row button merge — already fixed (see `product/plans/complete/editor-tab-classes-and-single-meta-row.md`).
- The other remaining backlog issues (residual suggestion counter, ACP connection transcript buttons) — not touched here.
