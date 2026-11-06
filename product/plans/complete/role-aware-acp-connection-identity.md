# Role aware ACP connection identity

**Complexity: 5/10** — adds role identity to protocol references, live and retained connection names, lookup, and lifecycle actions across server and client boundaries.

## Goal

Make ask and tell ACP sessions distinguishable on every live and retained connection surface, and route lookup, open, cancel, and close actions to the session that owns the record.

## Decisions and dependencies

- Build on the completed `role-keyed-acp-session-state.md` and `acp-prompt-isolation-and-role-orchestration.md` plans and the role-bearing ACP records from the earlier role-native-commands subplans. `AcpRole` is the existing `'ask' | 'tell'` union in `src/acp/role.ts:1-5`.
- A live core session id is `acp:<role>:<provider/model>`. A retained ACP record's name and connection-tab title are `acp:<role>:<tab name>` when its stored role exists. A record without role metadata keeps the legacy `acp:<tab name>` name; agent record names remain unchanged.
- `AcpRef`'s tab scope requires a role. The stored record role remains optional for legacy rows, but every newly created core ACP record carries it. Plugin capabilities that refer to the legacy tab session explicitly use `ask`.
- Close routing checks editor-persona and monitor matches first. Then `tell` and `tell:<suffix>` close tell; `ask`, `ask:<suffix>`, and every other id close ask, preserving the catch-all for a still-connecting ask session. A successful named-session report includes its role and actual model. If the handshake has not named it, the report uses the selected role and the supplied suffix, or just `acp:<role>` for a role-only id; a no-open report retains the id as entered.
- Opening a live popup ref resolves the current record for that ref's role. Record actions resolve the role from the record, treating a missing legacy role as ask, then verify that the owning tab still holds that exact record before cancel or close. The transcript snapshot for a tab-scoped ref continues to use the whole shared tab transcript.
- Lookup of `acp:<role>:<model>` selects that role's active record for the invoking tab. Legacy `acp:<model>` lookup remains ask-default. Exact UUID, live target, title, and whole-name matching keep their current precedence; role-qualified retained names match only when the record has a role, while role-less legacy rows keep their old name.
- Remote ACP already gives each ask/tell session a distinct id on the shared channel (`src/acp/session-manager.ts:18-21, 76-82` and `src/acp/manager.test.ts`, “keeps ask and tell remote sessions on separate ids over one channel”). No remote frame or transport change is needed; preserve the record's captured remote host.
- `TabView.acp` stays ask through the existing default in `AcpSessionManager.label` (`src/acp/session-manager.ts:27-29`); no client reads it as a role selector.

## What already exists (reuse, don't rebuild)

| What | Where | Reuse |
| --- | --- | --- |
| Role vocabulary and per-role session lookup | `src/acp/role.ts:1-5` (`ACP_ROLES`, `AcpRole`, `DEFAULT_ACP_ROLE`); `src/acp/session-manager.ts:18-50` (`sessions`, `label`, role-bearing record source) | Use the existing role type and role-keyed manager state; do not add another role registry. |
| Persisted record role and remote host | `src/acp-records/types.ts:12-15, 45-63` (`AcpRecordSource`, `AcpRecordRow`, `AcpRecordWindow`); `src/acp-records/model.ts:38-50` (`recordRow`) | Role and host are already persisted and projected. Carry both through the connection topic and plugin contract. |
| Shared live catalog and close entry point | `src/connection/catalog.ts:27-36` (`acpEntries`); `src/connection/close.ts:17-25` (`closeAcp`); `src/connection/list.ts:12-16` (`listLines`, completion) | Keep list, popup, completion, and close names on the one catalog and router. |
| Core ref and RPC contract | `src/protocol/tab.ts:8-24` (`AcpRef`, `ConnectionView`); `src/protocol/core-rpc.ts:11-15` (`OpenConnectionRecordParams`); `src/client-params/core.ts:9-16, 55-62` (`isAcpRef`, RPC decoders) | Extend the discriminated tab arm and its existing shape/owner guards. |
| Shell's duplicated client contract | `src/plugins/shell/shared.ts:13-34, 130-142` (`ShellAcpRef`, `isAcpRef`); `src/plugins/shell/manifest.ts:5-11` | Keep the import-free client copy aligned with `AcpRef`; update its schema parity when the tab ref becomes required-role. |
| Connections plugin rows, titles, and lookup | `src/plugins/connections/shared.ts:13-48, 88-125` (`ConnectionSource`, `RecordConnectionRow`, `recordConnectionName`, guards); `src/plugins/connections/record-tabs.ts:8-37`; `src/plugins/connections/lookup.ts:15-76` | Extend the existing record contract and name function used by the list, record tab, and lookup. |
| Record open and lifecycle actions | `src/controller/connection-records.ts:9-22` (`openConnectionRecord`); `src/plugins/connections-topic-actions.ts:65-77` (`actOnCoreRecord`); `src/plugins/connections-topic-rows.ts:63-94` (`liveTabRows`, `isTrackedCoreAcp`) | Preserve the existing stale-target no-op and record-owner check, selecting the matching role slot. |
| Topic row wire shape | `src/protocol/connections.ts:26-46` (`ConnectionsTopicRecordRow`); `src/plugins/connections-topic-rows.ts:112-125` (`durableRows`) | `durableRows` already spreads `AcpRecordRow`, including its role at runtime; declare that field in the topic and plugin types instead of relying on an undeclared extra property. |
| Snapshot and remote adapters | `src/controller/transcript.ts:22-36` (`openAcpTranscript`); `src/remote/acp-session.ts:36-40` (`createRemoteAcpSession`); `src/remote/serve-acp.ts:36-42` (`RemoteAcp`) | Keep tab snapshots shared and remote sessions multiplexed by their existing per-session ids. |

## Proposed changes

- Add required `role: AcpRole` to the tab-scoped arm of `AcpRef` in `src/protocol/tab.ts`. Update the tab arm in `src/plugins/shell/shared.ts` and its `isAcpRef` guard, the `isAcpRef` guard and inline tab-ref branch of `openConnectionRecord` in `src/client-params/core.ts`, and the duplicate tab-ref shape and guard in `src/plugins/connections/shared.ts`. Each guard accepts only `ask` or `tell`; the open-record decoder must continue requiring the ref label to equal the requesting tab.
- Update every producer and forwarder: `src/connection/catalog.ts` emits one named entry per role with id/display `acp:<role>:<provider/model>` and a ref carrying that role; `web/src/plugins/plugin-client-capabilities.ts` explicitly creates an ask ref; editor and harness popup clients continue forwarding the ref unchanged through `web/src/editor/useEditorConnections.ts` and `web/src/harness/harness-tab-intents.ts`. Monitor refs and editor-persona refs keep their current shapes and behavior.
- `SHELL_PAYLOAD_SCHEMA_VERSION` in `src/plugins/shell/shared.ts` moves from 4 to 5 because its required nested tab-ref shape changes. Keep `web/src/plugins/registry.tsx`'s shell literal in sync and update the schema assertion plus shell-version fixtures in `src/plugins/shell/shared.test.ts`, `src/plugins/launch-tab-remote.test.ts`, `src/tab/view.test.ts`, `web/src/App.test.tsx`, and `web/src/App.launch-focus.test.tsx`. `CONNECTIONS_PAYLOAD_SCHEMA_VERSION` moves from 1 to 2 because live rows carry a required role on their tab-scoped ACP ref, even though retained record roles stay optional for legacy rows.
- Declare optional `role` on `ConnectionsTopicRecordRow` in `src/protocol/connections.ts` and on ACP `ConnectionSource` and `RecordConnectionRow` in `src/plugins/connections/shared.ts`. Extend the connections row/window guards to accept only `ask` or `tell` on ACP rows and sources, reject role on agent rows and sources, and preserve role-less legacy rows and sources. Update `recordConnectionName` so role-bearing ACP rows use `acp:<role>:<ownerName>`, role-less ACP rows retain `acp:<ownerName>`, and agent rows remain `agent:<ownerName>`.
- In `src/connection/catalog.ts`, read each role with `managers.acp.label(label, role)` and emit nothing for a role before its handshake names it. Keep the catalog's editor and monitor entries after the core role entries. In `src/plugins/connections-topic-rows.ts`, suppress a tracked live core row only when the record id in the same role slot is present in the durable record set; a tell record must not suppress or satisfy ask's row.
- In `src/controller/connection-records.ts`, resolve `acpRef.role` instead of hard-coding ask. In `src/plugins/connections-topic-actions.ts`, use `record.role ?? 'ask'` for legacy-compatible ownership validation, then pass that role to `managers.acp.cancel` or `managers.acp.close`. Keep the status refusals and existing message text.
- In `src/connection/close.ts`, preserve editor and monitor precedence, route the role aliases and catch-all exactly as decided above, and call role-aware `label` and `close`. Do not interpret an arbitrary id beginning with another word as tell; only the exact `tell` alias or `tell:` prefix selects tell.
- In `src/plugins/connections/lookup.ts`, split a recognized `ask:` or `tell:` prefix from the model id before matching the invoking tab's active ACP record. An id with no recognized role prefix uses ask. Match both owner and role, and preserve the current exact-record, live-target, title, and record-name precedence and newest-first selection.
- Keep tab-scoped `openAcpTranscript` in `src/controller/transcript.ts` reading `tab.log` and naming its snapshot `acp:<tab label>`, regardless of ref role. Keep `TabView.acp` on the ask default. Update `product/specs/connection.md` and `product/specs/connections-tab.md` to describe role-qualified live and retained names, ask-default legacy lookup, close routing, and role-specific record actions.
- Use `.js` extensions on any new relative imports under `src/`. Keep each changed source file below ESLint's 200 nonblank, noncomment line limit; extract a helper/module if needed rather than compacting code or removing comments. Keep role parsing and owner validation simple enough to stay below the configured cognitive-complexity warning threshold.

## Tests

- `src/connection/catalog.test.ts` and `src/connection/close.test.ts`: assert both role ids/refs, omit unnamed handshakes, route tell and ask aliases, preserve editor/monitor priority and ask fallback, and cover named and still-connecting close reports. The existing remote-session manager test remains the transport regression for two ids on one channel.
- `src/plugins/connections/shared.test.ts` and `src/plugins/connections/lookup.test.ts`: validate role-bearing and legacy role-less rows/sources, names for ask and tell, unchanged agent names, role-specific lookup when both roles share a model, ask-default legacy model lookup, and unchanged exact title/name matching.
- `src/controller/connection-records.test.ts`, `src/plugins/connections-topic-rows.test.ts`, and `src/plugins/connections-topic.test.ts`: opening a tell ref selects tell's record; live-row suppression is role-specific; tell cancel/close requires and acts on tell's owned record, and stale or cross-role ownership is refused.
- `src/client-params/core.test.ts`, `src/plugins/shell/shared.test.ts`, `web/src/plugins/registry.test.tsx`, `web/src/editor/useEditorConnections.test.ts`, `web/src/harness/harness-tab-intents.test.ts`, and `web/src/plugins/plugin-client-capabilities.test.ts`: accept and forward role-bearing refs, reject a tab ref with a missing or invalid role, pin the shell schema and client registry version, and preserve ask for plugin capability refs.
- `src/controller/transcript.test.ts` and `src/tab/view.test.ts`: a tell ref still snapshots the complete shared tab log, and `TabView.acp` continues to expose ask's model.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` during implementation and after the final change.
- Manually open ask and tell sessions on one local tab and one remote tab. Confirm `connections list`, each popup, completion, and retained record names show the same role; open each live ref and record; cancel and close tell while ask remains open; then run `connections close acp:tell` and `connections close acp:tell:<model>` and verify the notification names the tell session. Confirm `acp:<model>` lookup still opens the ask record and a role-less retained record still matches its old name.

## Out of scope

- Changing the shared transcript snapshot or the visible record title `ACP: <first prompt line>`.
- Changing monitor or editor-persona connection identity and policy.
- Changing remote ACP frames or transport, role defaults, prompt orchestration, or the ask model reported through `TabView.acp`.
- Updating user help or user documentation; the final documentation subplan owns those.
