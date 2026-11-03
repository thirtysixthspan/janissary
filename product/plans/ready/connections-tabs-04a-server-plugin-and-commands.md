# Connections server plugin and command migration

**Complexity: 5/10** — this server slice adds a lazy plugin with list and UUID-record tab lifecycles, migrates a core command and parser, and adds a command-only action to the existing validated topic contract.

## Goal

Create the server and shared-contract foundation for the bundled `connections` tab plugin. Move command ownership out of core without changing observable list/close behavior, expose validated topic actions, and make list and UUID-keyed record tabs available to the client slices that follow.

## Dependencies and sequence

- The authoritative scope and decisions are `product/plans/ready/connections-tabs.md`, especially requirements 1–2, 7–8, 11–19, 21–26, 33–36 and implementation change 4. These references allocate work; they do not change that source plan or its 8/10 rating.
- This is the server slice under parent task `build-a-complex-feature`, on branch `feature/connections-tabs` for PR #1916. Workspace preparation is outside this plan-review run.
- Depends on completed plans 01–03: `product/plans/complete/connections-tabs-01-records.md`, `connections-tabs-02-acp-feeds-cancel.md`, and `connections-tabs-03-topic-catalog-actions.md`. In particular, consume `managers.acpRecords`, `tab.runtime.acpRecordId`, UUID-keyed `ConnectionsTopicData`, and the existing synchronous topic actions. Do not reopen their record schema, ownership, cancellation/drain, catalog ordering, or action semantics.
- This is 04a of the replacement sequence 04a → 04b → 04c. Implement before 04b and 04c. 04b consumes this command, payload, topic-action, and list-tab contract. 04c consumes the UUID record-tab lifecycle here and follows 04b for integration into the client entry. The remaining sequence is 05 shell/popup integration after 04c, 06 API v3/panel removal after 05, and 07 specs/docs/integration after 01–06.
- Preserve branch repairs and completed contracts from 01–03: UUID record ids on tab runtime and runs, cancellation draining both send and provider-turn boundaries, `AgentRunManager.finish`, shared `ConnectionsTopicData`, validated synchronous UI topic actions, and existing topic ordering/catalog behavior.

## Decisions and reuse

- Declare plugin id and label prefix `connections`, command `connections`, alias `connection`, topic notification `connections`, and only the capabilities used by this server slice: `openOrFocusTab`, `updateTab`, `closeOwnTab`, `dockTab`, `topicData`, `topicAction`, `originTab`, `note`, `rejectRequest`, and `reportFailure`. Do not pass or import `Managers`. Discovery reads only the static manifest; `src/plugins/loaders.ts` uses a literal lazy import for activation.
- Keep the topic's existing validated UI action `close` unchanged: it requires a currently present live row with matching kind, id, and owner label, and stale rows are no-ops. Add a distinct command-only `closeCommand` action to `ConnectionsTopicAction`, carrying kind, id, and invoking label. Its host handler starts `ConnectionManager.closeTarget(kind, id, label)` without awaiting and without requiring a current topic row, preserving command notifications for missing targets and asynchronous browser completion. Never route command close through UI `close` validation.
- Keep one import-free `src/plugins/connections/shared.ts` payload contract for both client slices: `{ kind: 'list', rows }` contains current topic rows; `{ kind: 'connection', record }` contains one UUID record with its optional topic-provided window. Hand-written guards reject null, arrays, invalid discriminants, malformed nested rows/windows, and any invalid required client-consumed field, status, or action. Intents are exactly `open`, `close`, `cancel`, `close-session`, `terminate`, `delete`, and `load-older`; validate exact fields and translate them to the existing topic actions or plugin tab model. These names remain plugin-local.
- The pure plugin parser owns a local six-kind vocabulary (`sqlite`, `shell`, `acp`, `browser`, `ssh`, `terminal`) rather than importing the host's concrete `ConnectionKind` or old parser. Trim surrounding whitespace and compare command/subcommand tokens case-insensitively. Bare `connections` and `connection` open/focus the singleton list in the centre; a docked list returns to centre on bare plural command. Only plural `connections left|right` docks, using published `parseDockArgument`. Both names support `list` and `close`.
- Preserve `listLines` output exactly, including `No open connections.`. `list` passes the invoking `originTab().label` to the topic action, then writes its returned text with `note`; durable record rows remain excluded. Preserve the legacy `connections close <kind>:<id>` parser rules and these exact errors: `Usage: connections close <kind>:<id>`, `Invalid connection "<target>". Expected <kind>:<id>, e.g. sqlite:mydb.`, `Unknown connection kind "<kind>". Expected one of: sqlite, shell, acp, browser, ssh, terminal.`, and `Missing id in "<target>".`. Send parser errors through `note`, not `reportFailure` or `rejectRequest`. Bare plural no longer prints the old usage line. Ignore trailing tokens after the parsed subcommand/target, as the old parser does.
- Keep completion on `connections close` only. It remains the existing core completion projection from `ConnectionManager.completionConnections`; the command migration must not remove or redirect that completion path. Preserve existing close notifications verbatim, including `No open connection <kind>:<id>.`, `Closed connection <kind>:<id>.`, and `Could not close connection <kind>:<id>: <first-line>.` errors.
- Fix singular lookup precedence: first exact UUID record id; then `acp:<provider/model>` against the open tracked core ACP record whose `ownerLabel` matches the invoking tab and whose model matches the id; then an exact live topic row id, opening its topic-supplied owner; then the newest record whose title matches case-insensitively. Topic-deduplicated tracked ACP rows must not be synthesized as live rows. A failed singular lookup raises `rejectRequest` with exactly `No connection matching "<text>".`. Plural first arguments other than `list`, `close`, `left`, or `right` use the same singular lookup; docking forms belong only to the plural command.
- The list instance key is `connections`; record instance keys are durable UUIDs, never `acp-<n>` identities or labels. Opening a record requests its newest 20-block window through the topic before creating/focusing its tab. Notifications update only the list and record keys supplied by the host. If an open record disappears, close its tab with `closeOwnTab` and release ephemeral plugin state. If a record is still present without a window, keep its tab open and request/update the window; absence means deletion. Do not keep a plugin-local copy of authoritative record or window state.
- Reuse the `src/plugins/conversations/` static manifest, lazy activation, topic notification, intent, and tab lifecycle patterns; `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, `src/plugins/command-adapter.ts`, `src/plugins/api.ts`, and published topic contracts; plus `connectionCatalog`, `listLines`, `ConnectionManager.closeTarget`, `completionConnections`, parser kind/error behavior, and completed record/feed/topic APIs. Plugin implementation imports only the published `../api.js` contract and its own shared module; use direct `.js` relative imports in server code and no barrels.

## What already exists (reuse, don't rebuild)

These are verified current-code references, not additional edit authorization. The exhaustive manifest below is the only implementation scope.

| Need | Existing contract to reuse |
| --- | --- |
| Static declaration and lazy activation | `src/plugins/conversations/manifest.ts:4`, `conversationsManifest`; `src/plugins/loaders.ts:4`, literal `tabPluginLoaders`; `src/plugins/command-adapter.ts:33`, `createPluginCommands`. Catalog discovery imports manifests, not activation modules. |
| List command, dock, notification, and disposal shape | `src/plugins/conversations/activate.ts:30`, `activate()`; `:35`, plural command routing; `:66`, `notify`; `:75`, `dispose`. Reuse `parseDockArgument` and `noFileOpener` from the published `src/plugins/api.ts:448-449`. |
| Stable list/item tab model and topic data guard | `src/plugins/conversations/tabs.ts:5`, `dataFrom`; `:18`, `ConversationTabs`; `:37`, `open`; `:48`, `update`; `:76`, `dispose`. Connections records use UUIDs and the already-published topic window, not conversation ids or state. |
| Published topic action and notification types | `src/plugins/api.ts:39`, `ConnectionsTopicAction` export; `:287-289`, `topicData` and synchronous `topicAction`; `src/plugins/api-topics-connections.ts:10`, `ConnectionsTopicAction`. The topic has `close` and validates current live-row ownership in `src/plugins/connections-topic-actions.ts:49-60`. |
| Current row projection and completed record lifecycle | `src/plugins/connections-topic-rows.ts:6`, `composeConnectionsTopicData`; `:21-23`, flat deterministic sorting; `src/plugins/connections-topic-actions.ts:28`, record load/delete actions; `:82-90`, `connectionsTopicAction` and exact list output; `:63`, core ACP ownership validation; `:74`, agent-run validation. These belong to completed plan 03 and are inputs here. |
| Existing catalog/list/close/completion functions | `src/connection/catalog.ts:65`, `connectionCatalog`; `src/connection/list.ts:11`, `listLines`, and `:15`, `listCompletionConnections`; `src/connection/manager.ts:21`, `connectionsFor`; `:41`, `closeTarget`; `:54`, `completionConnections`. Preserve these projections and close semantics. |
| Parser and command code to migrate | `src/connection/parsing.ts:6`, `parseConnectionCommand`; `src/connection/manager.ts:29`, `run`; `src/commands/connections.ts:3`, core command definition. The manager's `run` is the parser's only production caller. |
| Capability behavior | `src/plugins/context.ts:88-94`, `note` appends output under the original command/invocation; `src/plugins/api-own-tab.ts:24`, `closeOwnTab(instanceKey)`. `originTab` is declared at `src/plugins/api.ts:343`. |
| Loader and completion regression checks | `src/plugins/loaders.test.ts:11`, resolves every literal loader; `src/plugins/host.test.ts:68`, manifest-only discovery and catalog/loader parity; `src/completion/index.ts:54`, `completeConnectionClose` remains a core completion route. |

## Exhaustive path manifest

Only the following paths are implementation scope for 04a. Paths named in the reuse list are read-only unless listed here. This is a server-only slice: no client registry, React components, client UI tests, product specs, or documentation changes. No web path is authorized.

| Path | Required change |
| --- | --- |
| `src/plugins/connections/manifest.ts` (new) | Static id/version/schema, `connections` label prefix, command and alias, `connections` notification, and exact capabilities above. |
| `src/plugins/connections/shared.ts` (new) | Import-free schema version; list/record payload and intent types; complete guards for all client-consumed fields and nested topic data. |
| `src/plugins/connections/parse.ts` (new) | Pure grammar, six local kind names, legacy close errors, trimming/case rules, ignored trailing tokens, and parsed discriminants for list, close, dock, and lookup. |
| `src/plugins/connections/record-tabs.ts` (new) | UUID-keyed record open/focus, initial window request, notification updates, deletion cleanup with `closeOwnTab`, missing-window requests, and disposal of ephemeral tracking. |
| `src/plugins/connections/tabs.ts` (new) | Singleton list key and list payload creation/update; delegate UUID record lifecycle to `record-tabs.ts`. |
| `src/plugins/connections/lookup.ts` (new) | Isolate record-id/acp-ref/live-row/title resolution and current owner opening from command routing so command modules stay focused and under the source limit. |
| `src/plugins/connections/command.ts` (new) | Command dispatch, topic `list`/`closeCommand`, list note/output, delegate lookup to `lookup.ts`, and rejection of unmatched lookup. |
| `src/plugins/connections/activate.ts` (new) | Compose the parser, tab model, command and alias routing, singleton centre/dock behavior, notification handling, intent validation/dispatch, graceful rejection, no-op opener, and disposal. Keep focused helpers in the named modules above rather than letting activation exceed 200 counted lines. |
| `src/plugins/connections/activate.test.ts` (new) | Manifest/capability fixtures; command/alias routing, exact output/errors, lookup precedence and owner opening, docking, notification updates/deletion, UUID record open/load/update/close lifecycle, intent validation/rejection, and disposal. |
| `src/plugins/connections/command.test.ts` (new) | Pure command behavior: list/close action delegation, exact error note versus plugin failure, target lookup ordering, owner resolution, and unmatched titles. |
| `src/plugins/connections/parse.test.ts` (new) | Bare, dock, list, close, and lookup forms; case/whitespace; all six kinds; malformed/empty target cases; exact messages; ignored trailing tokens. |
| `src/plugins/connections/shared.test.ts` (new) | Schema/version, payload and nested-row/window guards, statuses/actions, invalid JSON values, and missing/invalid required fields. |
| `src/plugins/catalog.ts` | Register `connectionsManifest` in the production catalog. |
| `src/plugins/loaders.ts` | Add literal lazy server import for `connections/activate.js`. |
| `src/plugins/loaders.test.ts` | Existing parity and literal-loader tests must prove the new catalog id resolves to an activation module. |
| `src/plugins/host.test.ts` | Assert production catalog/loader parity, `connections` and `connection` command claims, declared capability enforcement, and that `tasks` remains core-owned. |
| `src/plugins/adapters.test.ts` | Assert both command claims resolve through the real adapter without collision with retained core commands. |
| `src/plugins/api-topics-connections.ts` | Add typed command-only `closeCommand` carrying invoking label, kind, and id. Keep the completed `close` action shape and its current-row owner validation unchanged. |
| `src/plugins/connections-topic-actions.ts` | Handle `closeCommand` by starting `managers.connection.closeTarget(kind, id, label)` without awaiting; leave existing validated `close` action unchanged. |
| `src/plugins/connections-topic.test.ts` | Cover `closeCommand` per kind, missing targets, notifications, invoking label, and async browser behavior; preserve current stale-row UI `close` no-op tests. |
| `src/commands/connections.ts` | Delete the core command definition. |
| `src/commands/index.ts` | Remove only the core `connections` registry import and entry; keep `tasks` and unrelated commands. |
| `src/connection/manager.ts` | Remove command-only `run` and parser/output imports. Retain `connectionsFor`, `completionConnections`, `closeTarget`, and close notification/error behavior. |
| `src/connection/parsing.ts` | Delete after its grammar and errors move to the plugin parser. |
| `src/connection/types.ts` | Remove only `ConnectionParsed`, now owned by the plugin parser; retain `ConnectionKind` for existing host catalog and close APIs. |
| `src/connections.test.ts` | Remove only parser tests after equivalent plugin parser coverage exists; preserve `dbPath` tests. |
| `src/commands/connections.test.ts` | Delete the superseded core-command unit suite only after adapter and plugin command parity tests exist. |
| `src/connection/catalog.test.ts` | Replace its `ConnectionManager.run` integration use with the migrated host action/close-target seam while retaining round-trip coverage for every catalog target. |
| `src/connection/manager.test.ts` | Remove `run`-specific tests; retain and extend `closeTarget` tests for synchronous close, missing target, thrown error, notification text, and unawaited async browser close. Keep `connectionsFor` coverage. |
| `src/completion/index.test.ts` | Preserve/extend completion for `connections close` after core command removal; assert the `connection close` alias does not acquire completion. |

## Implementation steps

1. Add the import-free shared payload/intent contract and pure parser. Pin all legacy close errors and expanded plural/singular grammar before deleting the original parser.
2. Add the split list and UUID record tab models, then activation/command routing. Route list and close through topic actions, distinguish UI `close` from command `closeCommand`, and implement exact id/acp-ref/live/title lookup order and deletion/window notification behavior.
3. Register the manifest in the production catalog and literal server loader. Add capability, command adapter, topic action, list/record lifecycle, and completion tests.
4. Remove the core command, parser, `ConnectionManager.run`, and superseded parser/command tests only after plugin parity coverage exists. Preserve catalog, completion, and close-target functionality.
5. Reconcile the final diff against this path manifest. 04b owns the production client build/chunk inspection after its literal client loader exists; 04c owns record-tab rendering and scroll logic.

## Tests and verification

- Server suites: `src/plugins/connections/parse.test.ts`, `shared.test.ts`, `command.test.ts`, `activate.test.ts`, `src/plugins/loaders.test.ts`, `host.test.ts`, `adapters.test.ts`, `connections-topic.test.ts`, `src/connection/catalog.test.ts`, `src/connection/manager.test.ts`, and `src/completion/index.test.ts`.
- Cover bare and docked list behavior; aliases; exact list output; exact parser errors; id-before-acp-ref/live/title lookup and newest case-insensitive title; row-owner opening; UUID record open/load/update/deletion races; UI stale close no-op versus command `closeCommand` notifications; missing-target and browser async reporting; malformed intent/payload rejection versus plugin failure; declared-capability use; disposal; catalog target round trips; and plural-only completion after migration.
- Preserve old command/parser coverage by moving behavior assertions into plugin parser and command suites before removing `src/commands/connections.test.ts` and parser-only cases in `src/connections.test.ts`. Verify no `ConnectionManager.run` or `src/connection/parsing.ts` consumer remains, and that `ConnectionManager.completionConnections` remains available to the existing completion flow.
- Implementing code uses `$janissary/scripts/run.mjs check-diff`. The server catalog/loader change must also pass the existing loader activation and catalog parity checks. No production web build is part of 04a.
- Manual server-seam acceptance: invoke both command names through the real adapter; confirm bare invocation opens/focuses one centre list, plural docking and bare-centre behavior, exact `list` output, and close notifications including a missing target and delayed browser completion. Open a durable record by UUID, observe its 20-block window and subsequent topic update, then delete it and confirm its plugin tab closes. Verify completion still supplies targets for `connections close` only.

## Out of scope

- Connections-list React UI, client entry/registry, lazy client loader, and list interaction tests (04b).
- Per-record tab React UI, status controls, transcript/activity presentation, and scrolling/paging (04c).
- Shell background replies and popup callbacks (05); API v3 and response-panel removal (06); specs/docs and whole-feature acceptance (07).
- ACP persistence/feed/cancel, agent record lifecycle, shared protocol row/window schema, and base topic/catalog/action implementation completed in 01–03.
- Changes to `tasks`, conversations, agent-monitor, editor-persona ACP tracking, remote sessions, non-ACP history, or existing close-target semantics.

## Coverage allocation

04a owns source decision 7's command/list/dock surfaces, decision 15 and decision 36's command lookup grammar, decision 26's command migration, the server plugin portion of decision 25, and the server-facing parts of decisions 33–36. It also implements the plugin's UUID-keyed server record-tab lifecycle using the completed topic/record contracts. The visual list and record body behaviors remain assigned to 04b and 04c respectively; see the shared coverage map in 04c. This allocation preserves the authoritative source plan's full scope and does not change its 8/10 rating.

Keep every new production source module below ESLint's 200 counted-line limit. The named `record-tabs.ts`, `lookup.ts`, and `command.ts` extractions bound lifecycle and command routing; keep `shared.ts` as the required import-free payload/intent contract and make its hand-written guards complete without moving validation into a runtime import. If any named module is forecast to exceed the limit, revise this manifest before implementation rather than compacting code or adding an unnamed path.
