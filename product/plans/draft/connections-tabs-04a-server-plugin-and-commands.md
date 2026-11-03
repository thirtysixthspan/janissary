# Connections server plugin and command migration

**Complexity: 5/10** — this slice establishes the plugin contract, migrates the command, and wires the host-side tab model and actions. The interactive client surfaces are deliberately sequenced afterward.

## Goal

Create the server and shared-contract foundation for the bundled `connections` tab plugin. Move command ownership out of core without changing observable list/close behavior, expose validated topic actions, and make list and UUID-keyed record tabs available to the client slices that follow.

## Dependencies and sequence

- The authoritative scope and decisions are `product/plans/ready/connections-tabs.md`, especially requirements 1–2, 7–8, 11–19, 21–26, 33–36 and implementation change 4. The requirements named here are an allocation, not a change to that source plan.
- Depends on completed plans 01–03: `product/plans/complete/connections-tabs-01-records.md`, `connections-tabs-02-acp-feeds-cancel.md`, and `connections-tabs-03-topic-catalog-actions.md`.
- Implement before 04b and 04c. 04b consumes this command, payload, topic-action, and list-tab contract. 04c consumes the UUID record-tab lifecycle built here and follows 04b for integration into the client entry.
- The later sequence remains 05 shell/popup integration after 04c, 06 API v3/panel removal after 05, and 07 specs/docs/integration after 01–06.
- Preserve branch repairs and implemented contracts from 01–03: `managers.acpRecords`, UUID record IDs on tab runtime/run, cancellation draining both send and provider-turn boundaries, `AgentRunManager.finish`, shared `ConnectionsTopicData`, validated synchronous topic actions, and existing topic ordering/catalog behavior. Do not reopen their schemas, ownership, cancellation, sqlite attribution, or action semantics.

## Decisions and reuse

- The static manifest claims plural `connections`, alias `connection`, and topic `connections`. Request only `openOrFocusTab`, `updateTab`, `closeOwnTab`, `dockTab`, `topicData`, `topicAction`, `originTab`, `note`, `rejectRequest`, and `reportFailure`. `note` carries legacy list output and parser errors to the invoking tab; `closeOwnTab` closes an open record tab deleted elsewhere. Plugin code never receives or imports `Managers`.
- Preserve the additive `closeCommand` topic action. Existing validated UI `close` remains a stale-row no-op. `closeCommand` takes invoking label, kind, and id and starts `ConnectionManager.closeTarget` without awaiting, preserving missing-target and browser-async notifications.
- Singular lookup order is fixed: UUID record ID; `acp:<provider/model>` against the invoking tab's current tracked core ACP record by `ownerLabel` and `model`; exact live row ID, focusing its topic-supplied owner; then newest case-insensitive ACP record title. Topic-deduplicated tracked ACP rows must not be synthesized as live rows.
- Keep one import-free payload union in `shared.ts`: `{ kind: 'list', rows }` contains only current topic rows; `{ kind: 'connection', record }` contains one UUID record and its optional topic-provided window. Guards validate discriminants and every client-consumed field. Client intents are `open`, `close`, `cancel`, `close-session`, `terminate`, `delete`, and `load-older`; validate exact fields and translate them to topic actions or the plugin tab model. These names stay inside the plugin.
- Command/subcommand tokens are case-insensitive; trim surrounding whitespace. Bare `connections` and `connection` open/focus the singleton list in centre, returning a docked list to centre. Plural `connections left|right` docks it, using published `parseDockArgument`; docking forms belong only to the plural name. Both names support `list` and `close`.
- Preserve `listLines` output exactly, including `No open connections.`. Preserve `connections close <kind>:<id>` and alias behavior, existing parser target rules, and exact errors: `Usage: connections close <kind>:<id>`, `Invalid connection "<target>". Expected <kind>:<id>, e.g. sqlite:mydb.`, `Unknown connection kind "<kind>". Expected one of: sqlite, shell, acp, browser, ssh, terminal.`, and `Missing id in "<target>".`. Return validation errors through `note`, not plugin failure. Keep completion on `connections close` only. Plural first arguments other than `list`, `close`, `left`, or `right` use singular lookup. `connection <text>` first parses the full trimmed text as kind/id; unmatched title rejection is exactly `No connection matching "<text>".` Bare plural no longer prints the old usage line.
- Delegate list and close through topic actions; do not duplicate catalog or close logic. `list` passes `originTab()` to the existing host `listLines` projection and excludes durable rows. UI live-row close uses validated `close`; command close uses `closeCommand`. Leave `connectionsFor`, `completionConnections`, and `closeTarget` intact; remove only `ConnectionManager.run` and its command-only parser dependency.
- The list instance key is `connections`; record keys are stable UUIDs. Preserve plugin id and label prefix `connections`. Record tabs load the newest 20-block window and load older windows through topic actions. No plugin-local copy of server record/window state is authoritative.
- If a record disappears from topic rows after deletion, close its open tab through `closeOwnTab` and release ephemeral state. A present record with no window remains open and requests/updates a window; absence means deletion.
- Render and relay exact topic rows and statuses. The shared host topic owns flat descending `orderingTimestamp` order and deterministic kind/id ties. Never synthesize timestamps, another catalog, or client-derived statuses. Statuses are `Open` for live rows; `Running`, `Idle`, or `Closed` for core ACP; `Running`, `Completed`, `Failed`, or `Terminated` for agent records.
- ACP Cancel stays Running until send and original provider turn drain; no optimistic Idle state or replacement prompt during drain. The UI will expose topic status in 04c.
- Reuse `src/plugins/conversations/` patterns for manifest/activation/tab lifecycle, `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, command adapter and completion, and published topic types. Reuse `connectionCatalog`, `listLines`, `ConnectionManager.closeTarget`, parser kind/error behavior, and completed records/feed/topic APIs. Avoid concrete imports across plugin boundaries; use published `../api.js` types and the capabilities above.

## Exhaustive path manifest

Only the following paths are implementation scope for 04a. Paths in the reuse list are read-only unless listed here. No popup/shell work, client UI, API-v3 work, or docs/spec edits are authorized here.

| Path | Required change |
| --- | --- |
| `src/plugins/connections/manifest.ts` (new) | Static id/version/schema, `connections` label prefix, command plus alias, topic, and exact capabilities. |
| `src/plugins/connections/shared.ts` (new) | Import-free schema version; list/record payload and intent types; complete guards rejecting null, arrays, malformed nested values, and invalid statuses/actions. |
| `src/plugins/connections/parse.ts` (new) | Pure grammar, six local kind names, legacy close errors, trimming/case rules, and parsed discriminants. |
| `src/plugins/connections/tabs.ts` (new) | `ConnectionsTabs` model for singleton list and UUID record tabs; load/open; validation of host topic data; notification updates for open keys; deletion cleanup and disposal. |
| `src/plugins/connections/activate.ts` (new) | Command/alias routing, singleton centre/dock behavior, record id/title/live-row resolution, topic notifications and `updateTab`, intent validation/dispatch, graceful rejection, and no-op opener. Extract focused helpers if approaching 200 counted lines. |
| `src/plugins/connections/activate.test.ts` (new) | Activation and capability fixtures; command routing/output/rejection; lookup precedence and title ordering; owner opening; singleton docking; updates/deletion cleanup/disposal. |
| `src/plugins/connections/parse.test.ts` (new) | Bare/dock/list/close/lookup forms, alias/subcommand case, six kinds, malformed and empty target cases, exact messages, whitespace, ignored trailing tokens. |
| `src/plugins/connections/shared.test.ts` (new) | Schema/version, payload and nested-window/entry guards, statuses/actions, invalid JSON values, missing/invalid required fields. |
| `src/plugins/catalog.ts` | Register `connectionsManifest` in production catalog. |
| `src/plugins/loaders.ts` | Add literal lazy server import for `connections/activate.js`. |
| `src/plugins/loaders.test.ts` | Assert catalog/loader id parity and connections activation loader. |
| `src/plugins/host.test.ts` | Assert production catalog parity, both command claims, and that `tasks` remains core-owned. |
| `src/plugins/api-topics-connections.ts` | Add typed command-only `closeCommand` action carrying invoking label, kind, and id; keep existing UI `close` unchanged. |
| `src/plugins/connections-topic-actions.ts` | Start `managers.connection.closeTarget(kind, id, label)` for `closeCommand` without awaiting. |
| `src/plugins/connections-topic.test.ts` | Cover `closeCommand` per kind, missing targets, messages, label and async browser behavior; preserve stale UI `close` no-op tests. |
| `src/plugins/adapters.test.ts` | Assert `connections` and `connection` resolve through the real adapter without colliding with retained core commands. |
| `src/commands/connections.ts` | Delete the core command. |
| `src/commands/index.ts` | Remove only the core `connections` registry entry; keep `tasks` and unrelated commands. |
| `src/connection/manager.ts` | Remove command-only `run` and command/output imports; retain `connectionsFor`, `completionConnections`, `closeTarget`, and notification behavior. |
| `src/connection/parsing.ts` | Delete after its grammar and errors move to plugin parser. |
| `src/connections.test.ts` | Remove parser-only suite after equivalent plugin parser coverage exists. |
| `src/commands/connections.test.ts` | Remove core command suite only after plugin command parity coverage exists; retain manager close-target tests. |
| `src/completion/index.test.ts` | Preserve/extend `connections close` completion after core command removal. |

## Proposed changes

1. Add the import-free plugin payload contract and pure parser. Pin all legacy close errors and expanded plural/singular grammar before deleting the original parser.
2. Add the static manifest, activation, and tab model. Route list/close through host topic actions; distinguish UI `close` from command `closeCommand`; implement exact id/title/live lookup order and notification updates.
3. Register the production catalog and literal server loader. Add capability, command adapter, topic action, completion, and cleanup tests.
4. Remove the old command, parser, `ConnectionManager.run`, and their superseded tests only after parity coverage is present. Preserve catalog, completion, and close-target functionality.
5. Reconcile the diff against this path manifest. The client registry and all client entry/components are owned by 04b; record-tab rendering and scroll logic are owned by 04c.

## Tests and verification

- Server suites: `src/plugins/connections/parse.test.ts`, `shared.test.ts`, `activate.test.ts`, `src/plugins/loaders.test.ts`, `host.test.ts`, `adapters.test.ts`, `connections-topic.test.ts`, and `src/completion/index.test.ts`.
- Cover bare and docked list behavior; aliases; exact list output; exact errors; id-before-title lookup and newest case-insensitive title; row-owner opening; UI stale close no-op versus command close notifications; browser async reporting; record update/deletion races; intent/payload rejection versus plugin failure; declared-capability use; disposal; and completion after migration.
- Keep the command on one definition and one execution route. Verify no `ConnectionManager.run` or `src/connection/parsing.ts` consumer remains.
- Implementing code should use `$janissary/scripts/run.mjs check-diff`. Because this plan changes the server production catalog/loader, also run the plugin host/frozen-fixture checks required by the implementation workflow.
- 04b owns the production client build/chunk inspection after its literal client loader exists. 04a's acceptance is a working server plugin contract and command migration with all old observable list/close behavior retained.

## Out of scope

- Connections-list React UI, client entry/registry and list interaction tests (04b).
- Per-record tab React UI, status controls, transcript/activity presentation, and scrolling/paging (04c).
- Shell background replies and popup callbacks (05); API v3 and response-panel removal (06); specs/docs and whole-feature acceptance (07).
- ACP persistence/feed/cancel, agent record lifecycle, and topic/catalog/action implementation already completed in 01–03.
- Changes to `tasks`, conversations, agent-monitor, editor-persona ACP tracking, remote sessions, non-ACP history, or existing close-target semantics.

## Coverage allocation

04a owns source decisions 7's command and list/dock surfaces, 15 and 36's command lookup grammar, requirements 7's command contract and 8's server list projection, decisions 25–26 and server-facing parts of 33–36. The visual row behaviors and record body are assigned to 04b and 04c respectively. See the shared coverage map in 04c.
