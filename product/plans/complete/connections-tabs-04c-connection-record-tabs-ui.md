# Per-record connection tabs UI

**Complexity: 5/10** — this adds record presentation and status-gated actions plus a history viewport whose paging and bottom-follow behavior must coexist with the authoritative topic updates.

## Goal

Render each UUID-backed ACP session or agent run in its own connection tab. Show authoritative metadata and status, the correctly ordered prompt/activity/answer content, lifecycle controls, and a paged history viewport that follows active output without losing the reader's position.

## Dependencies and sequence

- The authoritative feature plan is `product/plans/ready/connections-tabs.md`, especially requirements 1–2, 7–8, 11–19, 21–26, 33–36 and implementation change 4. This plan allocates record-tab client behavior only.
- Depends on completed 04a (`product/plans/complete/connections-tabs-04a-server-plugin-and-commands.md`) for the UUID-keyed server tabs, topic windows/actions, payload guards, intent dispatch, and deletion cleanup.
- Depends on completed, focused-reviewed 04b (`product/plans/complete/connections-tabs-04b-connections-list-ui.md`, commit `63971b8`, no findings) for the lazy client entry, controller, list interaction contract, and list styling. Extend its `index.tsx`, controller, and stylesheet in place; preserve the list route and behavior.
- 05 shell/popup integration follows this plan and uses its record-tab opener. 06 follows 05; 07 follows all 01–06.
- Completed 02 resolves Cancel behavior: do not show Idle until both cancellation send and original provider turn have drained; do not permit a replacement prompt during drain. Topic status is authoritative.
- Completed 03 owns `orderingTimestamp`: use the topic's ordering, not a per-connection timestamp. Record windows are server-owned and load the newest 20 blocks first.

## Decisions and reuse

- Render the record row's authoritative `title`, `model`, `ownerName`, `status`, and `startedAt`/optional `endedAt` metadata; format timestamps with `new Date(timestamp).toLocaleString()` as the conversations list does at `web/src/plugins/conversations/ConversationList.tsx:78`. Do not substitute `ownerLabel` for the captured `ownerName`. ACP status is `Running`, `Idle`, or `Closed`; agent status is `Running`, `Completed`, `Failed`, or `Terminated` (`src/plugins/connections/shared.ts:3-4`, `ConnectionStatus`).
- Render `record.window.blocks` oldest to newest in the server-supplied order. Each block contains its prompt, ordered activity entries labelled exactly `message`, `thought`, `tool`, `plan`, or `permission`, then its final answer only when `answer` is present. Render only final answers with host `renderMarkdown` from `web/src/plugins/api.ts:9`; if it returns `undefined`, render the source text. Activity text remains plain text. Thought and tool entries start collapsed; other entry kinds start expanded. Use `<details>` locally rather than importing conversations UI.
- The 04a protocol is `ConnectionsTopicRecordRow.window?: AcpRecordWindow`, whose window has `blocks`, `totalBlocks`, `offset`, and `hasOlder` (`src/protocol/connections.ts:22-38`; `src/acp-records/types.ts:56-62`). The server opens a record with `load` and its newest 20 blocks, and refreshes its tab from topic notifications; 04c must not add a client `load` intent. If a record row is present without a window, show `Loading connection history…`, not a deleted or failed-record state. If the record disappears, 04a closes its owning tab; do not reconstruct it or render a client-side tombstone. The current protocol has no history-load error field, so do not invent one.
- Follow new output only while the tab is active and the reader is within the host's existing 40px bottom-follow threshold (`useStickToBottom` in `web/src/plugins/conversations/useStickToBottom.ts:10-35`). Copy/adapt that behavior locally, importing `isWithinBottomFollowThreshold` through the published `web/src/plugins/api.ts:2` surface; its implementation is `web/src/shared/scroll-follow.ts:5-10`. Start at the newest content. At the top, request `load-older` only when the current window has `hasOlder`; request at most once per `offset` until a topic update changes it. When older blocks arrive, preserve the viewport by adding the scroll-height delta to the prior `scrollTop`; this restoration takes precedence over bottom-follow for that update. Keep this behavior in a connections-local hook.
- ACP controls: show `Cancel` only while `Running` and `Close session` while status is `Running` or `Idle` (the host accepts both in `src/plugins/connections-topic-actions.ts:63-70`). Neither control changes displayed status optimistically. Cancel does not make the record Idle or enable a replacement prompt until topic data reports the drained status. Closed ACP records are read-only; no prompt input, session reopening, or record-tab delete control.
- Agent controls: show only `Terminate` while `Running`; hide it for `Completed`, `Failed`, and `Terminated`. Disable it immediately on intent send and keep it disabled until the topic row reports a terminal status. For any rejected control intent, clear the in-flight state and show its rejection message inline until the next action or record topic update; retain the authoritative status so the user can retry. Do not fabricate `Cleaning up`. Stale and raced intents remain host-authoritative. A rejected history-page intent also clears the page-request guard and shows its rejection inline so another top-page attempt can retry; the protocol itself carries no history error field.
- 04b's closed-row deletion remains the only destructive confirmation and already uses the published `ConfirmDialog` from `web/src/plugins/api.ts:53`; 04c adds no record-tab deletion or dialog. Use direct API imports for `renderMarkdown` and `TabPluginClientCapabilities`; `useListSelection` is list-only and remains 04b-owned. Keep the components, hook, styles, and tests under `web/src/plugins/connections/`, with no conversations-feature imports and each production source module below ESLint's 200 counted-line limit.

## Exhaustive path manifest

Only the following paths authorize implementation changes for 04c. Three paths are explicitly shared with 04b: this slice extends their existing responsibilities without replacing list behavior. No server changes or work assigned to 05–07 is authorized here.

| Path | Required change |
| --- | --- |
| `web/src/plugins/connections/index.tsx` (shared with 04b) | Add route for `{ kind: 'connection', record }` to `ConnectionTab`; preserve existing list route and named guard. |
| `web/src/plugins/connections/ConnectionTab.tsx` (new) | Metadata, ordered prompt blocks and activity labels, rendered answers, status-gated controls, collapsed thought/tool entries, and history-scroll event wiring. |
| `web/src/plugins/connections/ConnectionHistory.tsx` (new) | Render loaded prompts, activity entries, collapsed thought/tool details, and Markdown answers in supplied order; show the no-window loading state without claiming the record is absent. |
| `web/src/plugins/connections/useConnectionsController.ts` (shared with 04b) | Add record `load-older`, `cancel`, `close-session`, and `terminate` intent wiring plus intent-in-flight Terminate state. Initial `load` is server-owned by 04a; do not add it to client intents or duplicate server record/window data. List `open`/`close` remain 04b-owned. |
| `web/src/plugins/connections/useConnectionHistoryScroll.ts` (new) | Follow-bottom behavior, top-page trigger once per window offset, and scroll-height-delta restoration after older blocks arrive. |
| `web/src/plugins/connections/connections.css` (shared with 04b) | Add record metadata, prompt/activity/answer blocks, collapsed entries, controls, and scroll-region styles; retain list styles. |
| `web/src/plugins/connections/index.test.tsx` (new) | Prove the entry still renders the list payload through `ConnectionList` and routes a record payload to `ConnectionTab`; keep the entry guard/lazy-loader contract covered by the existing registry suite. |
| `web/src/plugins/connections/ConnectionTab.test.tsx` (new) | Metadata/timestamps and captured owner; ACP/agent status and controls; intent rejection and in-flight Terminate reset; closed read-only state; all five exact activity labels/order; rendered answer and fallback; collapsed thought/tool versus expanded other kinds; no-window loading state; unchanged list route integration. |
| `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` (new) | Initial newest position; active bottom-follow within threshold and stop after user scrolls away; inactive output and reactivation; one top-page request per offset only when `hasOlder`; rejected page intent clears the guard; viewport preservation after prepended blocks; no jump to bottom during restoration. |

## Proposed changes

1. Extend the existing client entry and controller in place: route connection payloads to `ConnectionTab`; add only the 04a-supported `load-older`, `cancel`, `close-session`, and `terminate` intents. Preserve the list route, its `open`/`close` intents, and all 04b list behavior.
2. Add `ConnectionTab` as a thin metadata/control projection and `ConnectionHistory` for the loaded record window. Keep all content and status values sourced from the row/window payload; let 04a's notifications replace them.
3. Implement the status-gated ACP/agent controls and the local history hook. Initial 20-block loading and record disappearance remain server-owned; older-page requests use `load-older` and the topic's updated `offset`/`hasOlder` values.
4. Add component, intent-state, and viewport tests; extend record styles without changing list selectors. Run diff-scoped verification and the production build/chunk check. Reconcile the final diff against this manifest and confirm list behavior and lazy loading remain intact.

## Tests and verification

- Client suites: `web/src/plugins/connections/index.test.tsx`, `ConnectionTab.test.tsx`, and `useConnectionHistoryScroll.test.tsx`, plus the existing `ConnectionList.test.tsx`, `connection-list-keys.test.ts`, `connections-style.test.ts`, and `web/src/plugins/registry.test.tsx` from 04b as regression/integration coverage.
- Verify ACP status gates (`Cancel` only Running; `Close session` Running or Idle), Closed read-only rendering, agent status gates (only Running has Terminate), immediate disable while the intent is pending, clearing disable on rejected intent, and holding disable until terminal topic data arrives. Assert no client-derived status or control outcomes.
- Verify row metadata including captured owner name and optional end time; prompt/activity/answer chronology; all five exact activity labels; Markdown answer plus fallback; collapsed thought/tool and expanded message/plan/permission entries; agent title/task presentation without deriving a second task block; and rejected action/page intents clearing their pending state and exposing the rejection message.
- Verify initial server-delivered newest 20 blocks and bottom position; follow output only while active and near the bottom; stop when the user scrolls away; request older pages only at top with `hasOlder`; deduplicate a request until `offset` changes; preserve scroll position when blocks are prepended. Verify a missing window remains a loading state, while deletion/disappearance closes the tab through 04a rather than producing a client tombstone. Topic notifications replace metadata/status/window values without client reconstruction.
- Implementing code runs `$janissary/scripts/run.mjs check-diff`; run the production web build and verify the plugin remains in its separate lazy chunk. Manually open live ACP and agent records, inspect status/control behavior, page older history, and close an ACP session to verify its tab becomes readable and read-only. Verify the 04b list still renders and behaves unchanged.
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
