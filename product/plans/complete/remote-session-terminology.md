# One vocabulary for the remote session lifecycle

Issue: in the UI, code and specs — where close, disconnect or detach are used to refer to closing the
connection without terminating the remote agent or harness, update the terminology to **detach**;
where open, create or connect are used to refer to creating a connection to a remote agent or
harness, update the terminology to **create**; where reconnect or reattach are used to refer to
establishing a connection to a remote agent or harness previously detached, update the terminology to
**attach**; where stop, terminate, destroy or end are used to refer to ending a connection to a
remote and terminating the agent or harness previously created, update the terminology to
**terminate**.

Complexity: 6/10

## Goal

Four things can happen to a remote session, and the code and the UI currently have about nine words
for them. A row's button says Disconnect while the action behind it is `detach`; another says
Reconnect while the action is `reattach` and the state it acts on is `detached`; a third says End
session while the record it destroys goes to a state called `ended` and the module that does it is
`end-session.ts`. Settle on one word per thing — **create**, **detach**, **attach**, **terminate** —
and use it in the button, in the wire contract, in the identifier, and in the spec.

`detach` is already the word almost everywhere it is meant, so this is mostly three renames, one
method rename, and the user-facing labels.

## Approach

### attach

Every `reattach` in `src/`, `web/src/` and `product/specs/` becomes `attach`, in each of its forms —
`Reattach`, `reattached`, `reattaching`, `reattachment`, `reattachable`. That includes the row action
`'reattach'`, the `remoteSession` RPC's action parameter, `SessionsManager.reattach`/`reattachTab`,
`startSessionReattach`, `ReattachOutcome` and its `'reattached'` kind, `HarnessManager.reattachRemote`,
and the backoff class `Reattach` in `src/remote/reattach.ts` — whose owning field `RemoteEntry.reconnect`
is renamed to `attach` with it, so the object and the field agree.

Three modules move with their names: `src/remote/reattach.ts` → `src/remote/attach.ts`,
`src/sessions/reattach.ts` → `src/sessions/attach.ts`, and their tests.

The two peer frames move too — `reattach` out and `reattach-result` back become `attach` and
`attach-result`. No protocol bump: the handshake admits only an exact version match, this branch
already carries 16 against master's 14, and every build that speaks the old names announces 14 or 15,
so it is already turned away with the message that check exists to give. The protocol's own version
history records the rename under 16 and leaves 14's paragraph naming the frames it actually shipped.

### terminate

The end-a-session family becomes terminate:

- row action `'end'` → `'terminate'`, row state `'ended'` → `'terminated'`, row flag `ending` →
  `terminating`, in `src/protocol/sessions.ts` and the plugin contract `src/plugins/sessions/shared.ts`
- `src/sessions/end-session.ts` → `src/sessions/terminate-session.ts`, with `EndOutcome` →
  `TerminateOutcome` (and its `ended` field → `terminated`), `endParkedSession` →
  `terminateParkedSession`, `isEndSessionLabel` → `isTerminateSessionLabel`, and the internal channel
  label prefix `end-session:` → `terminate-session:`
- `SessionsManager.end` → `terminate`, the `SessionAction` kind, and the manager's `ending`/`ended`
  fields and the `SessionActionResult` fields `ending`/`endingDone`/`ended`/`forgetEnded`
- `SessionEnded` → `SessionTerminated`, `SessionsSnapshot.ended` → `terminated`, `endedRow`/
  `endedRowFrom` → `terminatedRow`/`terminatedRowFrom`
- `endRemoteSession` → `terminateRemoteSession`, `endRemoteProcess` → `terminateRemoteProcess`,
  `dropEndedSessionRecord` → `dropTerminatedSessionRecord`
- the tab field `sessionEnded` → `sessionTerminated`, on `TabView`, on the harness view, and in the
  web bodies that render it
- the notification id `remote-session-ended` → `remote-session-terminated`

The sessions topic actions a plugin may raise — `{ topic: 'sessions'; action: 'reattach' | 'end' |
'forget' }` in `src/plugins/api.ts` — move with them. Neither version constant moves:
`SESSIONS_PAYLOAD_SCHEMA_VERSION` and the sessions topic both arrive on this branch and have never
been released, so renaming them breaks no contract anyone could be holding. `TAB_PLUGIN_API_VERSION`
stays 1, which is also what `src/plugins/fixture-v1/compatibility.test.ts` freezes — a real bump would
owe the deprecation window `ai/guidelines/plugins.md` §4 requires, and that is a separate piece of
work from renaming something that never shipped.

### create

`RemoteManager.open` — the one entry point that creates a connection to a remote agent or harness —
becomes `RemoteManager.create`. Its two callers are the remote launch and the terminate-session
channel.

### The words the user reads

- row and metadata-row buttons: Disconnect → **Detach**, Reconnect → **Attach**, End session →
  **Terminate**
- the confirmations: "Disconnect <name> on <host>?" → "Detach …", confirm button Disconnect →
  Detach; "End <name> on <host>?" → "Terminate …", confirm button End session → Terminate
- the notification lines: `… detached — reattach it from the sessions tab.` → `… attach it from the
  sessions tab.`; `… ended.` → `… terminated.`; `… could not be reattached: <reason>` → `… could not
  be attached: …`; `<what> on <host> ended — start a new agent or shell to continue.` → `… terminated
  — create a new agent or shell to continue.`
- the refusal lines keep "cannot be detached", which is already the word

## Tests

No new behavior, so no new cases — the existing suites are the test, and every one of them moves with
the rename. Three assertions change in kind rather than in spelling and are checked by hand:

- `src/plugins/sessions/shared.test.ts` pins the plugin contract against the host's
  `RemoteSessionView` and the manifest's schema version; both sides move together and the version
  moves to 2.
- `web/src/plugins/sessions/SessionList.test.tsx` and `SessionRowActions`' labels: the accessible
  names become `Detach claude`, `Attach claude`, `Terminate claude`.
- `src/sessions/rows.test.ts` covers which actions each state offers; the state and action literals
  move.

## Out of scope

- `reconnect`/`reconnecting` where it names the *transport's own* recovery: the backoff after a lost
  transport, `RemoteManager.reconnectingOf`, the row state `'reconnecting'`, and
  `RemoteTargetView.reconnecting`. The entry's attach rule is scoped to a connection "previously
  detached", and a dropped transport is not one — the spec deliberately separates the two states, and
  collapsing them would erase a distinction the entry did not ask to remove.
- The browser-to-server websocket's own reconnection (`web/src/ws.ts`, `reconnect-policy.ts`,
  `useConnectionStatus.ts`). That is not a connection to a remote agent or harness.
- `close` where it closes a tab: the row's `close` action, `SessionsManager.close`,
  `RemoteChannel.close`. Closing a tab is not giving up a connection while leaving the peer running.
- `open` where it opens a tab, a file, a picker, or a navigator, and where it opens the underlying
  ssh transport — dialling a socket for a session that already exists is not creating the session.
- Anything on the peer side that ends one *process* rather than the session.

## Specs / docs

`product/specs/sessions-tab.md` and `product/specs/remote-server.md` carry the vocabulary throughout;
`notifications.md`, `relaunch.md`, `sleep-and-resume.md`, `connection.md` and `tab-plugins.md` each
mention a reattach in passing.
`documentation/user-documentation/advanced-agents/remote-agents.md` names the three buttons by their
old labels in its Lifecycle section, so it moves with them. `help.md` describes none of this; the
`--relaunch` line in `janus --help` said "Reattach to existing state" and becomes "Attach", since the
restore it names does attach every recorded remote session.
