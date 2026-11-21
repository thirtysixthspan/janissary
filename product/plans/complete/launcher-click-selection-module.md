# Extract the launcher's click-confirmation rules into a testable pure module

**Complexity: 2/10** — ~20 lines added in one new pure module, 2 component files edited, 3 behaviors/4 scenarios (p=4.32). No new state, no behavior change.

## Goal

Close the §5 debt item: the launcher's command rail and tab row each define a click-confirmation rule inline inside a render component (`openOnConfirm` in `CommandRail.tsx`, `openOnClick` in `LauncherTabRowView.tsx`) and can only be verified through a full render, while the sessions, conversations, and hosts lists keep the identical kind of rule in pure `*-keys` modules with colocated tests. Give the two launcher lists the same extracted, testable seam.

## Approach

The two rules are already pure three-line functions; the only problem is where they live. Move each verbatim into a new pure module in the launcher feature folder and have the components import them, matching the shape of `sessions-keys.ts`, `conversation-list-keys.ts`, and `hosts-keys.ts`. The result `{ selected, opens }` is the `ListRowClick` type that `ListSelection.rowClicked` already consumes, so no shared type or hook changes.

Keep the two as separate exports rather than folding them into one helper: the command rule confirms against the previously clicked index while the tab rule reads a row's authoritative `active` flag, and unifying several features' click rules is a larger cross-feature change out of scope here. The rule bodies, comments, and rendered behavior are unchanged, so `LauncherTab.test.tsx` needs no edit and must keep its assertions byte-for-byte.

The new module sits inside the launcher feature and is imported with a relative `./launcher-click` path, so it stays within the client plugin-boundary rule without touching the published plugin API.

## Implementation steps

1. Add `web/src/plugins/launcher/launcher-click.ts` as a pure leaf module exporting `commandClickSelection(index: number, confirmed: number | null): { selected: number; opens: boolean }` returning `{ selected: index, opens: confirmed === index }`, and `tabClickSelection(index: number, active: boolean): { selected: number; opens: boolean }` returning `{ selected: index, opens: !active }`. Carry over the existing explanatory comments from the two component files; add no imports.
2. In `web/src/plugins/launcher/CommandRail.tsx`, delete the inline `openOnConfirm`, import `commandClickSelection` from `./launcher-click`, change the click handler to `selection.rowClicked(index, commandClickSelection)`, and drop the now-unused `type ListRowClick` from the `../api` import.
3. In `web/src/plugins/launcher/LauncherTabRowView.tsx`, delete the inline `openOnClick`, import `tabClickSelection` from `./launcher-click`, change the click handler to `selection.rowClicked(index, (at) => tabClickSelection(at, row.active))`, and drop the now-unused `type ListRowClick` from the `../api` import.
4. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

Add `web/src/plugins/launcher/launcher-click.test.ts`, mirroring the style of `conversation-list-keys.test.ts` and `hosts-keys.test.ts`:

- `commandClickSelection` highlights a clicked row without opening it (`confirmed` is `null` or a different index).
- `commandClickSelection` opens a repeat click on the same row (`confirmed === index`).
- `commandClickSelection` does not open the first row on its first click, even though it starts current.
- `tabClickSelection` does not open an active tab row on click.
- `tabClickSelection` opens an inactive tab row on click, moving the selection to it.

`LauncherTab.test.tsx` renders both lists and pins the interaction; it needs no edit and keeps its assertions byte-for-byte. All existing launcher and shared list-selection suites must stay green.

## Spec updates

None. This is a pure refactor: the "click once selects, click again opens" command behavior and the "one click focuses an inactive tab row" behavior are unchanged, so no functional spec changes.

## Docs

- `help/` — no command, flag, key binding, or behavior changed. No update needed.
- `documentation/user-documentation/` — no page documents this launcher interaction. No update needed.

## Out of scope

- The shared `ListRowClick` type and `useListSelection` in `web/src/shared/list-selection.ts`.
- `sessions-keys.ts`, `conversation-list-keys.ts`, and `hosts-keys.ts` — unifying several features' click rules is a separate cross-feature change.
- `LauncherTab.test.tsx` assertions, which must remain byte-for-byte.
- The published client plugin API surface (`web/src/plugins/api.ts`) and `TAB_PLUGIN_API_VERSION`.
