# Add "Search for this" to the default context menu

**Complexity: 4/10** — no new architecture. The default menu already has a plugin contribution seam (`defaultMenu` declaration + `defaultMenuAction` handler), and the search plugin already knows how to open, seed, search, and focus from a phrase (`search <phrase>`). The work is widening that seam from "exactly one contributor" to "an ordered list of contributors", which touches one wire type, the server resolver, the controller adapter, the client hook and component, and their tests.

## Goal

Right-clicking a text selection offers **Search for this** directly above **Chat about this**, in the same contributed group. Activating it opens the search tab (or focuses the open one), puts the selected text in the search bar, runs that search, and leaves the search tab focused — exactly what `search <selection>` does. `Cmd+I`/`Ctrl+I` keeps running **Chat about this** only.

## Approach

The default menu currently resolves a contribution only when exactly one bundled plugin declares `defaultMenu`; a second contributor would make both disappear. Widen it:

- **Declaration** (`src/plugins/api.ts`): `defaultMenu?: { label: string; order?: number; shortcut?: true }`. Both new fields are optional and additive, so the plugin API version does not change. `order` sorts entries ascending (missing reads as 0; ties keep catalog order). `shortcut` marks the entry `Cmd+I`/`Ctrl+I` runs directly.
- **Resolution** (`src/plugins/default-menu.ts`): `defaultMenuActionsFor(declarations)` returns every contribution, ordered. A label claimed by more than one plugin is offered by none of them (the run RPC identifies the entry by label, so an ambiguous label cannot be routed). When more than one entry claims the shortcut, none keeps it.
- **Wire** (`src/protocol/plugin.ts`): `DefaultMenuEntry` becomes `{ label: string; shortcut?: true }`, and `defaultMenuSelectionAction` answers `DefaultMenuEntry[]` (empty when nothing contributes) instead of `DefaultMenuEntry | null`. The method name is unchanged.
- **Controller adapter** (`src/controller/plugin-adapter.ts`): `defaultMenuSelectionAction()` maps the resolved list to wire entries; `runDefaultMenuSelectionAction` finds the entry whose label matches.
- **Manifests**: conversations gets `order: 2, shortcut: true`; search gets `defaultMenu: { label: 'Search for this', order: 1 }`.
- **Search activation** (`src/plugins/search/activate.ts`): `defaultMenuAction: (selection, capabilities) => sessionFor(capabilities).open(selection)` — the same path as `search <phrase>`, so the tab opens or is focused, the seed moves so the bar adopts the phrase, the search runs once, and the bar takes focus when the tab becomes active.
- **Client hook** (`web/src/context-menu/useDefaultContextMenu.ts`): hold `DefaultMenuEntry[]`; `runContributed(label)` sends the named entry; `Cmd+I` runs the entry flagged `shortcut`, if any.
- **Client component** (`web/src/context-menu/DefaultContextMenu.tsx`): render every contributed entry, in order, as the one final group behind the divider.

## Implementation steps

1. Widen the declaration type, rewrite the resolver as `defaultMenuActionsFor`, change the wire type and comments, and update the controller adapter and message dispatch typing.
2. Mark the conversations manifest `order: 2, shortcut: true`.
3. Add the search plugin's `defaultMenu` declaration and `defaultMenuAction` handler.
4. Update the client hook and component for a list of entries and the shortcut flag.
5. Update and add tests (below).
6. Update specs and user documentation.

## Tests

- `src/plugins/default-menu.test.ts`: resolver returns every contribution ordered by `order` (not catalog order); returns `[]` when none contribute; drops a label claimed by two plugins while keeping others; drops the shortcut flag when two entries claim it.
- `src/controller/plugin-adapter.test.ts`: update to the list shape; two distinct contributors are both offered in order and the second one's label dispatches to its own plugin; duplicate labels are refused.
- `src/plugins/search/activate.test.ts`: the default-menu action opens the tab, seeds the selection as the query (seed moves), and starts a scan.
- `web/src/context-menu/DefaultContextMenu.test.tsx`: update mocks to the list shape; two entries render in server order in one group after a single divider, and activating **Search for this** sends its own label; `Cmd+I` runs the shortcut entry, not the first entry; `Cmd+I` sends nothing when no entry carries the shortcut.
- `web/src/harness-selection-menu.test.tsx`: update its mock to the list shape.

## Specs and docs

- `product/specs/context-menu.md`: contributed entries are a list; describe **Search for this** above **Chat about this**, ordering, and that `Cmd+I` runs Chat about this.
- `product/specs/search-tab.md`: opening the tab from the default menu's **Search for this**.
- `product/specs/editor-tab.md` and `product/specs/harness.md`: they list the menu's entries, so add **Search for this**.
- `documentation/user-documentation/getting-started/context-menus.md`, `documentation/user-documentation/tab-types/editor.md`, and `documentation/user-documentation/advanced-agents/harness.md`: they list the menu's entries, so add **Search for this**.

## Out of scope

- A keyboard shortcut for **Search for this**.
- Reshaping multi-line selections into a single-line query; the selection is searched as given (trimmed), exactly as `search <phrase>` would.
- Renaming the `defaultMenuSelectionAction` RPC.
- Developer documentation for the plugin API (`documentation/developer-documentation/`), which this task may not edit.
