# Per-record connection tabs UI

**Complexity: 5/10** — this slice adds the durable record view and its controls, activity rendering, and history scrolling on top of the server and list work.

## Goal

Render each UUID-backed ACP session or agent run in its own connection tab. Show authoritative metadata and status, the correctly ordered prompt/activity/answer content, lifecycle controls, and a paged history viewport that follows active output without losing the reader's position.

## Dependencies and sequence

- The authoritative feature plan is `product/plans/ready/connections-tabs.md`, especially requirements 1–2, 7–8, 11–19, 21–26, 33–36 and implementation change 4. This plan allocates record-tab client behavior only.
- Depends on 04a (`connections-tabs-04a-server-plugin-and-commands.md`) for UUID-keyed server tabs, topic windows/actions, payload guards, intent dispatch, and deletion cleanup.
- Depends on 04b (`connections-tabs-04b-connections-list-ui.md`) for the lazy client entry, registry, controller, list interaction contract, and list styling. Implement after 04b so its `index.tsx`, controller and stylesheet are extended rather than duplicated.
- 05 shell/popup integration follows this plan and uses its record-tab opener. 06 follows 05; 07 follows all 01–06.
- Completed 02 resolves Cancel behavior: do not show Idle until both cancellation send and original provider turn have drained; do not permit a replacement prompt during drain. Topic status is authoritative.
- Completed 03 owns `orderingTimestamp`: use the topic's ordering, not a per-connection timestamp. Record windows are server-owned and load the newest 20 blocks first.

## Decisions and reuse

- A record tab shows title, model, copied owning-tab name, status, start/end times, and only controls appropriate to the current record kind/status. A closed ACP record is readable and uses its captured owner name even if its tab is gone.
- Render blocks oldest to newest within the currently loaded window: prompt; ordered activity entries labelled exactly `message`, `thought`, `tool`, `plan`, or `permission`; then rendered final answer when present. Thought and tool entries start collapsed. Use host `renderMarkdown`; do not import conversations UI.
- Follow new output while active. Start with the newest 20 blocks and position at the bottom. When the user reaches the top, request another 20-block window and preserve the viewport while older blocks arrive. Copy/adapt the conversations scroll pattern locally.
- ACP control rules: `Cancel` appears only while Running; `Close session` is offered for an open ACP session. Cancel does not optimistically change status or allow a replacement prompt during drain. Closed records are read-only; no prompt input or session reopening.
- Agent control rules: show only `Terminate` while Running. Disable it immediately after sending the intent and keep it disabled until topic data reports a terminal status. Topic data exposes durable record status, not intermediate `Cleaning up`; do not invent that status. Terminal records have no live control.
- The topic/server remains authoritative when controls become stale or race a status transition. Client state is limited to intent-in-flight and scroll/viewport state; it never derives outcomes from tab state.
- Use the existing published `ConfirmDialog`, `renderMarkdown`, and `useListSelection` helpers as applicable. Keep pure helpers, hook, view component, styles and tests in `web/src/plugins/connections/`; direct imports only, no conversations-feature imports, and all source modules below 200 counted lines.

## Exhaustive path manifest

Only the following paths authorize implementation changes for 04c. Three paths are explicitly shared with 04b: this slice extends their existing responsibilities without replacing list behavior. No server changes or work assigned to 05–07 is authorized here.

| Path | Required change |
| --- | --- |
| `web/src/plugins/connections/index.tsx` (shared with 04b) | Add route for `{ kind: 'connection', record }` to `ConnectionTab`; preserve existing list route and named guard. |
| `web/src/plugins/connections/ConnectionTab.tsx` (new) | Metadata, ordered prompt blocks and activity labels, rendered answers, status-gated controls, collapsed thought/tool entries, and history-scroll event wiring. |
| `web/src/plugins/connections/useConnectionsController.ts` (shared with 04b) | Add record intents/topic updates, `load`/`loadOlder`, cancel/close-session/terminate intent wiring and in-flight Terminate state without duplicating server record/window data. List `open`/`close`/`delete` remain 04b-owned. |
| `web/src/plugins/connections/useConnectionHistoryScroll.ts` (new) | Follow-bottom behavior, top-page trigger, and viewport restoration after older blocks arrive. |
| `web/src/plugins/connections/connections.css` (shared with 04b) | Add record metadata, prompt/activity/answer blocks, collapsed entries, controls, and scroll-region styles; retain list styles. |
| `web/src/plugins/connections/ConnectionTab.test.tsx` (new) | Metadata/status, ACP Cancel/Close session gating, agent Terminate and disable-until-terminal behavior, activity labels/order, answer rendering, closed read-only state, collapsed thought/tool entries, agent task presentation. |
| `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` (new) | Initial newest position, follow active output, stop after user scroll, top paging, viewport preservation after older blocks. |

## Proposed changes

1. Add record payload routing to the existing client entry and adapt the existing controller with typed record intents and topic responses. Do not change the list route or duplicate payload state.
2. Add the record tab component as a thin projection. Keep formatting/presentation rules in focused pure helpers if needed, and keep scroll coordination in its hook.
3. Implement status-gated ACP and agent controls, markdown answers, chronological content, collapsed thought/tool entries, and server-owned 20-block paging.
4. Add behavior and viewport tests, then run diff-scoped verification and the production build/chunk check. Reconcile the final diff against this manifest and confirm list behavior remains intact.

## Tests and verification

- Client suites: `web/src/plugins/connections/ConnectionTab.test.tsx` and `useConnectionHistoryScroll.test.tsx`, plus 04b's list and registry suites as integration coverage.
- Verify metadata and status for ACP and agent records; ACP Cancel only while Running, Close session for open sessions, closed read-only behavior; only running agents show Terminate; Terminate disables at send and stays disabled until terminal topic status.
- Verify prompt/activity/answer chronology, all five exact activity labels, rendered answer content, collapsed thought/tool entries, one logical agent task block, newest 20-block initial window, active follow-bottom, stop-following on user scroll, request older blocks at top, and viewport preservation.
- Exercise record deletion/disappearance, absent-but-not-deleted window state, stale controls, owner-tab closure, and topic updates. Assert view values come from the payload rather than client reconstruction.
- Implementing code runs `$janissary/scripts/run.mjs check-diff`; run production web build and verify the plugin remains in a separate lazy chunk. Manually open live ACP and agent records, inspect status/control behavior, page older history, close/reopen ACP read-only, and delete a closed record only after the exact confirmation.
- Acceptance: the record UI integrates with 04a's UUID lifecycle and 04b's lazy entry/list; every control maps to a topic action and every rendered status/window remains host-owned.

## Out of scope

- Server plugin, command parser/migration, topic actions, record tab model, or server tests (04a).
- Connections-list rendering, list keyboard/selection behavior, and list controls (04b).
- Shell asynchronous replies and popup row callback (05); API v3/response-panel removal (06); feature specs/docs and final whole-feature acceptance (07).
- Reopening closed ACP sessions, prompt input in record tabs, deriving intermediate agent cleanup status, or non-ACP connection history.

## Coverage map for the replacement 04 plans

The three replacement plans retain the complete scope ledger of the removed `connections-tabs-04-plugin-and-tabs.md`. Each behavior is owned once; shared paths are named above and share only the integration seam, not duplicate implementation responsibility.

| Source scope | Owner |
| --- | --- |
| Requirements 1–2: plugin and the two tab surfaces | 04a owns server/plugin contract and tab lifecycle; 04b owns the list surface; 04c owns per-record UI. |
| Requirement 7: command ownership, grammar, list output, close notifications/completion, dock/centre behavior | 04a. Popup callback remains 05. |
| Requirement 8: full cross-kind list, live versus persistent row projection | 04a owns topic/row payload; 04b renders the list; 04c renders record rows' opened tabs. |
| Requirement 11: ACP Cancel/Close session and closed read-only state | 04c UI; ACP lifecycle implementation already belongs to completed 02/03. |
| Requirement 12: closed-row deletion and retention | 04b delete control; persistence/retention already belongs to completed 01/03. |
| Requirement 13: ordering, row fields, keyboard and two-click opening | 04a preserves topic order/ownership; 04b renders and handles list interaction. |
| Requirement 14: close/open/delete row actions | 04a topic action contract and validation; 04b list actions; ACP lifecycle remains completed 02/03. |
| Requirement 15: singular lookup grammar and lookup precedence | 04a. |
| Requirement 16: list/record titles and live text | 04a supplies authoritative values; 04b renders list values; 04c renders record metadata. |
| Requirement 17: agent runs represented and opened by record UUID | 04a carries record identity; 04b renders row; 04c renders its record tab. Agent lifecycle is completed 01–03. |
| Requirement 18: empty message and exact delete confirmation | 04b. |
| Requirement 19: record metadata/content/labels/collapsed entries/follow-bottom | 04c. |
| Requirement 21: authoritative statuses | 04a payload/action model; 04b list display; 04c record display and control gates. Recovery/lifecycle is completed 01–03. |
| Requirement 22: agent Terminate control | 04c. Server cleanup is completed 01–03; topic action contract is completed 03. |
| Requirement 23: SQLite global row/focus and SSH owner | 04a topic values; 04b row display/action. Attribution behavior is completed 03. |
| Requirement 24: captured owner and 20-block history paging | 04a record-tab payload/window lifecycle; 04c record rendering and viewport. Record capture is completed 01–02. |
| Implementation decisions 25–26: bundled plugin, command migration, topic actions, `closeCommand` | 04a. |
| Implementation decision 33: catalog rows and tracked ACP deduplication | Completed 03 supplies topic semantics; 04a preserves contract; 04b renders the exact rows. |
| Implementation decision 34: SQLite focus target | Completed 03 supplies topic semantics; 04a preserves it; 04b emits open intent. |
| Implementation decision 35: agent popup row `recordId`, no `acpRef`/snapshot | 05. The record UUID target and opening are provided by 04a/04c. |
| Implementation decision 36: shared plural/singular grammar | 04a. |
| Removed 04 manifest and suites | 04a owns all server/plugin/parser/topic/command/completion paths; 04b owns registry/list client paths; 04c owns record UI/history paths. Paths shared by 04b/04c: `index.tsx`, `useConnectionsController.ts`, `connections.css`, each with explicit extension ownership. |

## Later-plan dependency sequence

| Order | Plan | Dependencies |
| --- | --- | --- |
| 04a | `connections-tabs-04a-server-plugin-and-commands.md` | Complete 01–03 |
| 04b | `connections-tabs-04b-connections-list-ui.md` | 04a |
| 04c | `connections-tabs-04c-connection-record-tabs-ui.md` | 04a and 04b |
| 05 | `connections-tabs-05-shell-and-popup-integration.md` | Complete 02 and 04c; no dependency on 06 |
| 06 | `connections-tabs-06-plugin-api-v3-panel-removal.md` | 05 |
| 07 | `connections-tabs-07-specs-docs-integration.md` | Complete 01–06 |

Every implementation subplan in this ordered feature sequence is rated 1–5. The source feature plan remains authoritative at its original 8/10 rating.
