# Connections table columns

Issue: connections table should have a header row, like sessions table. Table should be organized Host, Tab, Connection Name, Connection State, Last activity, actions mirroring the sessions table. Close button should be a close icon in the actions column just like in sessions table.

Complexity: 5/10

## Goal

The connections tab lists its rows as unlabeled cells — title, kind, owning tab, status — with a text **Close** or **Delete** button tacked on the end. The sessions tab, its sibling, reads as a table: a heading row names each column, every row lines its cells up under those names, and the per-row controls are icon buttons in a trailing actions column. Give the connections list the same shape with the columns the issue names: Host, Tab, Connection Name, Connection State, Last activity, and an unlabeled actions column holding a close icon (and the delete icon a closed ACP record already offers).

## Approach

The Host column needs data no row carries today. Per architecture principle 1 the server computes it and ships it on the row; the client only renders it.

- `src/protocol/connections.ts`: both topic row shapes gain a required `host: string`.
- `src/plugins/connections-topic-rows.ts` fills it:
  - a live row takes its owning tab's host: a remote tab's bare host (`tab.remote.host`), an ssh harness tab's bare destination host (`bareHost` from `src/remote/address.ts`), otherwise `Local` — the word the agent monitor already uses for a local run;
  - a SQLite row is always `Local`, because databases are opened by the local server;
  - a durable record row uses the host captured on the record, or `Local` when none was captured.
- Records outlive their tab, so the host is captured at record creation rather than looked up from the owning tab later (a closed remote tab would otherwise read as local). `src/acp-records/types.ts` adds an optional `host` to the record source and to `AcpRecordRow`; absent means local. `src/acp-records/validation.ts` accepts an absent host or a nonempty string. `src/acp-records/model.ts` copies a present host onto the row, the way it copies an agent's `runId`.
  - `src/acp/session-manager.ts` sets `host` on a core ACP record source when the tab is remote (its session runs on the remote host over the tab's channel).
  - `src/agent/manager.ts` sets `host` on an agent record from `executionHost` when the run executes remotely; `src/agent/record-feed.ts` lets the optional field through its metadata check.
- `src/plugins/connections/shared.ts`: `ConnectionRowBase` gains a required `host: string`, and `isConnectionRow` requires it to be a string.
- Promote `relativeActivity` from `web/src/plugins/sessions/sessions-keys.ts` to `web/src/shared/relative-activity.ts` and publish it through `web/src/plugins/api.ts`: the connections plugin is its second consumer and cannot import the sessions feature. The sessions plugin imports it from `../api`. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
- `web/src/plugins/connections/ConnectionList.tsx` renders a `connections-columns` heading row (`aria-hidden`, shown only when there are rows, like the sessions table) and each row's cells in the order Host, Tab, Connection Name, Connection State, Last activity, actions. Last activity is the row's ordering timestamp in the sessions table's relative form, computed by a pure `connectionActivity` helper in `connection-list-keys.ts`; a timestamp of zero (no activity known) renders empty. The kind moves out of its own column into the row's tooltip, as the sessions table keeps its type in the tooltip of its narrow rendering.
- New `web/src/plugins/connections/ConnectionRowActions.tsx` renders the actions cell: a `faCircleXmark` icon button labelled `Close <title>` for a closable row and a `faTrash` icon button labelled `Delete <title>` for a closed ACP record — the same glyphs the sessions table uses for close and forget. The row-closability rule moves with it. Keeping it in its own module holds `ConnectionList.tsx` under the 200-line limit.
- `web/src/plugins/connections/connections.css`: a shared grid template for the heading and the rows so each label sits over its column, with the sessions table's column muting and icon-button styling.

## Implementation steps

1. Server data: protocol row types, ACP record source/row host, record creation sites, topic row composition, plugin shared contract and guard. Update the server fixtures that build rows.
2. Promote `relativeActivity` to `web/src/shared/relative-activity.ts`, publish it in `web/src/plugins/api.ts`, repoint the sessions plugin, and move its tests.
3. Client: `ConnectionRowActions.tsx`, the heading row and new cell order in `ConnectionList.tsx`, and the stylesheet. Update client fixtures with `host`.

## Tests

- `src/plugins/connections-topic-rows.test.ts`: a live row on a remote tab carries the remote host; an ssh harness tab's row carries the bare destination host; a local tab's row and every SQLite row read `Local`; a record row carries its captured host, and one without reads `Local`.
- `src/acp-records/model.test.ts`: a source with a nonempty host round-trips onto the row and a local one has none; `isRecordSource` refuses an empty or non-string host.
- `src/acp/record-feed.test.ts` and `src/agent/manager.test.ts`: a remote tab's core ACP record and a remote agent run record carry the host; local ones carry none.
- `web/src/plugins/connections/connection-list-keys.test.ts`: `connectionActivity` renders relative age with an ISO stamp, and nothing for a zero timestamp.
- `src/plugins/connections/shared.test.ts`: a row without a string `host` is rejected.
- `web/src/shared/relative-activity.test.ts`: the moved relative-activity cases.
- `web/src/plugins/connections/ConnectionList.test.tsx`: the heading row names Host, Tab, Connection Name, Connection State, Last activity in order and is absent when the list is empty; each row renders host, owner, title, status, and relative activity in that order; a zero timestamp renders an empty activity cell; the kind is in the row tooltip; Close and Delete are icon buttons in the actions cell with their accessible labels.
- `web/src/plugins/connections/connections-style.test.ts`: the heading and rows share one grid template.

## Spec

`product/specs/connections-tab.md`: describe the heading row, column order, Host values, Last activity, the kind in the tooltip, and the icon controls. `product/specs/acp-records.md`: records capture the host of a remote session or run.

## Docs

`documentation/user-documentation/command-bar/connections.md` already describes what each row shows, so its connections-tab section is updated to the new columns and icon controls.

## Out of scope

- The tab titles, the metadata row with refresh and split actions, and the sessions tab's row styling and keyboard interactions — each is its own backlog entry.
- A two-line docked rendering like the sessions tab's narrow layout.
- Showing the host anywhere besides the list row, such as the connection tab's metadata.
