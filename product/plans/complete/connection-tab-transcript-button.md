# Transcript button on the connection tab's metadata bar

**Complexity: 5/10** — ~30 added lines across 6 production files, 6 behavioral requirements and 8 test scenarios drive p=5.379; the host-mediated topic action keeps the plugin capability unchanged.

## Summary

Per the PR backlog: "add a clipboard icon button in the metadatabar floated right with the other buttons that opens the acp transcript file in a new editor tab." A connection record tab (`web/src/plugins/connections/ConnectionTab.tsx`) renders its metadata bar through `ConnectionTabMeta`, whose right-hand `plugin-actions` span currently holds Focus tab, Cancel, Terminate, and Close session. The bar has no way to open the recorded ACP session's transcript, even though the connections-panel ACP rows already have one (`openAcpTranscript`). This adds the same affordance to the record tab's metadata bar: a clipboard button that opens the session's transcript as a read-only editor tab.

The button appears only for ACP connection records that carry an `acpRef` (tab, monitor, or editor scope); agent records and records without a ref have no transcript to open and show no button. Clicking it opens a point-in-time snapshot, matching the panel-row button: an empty exchange still opens a tab reading `No transcript yet.`.

## Design decisions

- **The button lives in the record tab's metadata bar.** It joins the existing right-floated icons in `ConnectionTabMeta`'s `plugin-actions` span, ahead of Focus/Cancel/Terminate/Close. (Chosen over adding it to the connections list header, which has no single session in context.)
- **The host opens the transcript, not the plugin.** The plugin client capability `openAcpTranscript` is deliberately bound to the plugin tab's own label so a plugin cannot ask for another tab's transcript. A connection record tab is keyed by the record id, so that capability would open an empty tab. Instead the plugin sends a new `open-transcript` intent naming the record id, and the host's `connections` topic action resolves the record's `acpRef` and calls the existing `openAcpTranscript` controller function. (Chosen over widening the plugin capability to accept an arbitrary `acpRef`.)
- **Record rows gain the `acpRef` the plugin type already declares.** `ConnectionsTopicRecordRow` has no `acpRef` today even though `RecordConnectionRow` does, so `durableRows` sets it from the record source: a core ACP session yields `{ scope: 'tab', label: ownerLabel, role: source.role ?? 'ask' }`, and an agent run gets none. The button is gated on that field, so agent records and any record without a ref show no button. (Chosen over gating on `kind === 'acp'` alone, which would offer a button with no session to open.)
- **No new client-to-server RPC or command.** The intent is a plugin-local message and the topic action is a host-internal operation; the existing `openAcpTranscript` RPC still does the actual open. (Chosen over a new core RPC.)

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Opening an ACP session's transcript as an editor tab, with the empty placeholder | `openAcpTranscript(managers, acpRef)` | `src/controller/transcript.ts` |
| The clipboard glyph and the right-floated icon-button shape | `faClipboard` and `IconButton` in the metadata bar | `web/src/plugins/connections/ConnectionTabMeta.tsx` |
| The plugin intent path and the record id payload guard | `intent` handler in `activate()`, `isIdIntent` | `src/plugins/connections/activate.ts`, `shared.ts` |
| Record-row shape and the optional `acpRef` the plugin already declares | `ConnectionsTopicRecordRow`, `RecordConnectionRow` | `src/protocol/connections.ts`, `src/plugins/connections/shared.ts` |
| Host-mediated connection operations addressed by record id | `connections` topic actions (`focus`, `cancel`, `load`) | `src/plugins/api-topics-connections.ts`, `src/plugins/connections-topic-actions.ts` |
| The controller's guarded intent calls | `useConnectionsController` | `web/src/plugins/connections/useConnectionsController.ts` |

## Proposed changes

**Server: `acpRef` on durable rows.** Add an optional `acpRef` to `ConnectionsTopicRecordFields` (`src/protocol/connections.ts`) and populate it in `durableRows` (`src/plugins/connections-topic-rows.ts`) from each record's `source`: an `acp` source yields `{ scope: 'tab', label: source.ownerLabel, role: source.role ?? 'ask' }`, an `agent` source yields none. The existing `isConnectionRow` guard already accepts an optional `acpRef`, so no guard change is needed.

**Server: a `transcript` connections topic action.** Add `{ topic: 'connections'; action: 'transcript'; id: string }` to `ConnectionsTopicAction` (`src/plugins/api-topics-connections.ts`). In `src/plugins/connections-topic-actions.ts`, add a handler that finds the record row by id, refuses when the record is gone or has no `acpRef`, and otherwise calls `openAcpTranscript(managers, record.acpRef)`. Add an explicit branch for `'transcript'` in `connectionsTopicAction` so it does not fall through to the agent-run handler.

**Server: an `open-transcript` plugin intent.** In `src/plugins/connections/activate.ts`'s `intent()`, handle `open-transcript` with `isIdIntent`, validate that the id names a record carrying an `acpRef`, then call `capabilities.topicAction({ topic: 'connections', action: 'transcript', id })` and pass any refusal to `capabilities.rejectRequest`.

**Web: controller and metadata bar.** Add `openTranscript(id)` to `useConnectionsController`, calling the `open-transcript` intent through the existing guarded path. Pass it into `ConnectionTabMeta` as `onOpenTranscript`. In `ConnectionTabMeta`, import `faClipboard` and render an `IconButton` with `action="open-transcript"` and label `Open transcript` in the `plugin-actions` span when `record.acpRef !== undefined`, ahead of the existing buttons.

**Ordering & constraints.** Land the durable-row `acpRef` and the topic action first, then the intent, then the web wiring, running `check-diff` after each. All new `src/` imports carry `.js` extensions. No touched file approaches the 200-line `max-lines` cap. No comments are added beyond the existing metadata-bar comment, which is extended to name the new button.

## Tests

**Server:**
- `src/plugins/connections-topic-rows.test.ts` (existing): a durable ACP record row carries the tab-scoped `acpRef` derived from its source; an agent record row carries none.
- `src/plugins/connections-topic.test.ts`: the `transcript` topic action opens a capture file through `openAcpTranscript` for a record with an `acpRef`; it returns a refusal string for a missing record and for a record without an `acpRef`.
- `src/plugins/connections/activate.test.ts`: the `open-transcript` intent calls `topicAction` with `{ topic: 'connections', action: 'transcript', id }`; a non-id payload and an unknown id are rejected.

**Web:**
- `web/src/plugins/connections/ConnectionTab.test.tsx`: an ACP record with an `acpRef` shows an `Open transcript` clipboard icon in the right-floated actions; clicking it sends the `open-transcript` intent with the record id; a record without an `acpRef` shows no such button.

## Out of scope

- Changing the panel-row transcript button, the launcher tab's ACP transcript button, or any other transcript affordance.
- A live-updating transcript view or copy-to-clipboard export; the button opens the same point-in-time snapshot as the panel-row button.
- Changes to how ACP sessions are spawned, recorded, or torn down.
- Documentation changes unless an existing help or user-documentation page describes this metadata bar.
