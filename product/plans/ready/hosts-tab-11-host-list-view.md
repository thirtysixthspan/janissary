# Build the Hosts list and its shared read contract

**Complexity: 5/10** — ~198 added production lines, 10 requirements and 17 test scenarios (p=5.544)

## Goal

Build and test the Hosts table against server snapshots while its production entry is still unregistered. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-1-catalog-values.md`.

## Implementation

In import-free `src/plugins/hosts/shared.ts`, declare `HOSTS_PAYLOAD_SCHEMA_VERSION` as `1`. Use `HostsPayload` with an effective `filePath` string and a `rows` array of `HostRow` values. Require `name`, `user`, `destination` and `path` to be strings on each row, with a nonempty name and destination. An absent user or remote path is represented by an empty string. Preserve the row order supplied by the server. Follow `isSessionsPayload` and `isEmptyIntent` in `src/plugins/sessions/shared.ts` for plain-record and array narrowing. Export `isHostsPayload`, `isRefreshIntent` (an empty object) and `isOpenIntent` (an object with a nonempty `name` string). The server will check that the named row exists when handling the open intent.

Follow `web/src/plugins/sessions/index.tsx:1` for the entry shape. `web/src/plugins/hosts/index.tsx` imports `../shared.css` and its colocated stylesheet, exports `HostList` as the default component, and re-exports `isHostsPayload` as `isPayload` via `@shared/plugins/hosts/shared`. The production registries are wired in the next plan.

In `web/src/plugins/hosts/HostList.tsx`, use `PluginActionsHeader` and the `plugin-meta` and `plugin-actions` classes as in `web/src/plugins/sessions/SessionList.tsx:77`. Place the accessible Refresh icon and `capabilities.splitAction` together at the right edge. Keep space for the later New host action between them. Give the Name, User, Destination and Path headers the same grid as the rows, with a fixed-width unlabeled actions column. In `hosts.css`, follow the left-aligned cells, 12px horizontal padding and selected-row styling in `web/src/plugins/sessions/sessions.css`. Ellipsize long cells. Display `host[:port]` in Destination and put the full `[user@]host[:port]` in each row's tooltip, with a nonempty path on the next line. Render initially available rows without a loading state. An empty payload displays `No saved hosts` without column headings and leaves the metadata actions available.

Reuse the client plugin API's `useListSelection` and `nextListSelection`. Put the mouse decision in a pure `hosts-keys.ts` based on `sessionClickSelection` in `web/src/plugins/sessions/sessions-keys.ts:8`. Require a first click even for a row highlighted on mount or by keyboard navigation. A second click opens only when the hook's confirmed index and the previously clicked row's name, connection fields and effective file still match. Keep the last clicked identity locally so a replacement, edit or reordering at the same length cannot inherit confirmation from the old row. Keyboard navigation clears confirmation through the hook. Use `data-index` for the hook's scroll handling. Up and Down stop at each end. Home and End jump to the first and last row. Enter opens the current row when focus is on the list. Escape leaves the list alone, and focused controls handle their own keys.

Follow the `wasActive` transition in `web/src/plugins/sessions/SessionList.tsx:34`. Focus the list on active mount without an extra read. Each later inactive-to-active transition focuses it and sends one `refresh` with an empty object. Refresh on click sends that same intent. Use the client API's `fireIntent` for Refresh and `open` with the selected row's `name`. Keep components and styles local to Hosts and use the published plugin API rather than importing Sessions.

## Tests and verification

In `src/plugins/hosts/shared.test.ts`, exercise good and malformed payloads, row fields, empty Refresh, and valid and invalid open targets. In `web/src/plugins/hosts/hosts-keys.test.ts`, exercise first and repeated clicks, keyboard reset and a different row or catalog at the same index. In `web/src/plugins/hosts/HostList.test.tsx`, follow the render fixture and `rerender` pattern in `web/src/plugins/sessions/SessionList.test.tsx:8` and `:249`. Cover supplied order, empty state and available header actions, tooltip assembly, click and Enter outcomes, movement at the bounds and ends, Escape, and an explicit Refresh. Assert active mount focuses without Refresh, every return refreshes once, and a same-length snapshot replacement requires a fresh click. Run `$janissary/scripts/run.mjs check-diff`. Render the unregistered component with two fixture rows, focus it, select a row, rerender with the selected row replaced at the same index, and confirm that opening the replacement takes two clicks. Switch it inactive and active and confirm one refresh.

## Out of scope

Catalog/loader registration and editing controls. The list's extension slots remain empty until editing is wired.
