# Focus the owning tab from a connection tab's metadata bar

Issue: add a focus icon button in the connection metadata row next to the focuses the relevant tab.

Complexity rating: 3/10

## Goal

A connection tab's metadata bar names the tab that owns the record, but reaching that tab means finding it in the strip or sidebar by hand. The bar should carry a focus icon beside its stop and close icons that brings the owning tab forward.

## Approach

The server decides whether a record has a tab to focus, and the client only renders the icon when the server says so, per the server-owns-state principle.

1. **Ownership on the tab record.** A record's `ownerLabel` is the label its tab had when the record began, and labels are reusable once a tab closes, so the label alone cannot tell the owning tab from a later one that took the label. `TabRuntime` gains `acpRecordIds?: Set<string>`, the ids of every ACP and agent record that began in this tab incarnation. `beginCoreRecord` in `src/acp/record-feed.ts` adds the core session's record id, and `AgentRunManager.create` in `src/agent/manager.ts` adds an agent run's record id to its caller tab. The set lives on the runtime record, so a closed tab takes it with it and a reused label starts empty. It is in-memory only, like the rest of the runtime.
2. **Focus target on record rows.** `durableRows` in `src/plugins/connections-topic-rows.ts` sets `focusTarget: ownerLabel` on a record row when the tab with that label is open and its runtime holds the record id. The field joins `ConnectionsTopicRecordRow` in `src/protocol/connections.ts` and moves to the shared row base in `src/plugins/connections/shared.ts`, whose guard already accepts an optional string there. It applies to every status, so a closed session's tab can still focus a tab that is still open.
3. **Focus action.** A new `focus` connections topic action carries a record id. `connectionsTopicAction` finds that record row and, when it has a focus target, activates that tab with `managers.tab.setActiveTab`, exactly as opening a live row does. A record with no focus target, or a missing record, is refused with `The owning tab is no longer open.` The connections plugin accepts a `focus` intent with an `{ id }` payload and forwards it; a malformed payload is refused with `invalid focus payload`.
4. **Focus icon.** `ConnectionTabMeta` renders a focus icon button, `faLocationCrosshairs`, first in the bar's actions while `record.focusTarget` is set, labelled and titled `Focus tab`. `useConnectionsController` sends the `focus` intent, and a refusal shows in the tab's alert like the other controls.

A label-only focus, which is how a live row's open works, was rejected for records because records outlive their tabs: a record whose tab closed would otherwise focus whichever tab later took the label. Keying records by tab incarnation on disk was rejected as more than the entry needs, since a restarted app has no tabs from before the restart to focus anyway.

## Implementation steps

1. Add `acpRecordIds` to `TabRuntime`, populate it in `beginCoreRecord` and `AgentRunManager.create`.
2. Add `focusTarget` to record rows in `durableRows`, the protocol type, and the shared row base.
3. Add the `focus` topic action to `ConnectionsTopicAction`, handle it in `connectionsTopicAction`, and add the `focus` intent to the connections plugin's intent union and `activate.ts`.
4. Add the focus icon to `ConnectionTabMeta`, wire it through `ConnectionTab` and `useConnectionsController`.

## Tests

- `src/acp/record-feed.test.ts`: `beginCoreRecord` adds the record id to the runtime's `acpRecordIds`, and keeps earlier ids after the session closes.
- `src/agent/manager.test.ts`: creating a run adds its record id to the caller tab's `acpRecordIds`.
- `src/plugins/connections-topic-rows.test.ts`: a record row has `focusTarget` when its owning tab holds the record id, including after the record closes; it has none when the owner tab is gone or a tab with the same label does not hold the id.
- `src/plugins/connections-topic.test.ts`: the `focus` action activates the owning tab, and refuses a record with no focus target and a missing record with `The owning tab is no longer open.`
- `src/plugins/connections/activate.test.ts`: the `focus` intent forwards `{ topic: 'connections', action: 'focus', id }`, rejects a malformed payload with `invalid focus payload`, and surfaces a topic refusal as a rejection.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: the bar shows the focus icon first in its actions when `focusTarget` is set and sends `focus` with the record id; it shows none without a focus target; a refused focus shows its error.

## Out of scope

- A focus control on connections list rows, which already focus or open on Enter and double click.
- Persisting record ownership across restarts.
- The remaining pull-request backlog entries (last activity for every connection type, a UUID for every connection type, and the table header wording).

## Specs and docs

- `product/specs/connections-tab.md`: the metadata bar's focus icon, when it appears, and its refusals.
- `product/specs/tab-plugins.md` and `documentation/developer-documentation/tab-plugins.md`: both enumerate the connections topic actions, so they gain `focus`.
- `documentation/user-documentation/command-bar/connections.md`: the connection tab's controls gain **Focus tab**. Neither help page describes the metadata bar's controls, so neither changes.
