# Scripts tab client list
**Complexity: 3/10** — a client-only list tab copied from the schedules tab, with no new protocol surface because the shared contract comes from `05`; the name-keyed selection and the keyboard rules are the only logic, and the action column and dialog come later in `07`.

## Goal

Create `web/src/plugins/scripts/` with the entry, the tab component, the row list, the pure key handling, and the stylesheet. The tab shows the rows, moves a selection with the keyboard, shows the empty state, and sends `create` and `open`.

## Design decisions and dependencies

This subplan depends on `05-scripts-plugin-server` (complete) for the shared contract at `@shared/plugins/scripts/shared`. The client imports the types `ScriptsPayload` and `RunscriptRow`, the open payload type `NameIntent`, and the guard `isScriptsPayload`. It lands before `07`, which edits the same files, and before `08`, which registers the plugin.

- The entry `index.tsx` imports `'../shared.css'` first and `'./scripts.css'` second, the order `web/src/plugins/sessions/index.tsx` and `web/src/plugins/search/index.tsx` use. The shared stylesheet is required because the metadata row's `.plugin-actions` class is defined only in `web/src/plugins/shared.css`. The schedules entry omits that import, and this entry does not copy the omission. The entry default-exports `ScriptsTab` from `./ScriptsTab` and re-exports `isScriptsPayload` under the name `isPayload`, in the same form as `web/src/plugins/schedules/index.tsx`, which re-exports `isSchedulesPayload` that way.
- Lint permits the non-test files in this directory to import only `../api`, `../shared.css`, and `@shared/plugins/scripts/shared`, plus packages such as FontAwesome and sibling files in the same directory. The rule is the client block of `eslint.plugin-boundaries.mjs`. It matches any other `../` path, so `../schedules/...` and `../../protocol` both fail lint, which is how the source plan's "one feature does not import another" rule is enforced. Test files are exempt from that block, so a test importing `../schedules` would pass lint. The Verification grep therefore covers test files as well. The types come from `@shared/plugins/scripts/shared` and nothing else.
- The keyboard movement uses `nextListSelection` from `../api`, called from `ScriptsTab.tsx` with the row count, the selected index, and the key. It is the rule every plugin list shares, and importing it from `../api` does not import another feature. The schedules keys module re-exports it, but this subplan does not copy that re-export, because `scripts-keys.ts` is a pure module and `ai/guidelines/react-code-organization.md` §8 lets a pure module import only other pure modules. The source plan asked for the key handling to be "written separately". This subplan keeps that for the key-to-meaning mapping and reuses the shared movement rule.
- Selection is held as the selected runscript's name, not as an index. The tick can add or remove rows at any moment. An index would move the highlight onto a different script when a row appears above it. The source plan does not say which to use, so this is a decision made here. Each render finds the selected name's position in the current rows through the name lookup in `scripts-keys.ts`. If the name is no longer present, nothing is highlighted. The stored name is not cleared while it is absent, so a row that comes back under the same name is highlighted again. While the name is absent, the movement keys step from no selection, and Enter sends nothing.
- Up, Down, Home, and End move the selection through `nextListSelection`, which does not wrap. With no selection, the rule steps from the first row, so the first ArrowDown selects the second row and the first ArrowUp selects the first row. The schedules tests pin the same behavior, so it is kept. The selected row scrolls into view with a scroll effect keyed on the selected index, as the schedules tab does, and the effect finds the row through its `data-index` attribute. A click on a row focuses the tab's container, as `onRowClick` in `web/src/plugins/schedules/SchedulesTab.tsx` does, so the keys work after a click.
- Enter on the selected row and a double-click on any row send `open` with the row's name, as `{ name }`. Enter with no selection, or with a stored name that is no longer listed, sends nothing. A single click only selects. Neither changes tabs.
- Delete and Backspace are mapped to the delete meaning in `scripts-keys.ts`, so `07` can attach its dialog to that meaning. In this subplan the tab does nothing with them and does not call `preventDefault`, so the key event is left unhandled.
- The `+` button is in the metadata row, built from `PluginActionsHeader` with the required `className` `scripts-header`. Its icon is `newTabIcon` from `../api`, which is `faPlus`. Its `title` and `aria-label` are both `New script`, and a click sends `create` with the empty object `{}`. Beside it, inside the same `plugin-actions` span, the row renders `capabilities.splitAction`, as `web/src/plugins/schedules/SchedulesTab.tsx` and `web/src/plugins/markdown/MarkdownTab.tsx` do. That control is the centre split, which the host offers to centre tabs whether or not they dock. It is not the dock control, so the tab keeps it while it stays centre-only.
- The clock marker belongs to the row it is drawn on. It uses `scheduleWindowIcon` from `../api`, which is `faClock`, and renders only when that row's `schedules` is above zero. Its `title` and `aria-label` are `Used by a system schedule`, so a test can find it by title. It appears and disappears as the server's count changes, and the component compares nothing.
- The empty state reads `No runscripts yet. Press + to create one.` and the tab stays open. The metadata row renders in both states, so the `+` button is there when the list is empty.
- The tab is centre-only. It has no dock header, no compact layout, and no reading of `capabilities.dock`. It requests no `dockTab`, which the `05` manifest already leaves out.
- Rows, counts, and open flags come from the payload. The component decides nothing about them. It renders the rows in the order the payload gives without sorting them, the rule for server-owned state in `ai/guidelines/plugins-tabs.md` (Client contract). The `open` flag is carried through but not rendered in this subplan.
- The intents are sent as `capabilities.intent('open', { name })` and `capabilities.intent('create', {})`, each prefixed with `void` as the schedules tab sends its focus intent. The tab neither awaits nor catches them. The open payload is typed with `NameIntent`, so the client's literal matches the shared guard the server checks.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Schedules tab entry and component | `web/src/plugins/schedules/index.tsx`, `SchedulesTab.tsx` | Pattern for the entry, the keyboard handling, and the scroll effect. Not imported. |
| Shared plugin client API | `web/src/plugins/api.ts` (`PluginActionsHeader`, `newTabIcon`, `scheduleWindowIcon`, `nextListSelection`, `TabPluginClientCapabilities`) | Imported for the header, the icons, the movement rule, and the capability type. |
| Schedules keys module | `web/src/plugins/schedules/schedules-keys.ts` | Pattern only. It shows the shared movement rule re-exported from `../api`. This subplan calls the rule from the tab instead, so its key module imports nothing. |
| Selection state hook | `web/src/shared/list-selection.ts` (`useListSelection`, published from `../api`) | Not used. It holds an index and clamps it into the list, so a row inserted above would move the highlight. This tab holds the name. |
| Client module shape | `web/src/plugins/registry.tsx` (`ClientPluginModule`) | The entry must satisfy it: a default component and a guard named `isPayload`. |
| Shared contract | `src/plugins/scripts/shared.ts` (from `05`) | Imported through `@shared/plugins/scripts/shared`. |
| Stylesheet precedent | `web/src/plugins/schedules/schedules.css` | Pattern for the row and header rules. |
| Shared plugin frame | `web/src/plugins/shared.css` (`.plugin-actions`) | Imported by the entry, because the metadata row's span uses its rule. |

## Proposed changes

- `web/src/plugins/scripts/index.tsx` (new): imports `'../shared.css'` and then `'./scripts.css'`, default-exports `ScriptsTab` from `./ScriptsTab`, and re-exports `isScriptsPayload` as `isPayload` from `@shared/plugins/scripts/shared`, as described under Design decisions.
- `web/src/plugins/scripts/ScriptsTab.tsx` (new): renders the metadata row with the `+` button and the split control, then the empty state or the list. Its keyboard handler sends the move keys to `nextListSelection`, sends `open` on Enter, and does nothing for Delete and Backspace. It holds the selected name in view state, scrolls the selected row into view, and sends the `create` and `open` intents. It is the largest file in this subplan, planned at about 100 code lines, under the 200-line `max-lines` limit, so no extraction is needed now. If `07` pushes it past about 170 code lines, `07` moves the row-action and dialog handlers into a new module in the same directory.
- `web/src/plugins/scripts/ScriptRows.tsx` (new): renders one row per runscript, numbered `N)` as the schedules rows number theirs, with its name and the clock marker. Each row carries the button role, a tab index of minus one, an `aria-selected` state, the class `scripts-row` plus `selected` when it is highlighted, and a `data-index` attribute. A click selects the row and a double-click opens it, both through callbacks passed in from `ScriptsTab.tsx`. The action column is added in `07`, and this file has room for it.
- `web/src/plugins/scripts/scripts-keys.ts` (new): a pure module that imports nothing. Its key function maps a key name to one of four answers: `move` for ArrowUp, ArrowDown, Home, and End; `open` for Enter; `delete` for Delete and Backspace; or nothing for any other key. Its lookup function returns the index of a selected name in the rows, or nothing when the name is absent or the list is empty. It does not render.
- `web/src/plugins/scripts/scripts.css` (new): row, header, empty-state, and clock-marker rules, using the shared plugin look. Copy the rules for the header, its buttons and their hover, the empty state, the row hover and selected states, and the number column from `web/src/plugins/schedules/schedules.css`, renamed with the `scripts-` prefix. The `.plugin-actions` span is styled by `web/src/plugins/shared.css`, which the entry imports. Rows are flex lines, not the schedules subgrid, because the tab has one name column and the marker. The clock marker is class `scripts-clock`, muted like the schedules spec column.

## Tests

- In `web/src/plugins/scripts/index.test.tsx` (new): the default export is `ScriptsTab`, and `isPayload` is the same function as `isScriptsPayload` from the shared contract. The file checks one valid payload and the four rejected shapes, `null`, an array, a missing `rows`, and a malformed row, so a broken re-export fails here. `05`'s `shared.test.ts` covers the guard in full.
- In `web/src/plugins/scripts/ScriptsTab.test.tsx` (new), with a fake built the way `makeCapabilities` in `web/src/plugins/schedules/SchedulesTab.test.tsx` builds it, including `dock: null` and an `intent` `vi.fn` spy. The `beforeEach` stubs `Element.prototype.scrollIntoView`, as that file does, because jsdom does not implement it:
  - The rows render in the order the payload gives, with the names shown.
  - An empty payload shows `No runscripts yet. Press + to create one.`, the `+` button, and no list.
  - The `+` button has the label `New script`, and a click sends `create` with `{}`. The host's split control renders in the metadata row when one is supplied.
  - A single click selects a row and sends nothing.
  - A double-click on a row sends `open` with `{ name }` for that row.
  - Enter on the selected row sends `open` with its name. Enter with no selection, or with a selected name a rerender removed, sends nothing.
  - ArrowDown and ArrowUp move the selection by one row and stop at the ends. Home and End jump to the first and last rows. With no selection, the first ArrowDown selects the second row.
  - Delete and Backspace send nothing and leave the selection in place.
  - When a rerender inserts a row above the selected name, the highlight stays on the same name.
  - When the selected name is removed by a rerender, nothing is highlighted, and a row that returns under that name is highlighted again.
  - The clock marker appears for a row with `schedules` of 1 or more, found by its title `Used by a system schedule`, and is absent for a row with `schedules` of 0.
- In `web/src/plugins/scripts/scripts-keys.test.ts` (new): the key meaning for Up, Down, Home, End (`move`), Enter (`open`), Delete and Backspace (`delete`), and other keys (none), and the name-to-index lookup for present, absent, and empty lists.

## Verification

Run `./scripts/run.mjs check-diff`. The client plugin is not registered yet, so the running app does not change, and the manual walk of the tab cannot happen until `08` registers it. The manual check is the two-project walk in `10`. For `06`, the check is `check-diff` plus a grep of every file in `web/src/plugins/scripts/`, test files included, for `../schedules`, `../../`, and any `@shared` import other than `@shared/plugins/scripts/shared`. Lint rejects the first two only in non-test files, so the grep is what covers the tests.

## Out of scope

- The action column, the Run, Duplicate, and Delete buttons, the delete dialog, and what Delete and Backspace do with a selected row, including the selection move after a delete. Those are in `07`.
- Registry and loader entries. Those are in `08`.
- Docking, the dock-cycle control, and the compact layout.
- Rename, edit from a row, and scheduling from the tab.
