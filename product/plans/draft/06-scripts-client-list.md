# Scripts tab client list
**Complexity: 3/10** — a list tab modeled on the schedules tab, with the rows, the metadata-row `+` button, the clock marker, keyboard movement, and the create and open intents; the action column and dialog come later.

## Goal

Create `web/src/plugins/scripts/` with the entry, the tab component, the row list, the pure key handling, and the stylesheet. The tab shows the rows, moves a selection with the keyboard, shows the empty state, and sends `create` and `open`.

## Design decisions and dependencies

This subplan depends on `05-scripts-plugin-server` for the shared contract at `@shared/plugins/scripts/shared`, which holds the payload type and the guard.

- The entry `index.tsx` default-exports the tab component and named-exports `isPayload` from the shared contract. It is shaped like `web/src/plugins/schedules/index.tsx` and imports `./scripts.css`.
- Lint permits this directory to import only `../api`, `../shared.css`, and `@shared/plugins/scripts/shared`, plus packages such as FontAwesome. An import of `../schedules/...` fails lint, which is how the source plan's "one feature does not import another" rule is enforced.
- The keyboard movement uses `nextListSelection` from `../api`. It is the rule every plugin list shares, and the schedules keys module already re-exports it from there. Importing it from `../api` does not import another feature. The source plan asked for the key handling to be "written separately". This subplan keeps that for the Enter and Delete mapping and the scroll rule, and reuses the shared movement rule.
- Selection is held as the selected runscript's name, not as an index. The tick can add or remove rows at any moment. An index would move the highlight onto a different script when a row appears above it. The source plan does not say which to use, so this is a decision made here. Each render finds the selected name's position in the current rows. If the name is no longer present, nothing is highlighted.
- Up, Down, Home, and End move the selection through `nextListSelection`, which does not wrap. The selected row scrolls into view, as the schedules tab does.
- Enter on the selected row and a double-click on any row send `open` with the row's name. A single click only selects. Neither changes tabs.
- The `+` button is in the metadata row, built from `PluginActionsHeader`. Its icon is `newTabIcon` from `../api`, its label and tooltip are `New script`, and a click sends `create` with an empty payload.
- The clock marker follows the name. It uses `scheduleWindowIcon` from `../api` and renders only when `schedules` is above zero. Its tooltip is `Used by a system schedule`. It appears and disappears as the server's count changes.
- The empty state reads `No runscripts yet. Press + to create one.` and the tab stays open.
- The tab is centre-only. It has no dock header, no compact layout, and no reading of `capabilities.dock`.
- Rows, counts, and open flags come from the payload. The component decides nothing about them.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Schedules tab entry and component | `web/src/plugins/schedules/index.tsx`, `SchedulesTab.tsx` | Pattern for the entry, the keyboard handling, and the scroll effect. Not imported. |
| Shared plugin client API | `web/src/plugins/api.ts` (`PluginActionsHeader`, `newTabIcon`, `scheduleWindowIcon`, `nextListSelection`, `TabPluginClientCapabilities`) | Imported for the header, the icons, the movement rule, and the capability type. |
| Schedules keys module | `web/src/plugins/schedules/schedules-keys.ts` | Pattern only. It shows the shared movement rule re-exported from `../api`. |
| Client module shape | `web/src/plugins/registry.tsx` (`ClientPluginModule`) | The entry must satisfy it: a default component and a guard named `isPayload`. |
| Shared contract | `src/plugins/scripts/shared.ts` (from `05`) | Imported through `@shared/plugins/scripts/shared`. |
| Stylesheet precedent | `web/src/plugins/schedules/schedules.css` | Pattern for the row and header rules. |

## Proposed changes

- `web/src/plugins/scripts/index.tsx` (new): default-export `ScriptsTab` from `./ScriptsTab`, named-export `isPayload` from the shared contract, and import `./scripts.css`.
- `web/src/plugins/scripts/ScriptsTab.tsx` (new): renders the metadata row with the `+` button, the empty state or the list, and the keyboard handler. It holds the selected name in view state, scrolls the selected row into view, and sends the `create` and `open` intents.
- `web/src/plugins/scripts/ScriptRows.tsx` (new): renders one row per runscript with its position number, its name, and the clock marker. The action column is added in `07`, and this file has room for it.
- `web/src/plugins/scripts/scripts-keys.ts` (new): a pure module with the function that maps a key to the movement or action it means, and a function that finds the index of a selected name in the rows. It does not render.
- `web/src/plugins/scripts/scripts.css` (new): row, header, empty-state, and clock-marker rules, using the shared plugin look.

## Tests

- In `web/src/plugins/scripts/index.test.tsx` (new): the default export is a component. `isPayload` accepts a valid payload with rows, and rejects `null`, an array, a missing `rows`, and a malformed row.
- In `web/src/plugins/scripts/ScriptsTab.test.tsx` (new), with a fake `capabilities.intent` spy:
  - The rows render in the order the payload gives, with the names shown.
  - An empty payload shows `No runscripts yet. Press + to create one.` and no list.
  - The `+` button has the label `New script`, and a click sends `create` with an empty payload.
  - A single click selects a row and sends nothing.
  - A double-click on a row sends `open` with that row's name.
  - Enter on the selected row sends `open` with its name. Enter with no selection sends nothing.
  - ArrowDown and ArrowUp move the selection by one row and stop at the ends. Home and End jump to the first and last rows.
  - When a rerender inserts a row above the selected name, the highlight stays on the same name.
  - When the selected name is removed by a rerender, nothing is highlighted.
  - The clock marker appears for a row with `schedules` of 1 or more, with the tooltip `Used by a system schedule`, and is absent for a row with `schedules` of 0.
- In `web/src/plugins/scripts/scripts-keys.test.ts` (new): the key mapping for Up, Down, Home, End, Enter, Delete, and Backspace, and the name-to-index lookup for present, absent, and empty lists.

## Verification

Run `./scripts/run.mjs check-diff`. The client plugin is not registered yet, so the running app does not change. Confirm by reading the imports that nothing in `web/src/plugins/scripts/` imports from `../schedules` or from `../../`, which lint rejects.

## Out of scope

- The action column, the Run, Duplicate, and Delete buttons, and the delete dialog. Those are in `07`.
- Registry and loader entries. Those are in `08`.
- Docking, the dock-cycle control, and the compact layout.
- Rename, edit from a row, and scheduling from the tab.
