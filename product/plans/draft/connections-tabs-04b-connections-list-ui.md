# Connections list tab UI

**Complexity: 4/10** — this slice renders and controls one mixed-kind list using the server plugin contract from 04a.

## Goal

Deliver the lazy client entry and the interactive singleton Connections list. Show the authoritative cross-kind rows, support keyboard and two-click opening, and expose the correct live close, tracked ACP close, and closed-record delete controls.

## Dependencies and sequence

- The source of truth is `product/plans/ready/connections-tabs.md`, especially requirements 1–2, 7–8, 11–19, 21–26, 33–36 and implementation change 4. 04a/04b/04c only allocate that scope.
- Depends on 04a, `product/plans/draft/connections-tabs-04a-server-plugin-and-commands.md`, which provides the manifest, guards, topic model, command actions, and server-side row payload.
- Implement before 04c. 04c extends the lazy entry to render per-record payloads; it must not duplicate the list implementation. The overall order is 04a → 04b → 04c → 05 → 06 → 07.
- The entry must remain lazy. The registry may use only literal schema version data and a literal dynamic import; do not runtime-import plugin guards from the host registry.

## Decisions and reuse

- Render exactly the topic rows in host-supplied descending `orderingTimestamp` order, with deterministic kind/id tie order. Do not sort, reconstruct catalog rows, derive ownership, or manufacture activity timestamps on the client.
- Display each row's title/display text, kind, owner, and authoritative status. Live rows show `Open`; core ACP rows show `Running`, `Idle`, or `Closed`; agent rows show `Running`, `Completed`, `Failed`, or `Terminated`. Empty text is exactly `No connections yet`.
- Live row opening sends `open` with its kind/id/owner tuple and relies on host topic behavior: focus its owning tab, or do nothing for an unattributed SQLite row. A tracked ACP or agent row opens its UUID-keyed record tab. SQLite is one global row per open database; its host-provided owner/focus behavior is authoritative.
- List keyboard behavior matches conversations: Up, Down, Home, End, Enter, focus handling, and two-click opening. Copy small key/selection behavior locally; do not import from `web/src/plugins/conversations/`.
- Every live row, including monitor/editor-persona ACP, offers close through the live-row topic action. A tracked core ACP row is deduplicated into its record row and its list action closes the session. Closed ACP rows offer delete only after confirmation text exactly `Delete "<title>"?`, with Delete and Cancel. Agent record rows have no list action control.
- All list operations go through `useConnectionsController` and plugin intents. Own only ephemeral confirmation/selection state in the browser. The server topic remains authoritative for stale/racing actions.
- Reuse host `useListSelection` and `ConfirmDialog` from `web/src/plugins/api.ts`; keep feature code under `web/src/plugins/connections/`, use direct imports, and no barrels or conversations imports. Keep each implementation module below 200 counted lines by extracting focused modules.

## Exhaustive path manifest

Only these paths authorize implementation edits for 04b. `web/src/plugins/connections/index.tsx` is explicitly shared with 04c: 04b creates the lazy entry and list payload route; 04c adds the connection payload route without changing list behavior. All other paths have one owner in this sequence.

| Path | Required change |
| --- | --- |
| `web/src/plugins/registry.tsx` | Add literal client loader and literal payload schema version registration; do not statically import runtime guards or plugin entry. |
| `web/src/plugins/connections/index.tsx` (new; shared with 04c) | Lazy client entry, stylesheet imports, default plugin body, named `isPayload`, and initial list-payload rendering route. 04c adds record-payload routing. |
| `web/src/plugins/connections/ConnectionList.tsx` (new) | Empty state, stable row rendering, row title/kind/owner/status, keyboard/focus/two-click interaction, live close, tracked ACP session close, closed-record confirmation. |
| `web/src/plugins/connections/useConnectionsController.ts` (new; shared with 04c) | Adapt plugin intents/topic data for list and record interactions; keep server-owned payload state authoritative; own only ephemeral UI request/confirmation state. 04b implements list `open`, `close`, and `delete`; 04c adds record `load`, `load-older`, `cancel`, `close-session`, and `terminate` operations. |
| `web/src/plugins/connections/connection-list-keys.ts` (new) | Pure feature-local keyboard movement and two-click selection policy. |
| `web/src/plugins/connections/connections.css` (new; shared with 04c) | Feature-local list/empty-state/status/control styling. 04c adds record view styling in this same file. |
| `web/src/plugins/connections/ConnectionList.test.tsx` (new) | Empty/rendered rows/order, keyboard/open, two-click, live close, tracked ACP close, agent row without action, exact delete confirmation/cancel/delete. |
| `web/src/plugins/connections/connection-list-keys.test.ts` (new) | Boundary and movement semantics and two-click selection behavior. |
| `web/src/plugins/registry.test.tsx` | Match literal schema version with the plugin constant; assert catalog/registry parity and lazy client loading. |

## Proposed changes

1. Register the lazy client entry using only static schema data and a literal dynamic import. Create the feature-local `index.tsx` and list routing for the server's discriminated payload.
2. Implement the thin list component, controller adapters, and local pure keyboard/two-click helper. Keep rendering and actions as projections of 04a's payload and topic contract.
3. Add the scoped CSS and interaction tests. Keep record-tab component styling and rendering for 04c.
4. Build production client output and confirm connections code remains outside the entry bundle in its own lazy chunk. Reconcile changed paths with this manifest.

## Tests and verification

- Client suites: `web/src/plugins/connections/ConnectionList.test.tsx`, `connection-list-keys.test.ts`, and `web/src/plugins/registry.test.tsx`.
- Verify mixed-kind supplied order, owner/title/kind/status display, empty text, Up/Down/Home/End/Enter, focus movement, two-click semantics, live close, tracked ACP close, no agent-row control, and exact delete dialog actions.
- Verify stale requests remain server-authoritative and the client neither reconstructs status/ownership/recency nor duplicates live catalog rows.
- While implementing, run `$janissary/scripts/run.mjs check-diff`; run the production web build and inspect emitted chunks for lazy isolation.
- 04c integration acceptance confirms that adding record-tab routing did not regress list rendering or lazy loading.

## Out of scope

- Plugin/server contract, command parsing/migration, topic actions, server model, and server tests (04a).
- Record metadata/body, activity ordering and labels, ACP/agent controls in a record tab, history paging, follow-bottom, and viewport preservation (04c).
- Shell replies and popup callbacks (05); API v3/panel removal (06); specs/docs and full integration acceptance (07).
- Changes to existing conversation feature code or cross-feature imports.

## Coverage allocation

04b owns the connections-tab/list half of requirements 1–2 and 8, row display and keyboard/two-click behavior in requirement 13, live/ACP/delete row controls in requirement 14, empty text and confirmation wording in requirement 18, row titles/status rendering in requirements 16 and 21, SQLite/list row projection in requirement 23, and client integration portions of implementation decision 25. The cross-plan coverage map is in 04c.
