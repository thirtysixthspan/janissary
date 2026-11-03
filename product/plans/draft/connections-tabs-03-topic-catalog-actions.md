# Connections notification topic and host actions

**Complexity: 4/10**

## Goal

Expose current live connections and persisted ACP/agent records through a coalesced `connections` host topic with narrowly scoped actions for the plugin.

## Decisions and dependencies

- Covers source-plan requirements 8, 13–16, 18, 21, 23–24, and implementation decisions 26, 29, 33–34, 36 as host-side data, catalog, and action behavior.
- Depends on records subplan 01 and ACP/agent feed subplan 02. It does not depend on the plugin implementation.
- Live rows come from `connectionCatalog(managers, label)` across every open tab, retaining tab-scoped owners, plus one global row per open SQLite database. A tracked ACP session is represented by its record row, never duplicated from the live catalog. Monitor/persona ACP entries remain live-only.
- Topic delivery coalesces `connections:changed` and `state:dirty` to one latest-state delivery per 100 ms window. Topic actions are synchronous/fire-and-forget; asynchronous cleanup starts without awaiting.

## Existing code to reuse

- `connectionCatalog`, `closeConnection`, and `listLines` in `src/connection/`; `DatabaseManager.openDbs()` and `listOpen()`.
- Topic registration and batching patterns in `src/plugins/api-topics.ts`, `src/plugins/topics.ts`, and `subscribeTabs`.
- Plugin `originTab()`/`note()` capabilities and `AcpSessionRecords` from the preceding plans.

## Proposed changes

- Add the `connections` topic union entry, notification data/action shapes, and `NOTIFICATION_TOPICS` member; keep new topic definitions in `src/plugins/api-topics-connections.ts` and host source in `src/plugins/connections-topic.ts` to respect size limits.
- Compose rows across tabs and sqlite databases, preserving title, kind, owner, status, activity ordering, record ids, ACP snapshot references where they already exist, and sqlite focus target (first attributed tab in strip order or no-op).
- Supply loaded windows only for records whose connection tabs have requested them: latest 20 prompt blocks initially and `loadOlder` in pages of 20, preserving the shared server-owned data model.
- Implement `load`, `loadOlder`, `list`, `open`, `close`, `cancel`, `closeSession`, `terminate`, and `delete`. `list` returns the exact existing `listLines(...).join('\n')` text or `No open connections.` and uses invoking-tab label. `close` delegates to a public `closeTarget(kind, id, label)` preserving browser async behavior and both existing notification events. `delete` ignores open records. `terminate` initiates `managers.agent.finish(runId, 'terminated')` without awaiting.
- Validate every action against current rows and route it to its owning manager rather than introducing a label-keyed state map.

## Tests

- Add `src/plugins/connections-topic.test.ts` for batching both signals, rows across tabs, sqlite ownership/focus, tracked ACP deduplication, loaded windows, and each action's owner and refusal behavior.
- Extend `src/connection/manager.test.ts` for `closeTarget` retaining browser behavior, `connection-closed` and `connection-close-failed` notifications, and existing failure wording.

## Verification

- Run diff-scoped checks and verify adding the topic source makes the topic-union/source record exhaustive at compile time.
- Confirm a burst of activity does not send per-chunk topic deliveries.

## Out of scope

- Plugin command parsing, list/tab rendering, shell background reply display, API-v3 changes, and specs/docs.
- Changing the existing catalog semantics for `connections list` or completion beyond extracting the shared close target.
