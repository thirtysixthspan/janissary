# Remote sessions tab

**Complexity: 8/10** — a new manager and a new persisted record on the server, a remote-protocol version bump with a new frame pair answered by the far side, a new bundled tab plugin on both sides, and a reattach path that has to rebuild tabs for processes it did not start; the risk concentrates in the ordering between a peer's replay burst and the tabs that are supposed to receive it.

## Summary

Janissary can put an agent or a harness on another machine (`harness claude on devbox`), and it can run a plain `ssh <destination>` tab. What it cannot do is *show* that set: there is no one place that answers "what am I running on other hosts right now, and what is still running out there that I am no longer attached to?" A remote peer whose transport dies keeps its processes and its workspace alive for seven days waiting to be reattached (`REMOTE_DETACH_TIMEOUT_MS`, `src/remote/serve-detach.ts:8`), and today the only thing that ever reattaches is the same `RemoteManager` entry that lost the transport, inside the same running janissary process. Quit the app and a live peer sits on the far host with no way to find it and nothing but the seven-day expiry to end it.

This feature adds a **sessions tab**: a list, built like the conversations list, of the remote clients this janissary holds — active ones (remote harnesses, remote agents, ssh tabs, remote file navigators) and detached ones (peers still alive on a remote host, awaiting reconnect). Rows carry the actions: **reattach** a detached peer, which opens a tab for each process still alive on it; **detach** an active one, which lets go of it locally while deliberately leaving it running; plus **end** and **forget** for the two ways a parked session stops being interesting.

The value is that a remote session stops being invisible infrastructure tied to one tab's lifetime and becomes a thing the user can see, park, and pick back up — the way tmux sessions are listed, detached, and reattached, and the way the conversations list makes stored conversations addressable independently of whichever tab happens to be open.

## Design decisions

Decisions 1–7 are settled by the feature text or by existing behavior; 8 onward were settled with the user during planning.

1. **A new tab, listed like the conversations list.** The model is a tab plugin (`src/plugins/conversations/`, `web/src/plugins/conversations/ConversationList.tsx`): a `plugin-meta` header band with icon-only right-aligned actions and the host's split control, a `No conversations yet` empty line below it, and rows carrying text plus per-row icon buttons. Rows are keyboard navigable (Up/Down without wrapping, Home/End, Enter to open, `conversation-list-keys.ts`), and mouse-open takes two clicks on the same row.

2. **Active and detached appear in one list**, per the feature text.

3. **Reattach and detach are the two headline actions.** Reattach applies to a detached peer and opens the appropriate tabs; detach applies to a live peer and gives it up locally without ending it.

4. **Reattachment already exists as a mechanism, at protocol version 14.** `reattach`/`reattach-result` and the handshake's session id are in `src/remote/protocol.ts:60` and `:66`. The far side's `DetachedPeer` (`src/remote/serve-detach.ts:15`) keeps a unix-socket rendezvous plus a `<root>/.janissary/remote/<session>.json` record holding its pid and socket path, buffers up to `PENDING_BUFFER_BUDGET_BYTES` (1 MB) of output while detached, and answers a `reattach` frame carrying its session id; a second `janus remote-serve` over a fresh ssh connection relays into that socket (`relayPeer`, `src/remote/serve-detach.ts:131`). This feature reuses that machinery rather than inventing a second one.

5. **Detaching is not the same as closing.** An explicit close today sends `shutdown` (`RemoteChannel.finish`, `src/remote/channel.ts:128`, which also kills every spawned process first), and `product/specs/remote-server.md` states the seven-day wait "exists only for a connection that is lost rather than deliberately ended." Detach is therefore a genuinely new operation: end the local hold *without* those frames, so the far side runs the same path a dropped transport produces.

6. **The far-side detached record is per-host.** Nothing local persists a launched session's id today — `RemoteManager` holds entries in memory only (`src/remote/manager.ts:44`, `private entries = new Map<string, Entry>()`).

7. **Plain `ssh <destination>` tabs are a different kind of thing.** A local PTY running the real `ssh` binary (`src/ssh-manager.ts:32`, `harness: HarnessView = { name: 'ssh', … destination }`), with no janissary peer, no session id, and no detached state; `product/specs/remote-server.md` says they "retain their existing close-on-exit behavior and do not use this recovery." They are listed, but never detached or reattached.

8. **One row per tab, not per channel.** Every remote harness tab, remote agent tab, plain ssh tab, and remote file navigator is its own row, and a detached peer contributes a row per process still alive on it. There is no row standing for the channel itself; a shared channel is shown by grouping (decision 15).

9. **Row content and order.** Five columns: the bare host, what the row is running, its **kind** (`harness`, `agent`, `ssh`, `navigator` — what the row *is*, matching the tab it opens or would open), its **state** (`provisioning`, `active`, `reconnecting`, `detached`, `ended`), and a relative last-activity timestamp. The row's tooltip carries the full destination and the workspace path. The second column shows the tab's own name: a harness or agent label, `ssh`, or a navigator's root abbreviated with the workspace symbol (`cwdDisplay`'s `$workspace/<name>` form, `src/protocol/tab.ts:46-50`). Ordered by most recent activity, newest first, no grouping by state or host — the conversations list's ordering.

```
devbox    claude             harness    active        just now
  └ bekir                    agent      active        3m ago
  └ files $workspace/claude  navigator  active        2h ago
build-01  ssh                ssh        active        5m ago
devbox    claude-2           harness    detached      2h ago
admin@box bekir-2            agent      reconnecting  1m ago
```

10. **Reconnecting is its own state.** It is a live entry whose `Reattach` is mid-backoff (`entry.reconnect.active`, `src/remote/reattach.ts:27`): tabs open, transport gone, janissary already retrying. Separating it from active is what explains an unresponsive remote tab, and reattach on that state means "try now" — it collapses the backoff wait exactly as the system resume signal already does (`resumeRemote`, `src/remote/reattach.ts:66`).

11. **Detach closes the local tabs and keeps the peer alive.** It closes every tab and navigator holding the channel and drops the transport without `finish()`, so the far side runs `RemoteServer.detach()` → `DetachedPeer.detach()` (`src/remote/serve.ts:189`, `src/remote/serve-detach.ts:70`) and starts its expiry. The row stays, now detached. It asks for confirmation first, since tabs disappear.

12. **Detach is refused until the workspace is ready.** While a remote tab is provisioning, its row reads `provisioning` and the control is disabled: there is nothing to come back to yet. This is the test the automatic recovery already applies — a session id *and* a workspace directory — before treating a lost transport as recoverable rather than as a failed launch (`RemoteManager.channelClosed`, `src/remote/manager.ts:243`).

13. **Reattach opens one tab per far-side process**, restoring the group rather than a single representative tab: a remote harness tab for a harness process, a remote agent tab for an agent's shell. Remote file navigators are not restored.

14. **Rows that cannot be detached carry focus and close.** An ssh row, a navigator row, and any row joined onto someone else's channel focus their tab when opened, and carry a close button where a launching row carries detach: closing an ssh row kills that tab's PTY exactly as `connection close ssh:<id>` does, and closing a navigator or joined row releases its hold (`RemoteManager.release`, `src/remote/manager.ts:175`).

15. **Rows sharing a channel are indented under their launching row**, so one glance shows what a single detach would take with it. Activity ordering applies to the launching rows; each group's members stay under theirs.

16. **Detach, end, and forget live on the launching row only** — they act on a whole channel. Reattach is the exception: pressing it on *any* row of a detached session brings the whole peer back, because one ssh connection serves the whole session and those rows are a view of one thing.

17. **A failed reattach distinguishes an ended session from an unreachable host.** The rule `product/specs/remote-server.md` already states for automatic recovery, applied to the button: a refused reattach or a dead recorded pid establishes termination — the row becomes ended and a notification names it; a timeout or a failed connection establishes nothing, so the row stays detached with its failure reported and the button can be pressed again.

18. **A detached peer can be ended for good.** End reconnects far enough to send `shutdown` — stopping its processes and removing its remote workspace — then drops the row. Confirmed with a dialog, since it destroys the far-side workspace. Active rows do not carry it: ending a running session is what closing its tabs already does.

19. **The trash button is earned, not always present.** It appears on a detached row only after a reattach or an end has failed to reach that host, so "forget this" cannot be the easy way past a session that is merely slow to answer. Forgetting removes janissary's own record and touches nothing on the far side.

20. **A reattached peer with nothing running is ended.** When the accepted reattach's `session-state` answer names no live process there is nothing to open a tab for: janissary sends `shutdown`, drops the record, marks the row ended, and reports it. An empty peer left alive would hold a remote workspace for a week with nothing running in it.

21. **Opening a row focuses it, or reattaches it.** The conversations gesture: one click moves the current row, a second click on the same row opens it, Enter opens the current row. Opening an active, reconnecting, ssh, or navigator row focuses that tab; opening a detached row reattaches it; opening an ended row does nothing.

22. **A reattach opens its tab immediately, exactly as a remote launch does** (`startRemoteTab`, `src/harness/remote-launch.ts:78`). The recorded launching tab is created first as the placeholder carrying the ssh PTY, so ssh's own password, passphrase, and host-key prompts render in it; the remaining tabs are created once `reattach-result` is accepted and `session-state` has answered. The list holds no separate in-flight state — it follows what that tab's channel reports.

23. **A reattached tab takes its recorded label back**, de-duplicated with `-2`, `-3`, … through `uniqueLabel` (`src/tab/index.ts`, as `SshManager.open` uses it) if something else has claimed it meanwhile. The remote workspace directory is named after the original label, so reusing it keeps the tab and its far-side clone agreeing about what they are.

24. **A remote tab's metadata row carries the detach/reattach control, and it spins while in flight.** It sits beside the host chip in `AgentTabMeta` (`web/src/shared/AgentTabMeta.tsx:33`, `{remote !== undefined && <RemoteChip remote={remote} />}`) — the one shared metadata row agent, shell, and harness tabs all render, so one placement covers every remote tab. Pressing it detaches the whole shared channel, closing every tab and navigator riding on it after the confirmation names what will go; a per-tab detach has no meaning, since the ssh connection would have to stay up for the others anyway. The file navigator header (`web/src/file-navigator/FileNavigatorHeader.tsx:49`) keeps its own chip and gains no control, matching decision 14.

25. **The session record is project-scoped**, living in the project's own `.janissary/`, so opening janissary on another project shows only that project's remote sessions. This matches what a remote launch is: a clone of *this* project's `origin`, provisioned by a peer rooted in the remote's own copy of it.

26. **Quitting still ends remote sessions.** Unchanged from `product/specs/remote-server.md`: on quit every remote process, ACP session, and navigator is told to stop before the channel closes — which is why `remote` disposes after all of them (`MANAGER_DISPOSE_ORDER`, `src/managers.ts:79-105`). Detach is the deliberate way to park a session before quitting; a crash or a lost network still leaves a recoverable peer, which is what the record and the list are for.

27. **`--relaunch` reattaches every recorded peer; an ordinary start does not.** A relaunch reattaches each recorded session as part of the restore, opening its tabs per decision 13; an ordinary `janus` lists them as detached and waits for the button. This narrows `product/specs/remote-server.md`'s "Restoring a remote agent tab on `--relaunch`" exclusion, which was written against a world with no session record to restore from.

28. **An unattended reattach obeys the same rule as a pressed one and never blocks the restore.** A refusing peer is marked ended, an unreachable host stays detached with its failure on the row, and reattached tabs appear as their peers answer.

29. **Every action reports one line to the notifications feed**, so the change is on the record even when the tab is closed: `<what> on <host> detached — reattach it from the sessions tab.`, `<what> on <host> reattached.`, `<what> on <host> ended.`, and `<what> on <host> forgotten — its record was removed.` `<what>` is the name the row's second column shows. The lines are plain text carrying no click target, exactly as the existing `remote-session-ended` line (`endRemoteSession`, `src/remote/reattach.ts:74`) is; that line is untouched.

30. **A truncated replay is reported the way it already is.** A `reattach-result` carrying `truncated` reuses the existing line — `Some remote output produced while disconnected was dropped to limit memory use.` (`RemoteManager.reportTruncatedReplay`, `src/remote/manager.ts:232`). No second wording.

31. **The header band carries a refresh button and the host's split control, and janissary never probes a host on its own.** Refresh re-reads local state and rebuilds the rows; it opens no ssh connections. Reachability is learned only by pressing reattach or end, so a detached row claims nothing about its host beyond what the record says and what the last attempt reported. *Ceiling and upgrade path:* a row can therefore be stale — a peer that expired while janissary was closed still reads `detached` until something tries it. If that proves confusing, the upgrade is a batched probe (one ssh per host, answering the same `session-state` query from the far side's record directory), which the frame this plan adds already supports.

32. **The command word is `sessions`, and the wording is fixed.** `sessions` opens or focuses the singleton tab; `sessions left`/`sessions right` dock it and bare `sessions` while docked returns it to the centre — the grammar `conversations` has (`parseDock`, `src/plugins/conversations/activate.ts:25`). Any other argument is rejected with `Usage: sessions [left|right]`. The tab is titled **Sessions**; the empty state reads `No remote sessions`; the state words are those in decision 9; the buttons are `Reattach`, `Detach`, `End session`, `Forget session`, and `Close`. The confirmations are terse — `Detach <what> on <host>?` with `Cancel`/`Detach`, and `End <what> on <host>?` with `Cancel`/`End session` — matching how short `DeleteConversationDialog`'s is. Forget has no dialog.

33. **The connections surface and the sessions tab stay disjoint.** `connection list` and the connections panel keep describing connections open *now*, so a detached session appears in neither. The two specs cross-reference each other rather than overlapping.

34. **Contention is not arbitrated.** Two janissary instances reattaching one peer can only arise when a project is checked out twice or a record is copied between machines. `DetachedPeer.accept` already destroys the previous socket when a new reattach arrives (`src/remote/serve-detach.ts:109`), so last attach wins and the loser enters its own reconnect backoff. Nothing is added.

35. **A record older than the detach timeout is pruned silently when the store loads it.** It describes a peer that cannot still exist, so the list never offers a reattach guaranteed to fail, and nothing is reported: the session ended on the far host days ago and janissary has nothing to add to that.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| A singleton list tab: header band, empty line, keyboard rows, per-row icon actions | `ConversationList` + its pure key module | `web/src/plugins/conversations/ConversationList.tsx`, `conversation-list-keys.ts` |
| A confirm dialog inside a plugin, using host modal CSS classes without importing host UI | `DeleteConversationDialog` | `web/src/plugins/conversations/DeleteConversationDialog.tsx` |
| A list tab fed by a host topic rather than its own state | The schedules plugin | `src/plugins/schedules/`, `web/src/plugins/schedules/SchedulesTab.tsx` |
| Topic plumbing: subscribe, read now, act on a row, refuse an action naming an unknown row | `TOPIC_SOURCES`, `focusScheduleOwner` | `src/plugins/topics.ts:22`, `:71` |
| A plugin command with `left`/`right` docking words | `parseDock` + `dockTab` | `src/plugins/conversations/activate.ts:25-44` |
| The live channel registry: entries, addresses, workspaces, label sets | `RemoteManager` | `src/remote/manager.ts:43` |
| Reconnect state and bounded backoff, plus "retry now" | `Reattach`, `resumeRemote` | `src/remote/reattach.ts:26`, `:66` |
| Far-side detached peer: rendezvous socket, pid record, replay buffer, expiry | `DetachedPeer`, `relayPeer` | `src/remote/serve-detach.ts` |
| Reattach frames and the handshake session id | `reattach`, `reattach-result`, `RemoteHandshake.session` | `src/remote/protocol.ts:105`, `:151`, `:66` |
| Opening a remote tab: placeholder, ssh prompts in it, provisioning wiring | `startRemoteLaunch`, `startRemoteTab` | `src/harness/remote-launch.ts:40`, `:78` |
| Joining a second tab or navigator onto a channel, and releasing one | `RemoteManager.attach`, `.release` | `src/remote/manager.ts:141`, `:175` |
| Ending a session with an explanation on each affected tab | `endRemoteSession`, `terminateRemoteEntry` | `src/remote/reattach.ts:74`, `:103` |
| Atomic whole-file rewrite | `atomicWrite` | `src/atomic-write.ts` |
| One-instance-per-project guarantee (why one record file is safe) | `acquireLock` | `src/instance-lock.ts:26` |
| Unique tab labels on restore | `uniqueLabel` | `src/tab/index.ts` |
| The metadata row that every agent, shell, and harness tab renders | `AgentTabMeta` + `RemoteChip` | `web/src/shared/AgentTabMeta.tsx:33`, `web/src/shared/RemoteChip.tsx` |
| Capturing and restoring a plugin tab in a profile — **no work needed** | `writePluginEntry` | `src/profile/save-route.ts:70` |

## Proposed changes

Prose only; module, type, and contract names, no code. Ordered so the tree stays green at each step: storage and manager before anything reads them, the protocol frame before the far side answers it, the two front doors last.

1. **`src/sessions/store.ts` — the local session record.** One `remote-sessions.json` under the project's `.janissary/`, rewritten through `atomicWriteFile` (`src/atomic-write.ts:8`) whenever the set changes. Per session it holds: session id, the address as launched, workspace label and directory, the launching tab's label and kind, each joined process's spawn id, label and kind, and a last-activity stamp. One file rather than one per session is safe because `acquireLock` (`src/instance-lock.ts:26`) already refuses a second janissary in one project directory. The store registers an entry in `STATE_DIRECTORY_ENTRIES` (`src/state-dirs.ts:25`) for its `init` and supplies **no** `clear`: outliving the process is the point, and an entry with no `clear` is never swept (`clearStateDirectories`, `:128`). Its read, merge, and prune functions are pure and tested without a server. A record whose stamp is older than `REMOTE_DETACH_TIMEOUT_MS` is pruned at load — the peer cannot still exist.

2. **`src/sessions/manager.ts` — `SessionsManager`.** It owns the store, composes the row view, and exposes detach, reattach, end, and forget plus the change signal the topic subscribes to. Row composition reads live state from `RemoteManager` (entries, addresses, workspace labels, `reconnect.active`, `workspaceDir`), `TabManager` (which tabs exist, which are remote, which are navigators or ssh tabs), and the record (sessions with no live entry), and lives in its own module beside the manager — `src/sessions/rows.ts` — so neither file approaches the 200-line limit. Registering it means three edits in `src/managers.ts`: the `ManagerRegistry` field, a position in `MANAGER_DISPOSE_ORDER` (before `remote`, since it reads channels while tearing down), and, because it holds no per-tab resource of its own, **no** entry in `MANAGER_TAB_RELEASE`.

3. **`src/protocol.ts` — the row view type.** `RemoteSessionView` (host, name, kind, state, last-activity, the launching-row relationship, and which actions the row offers) joins `AggregatedScheduleView` and `ConversationsView` as the single wire definition both sides import, and is re-exported from `src/plugins/api.ts` the way those two are (`src/plugins/api.ts:287-294`) so the plugin can type its handler without importing `../protocol.js`.

4. **`src/remote/protocol.ts` — a `session-state` query, bumping `REMOTE_PROTOCOL_VERSION` to 15.** A `ClientFrame` asking the far side to describe the processes alive in its workspace, and a `ServerFrame` answering with one entry per process: spawn id, program, mode, and harness or agent name. Both need entries in `CLIENT_FRAME_TYPES`/`SERVER_FRAME_TYPES` (`:191`, `:197`) and validation in `src/remote/frame-decode.ts`, where ids must be nonempty strings and the mode one of the declared values. The version comment gains its paragraph, in the established shape. **`RemoteProcesses` does not retain enough to answer today** — its table is `Map<string, { kill }>` (`src/remote/serve-processes.ts:15`, `:23`) — so `spawn` keeps the frame beside the entry, and `RemoteServer.dispatch` (`src/remote/serve.ts:108`) gains the arm that answers from it.

5. **`src/remote/channel.ts` — hold output for a listener that does not exist yet.** On reattach the far side flushes its whole pending buffer immediately after `reattach-result` (`src/remote/serve-detach.ts:116-120`), but a session reattached after a restart has no tabs yet, and `dispatch` drops output whose id has no listener (`:214`, `this.sessions.get(frame.id)?.onOutput`). The channel therefore buffers `output`/`exit` frames for unknown ids and flushes them, in arrival order, when `attach(id, listener)` registers one. The buffer is bounded by the same 1 MB the far side uses and reports an overflow through the existing truncation line (decision 30); anything still unclaimed once the reattach's tabs are built is discarded.

6. **`src/remote/manager.ts` — detach, and reattach from a record.** `open` takes an optional recorded session id: supplied, the entry is created with `channel.sessionId` already set, so `onAttached` takes the branch that already sends `reattach` rather than `provision` (`:76-78`) and `reattach-result` is handled by the code that already handles it (`:82-88`) — one connection routine for launches and reattaches alike. A new `detach(label)` releases every label holding the entry, clears its handlers, and calls `channel.close()` **without** `channel.finish()`, so no `kill`, `acp-close`, or `shutdown` frame is sent and the far side's SIGHUP path parks the peer. It is refused when the entry has no `workspaceDir` (decision 12). Keeping this to two additions is what keeps the file — 262 lines today — from needing its own split.

7. **`src/plugins/` — the topic and its actions.** `TabPluginNotificationTopic` gains `sessions` and `NOTIFICATION_TOPICS` its entry (`src/plugins/api.ts:62-69`); `TOPIC_SOURCES` gains a source whose `subscribe` listens for the manager's change signal on a new `sessions` channel in `BusChannels` (`src/bus.ts:139-144`, beside `schedules` and `conversations`), whose `read` returns the row view, and whose `act` runs the actions against `SessionsManager`; `TabPluginNotification` gains the `sessions` variant; `TabPluginTopicAction` gains reattach, detach, end, forget, focus, and close, each refused when it names a session or tab the current view does not hold — the narrowing `focusScheduleOwner` already applies (`src/plugins/topics.ts:22`).

8. **The `sessions` tab plugin** (`src/plugins/sessions/`), per `ai/guidelines/plugins-tabs.md`: a pure `manifest.ts` claiming the `sessions` command, the `sessions` topic, and the `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `rejectRequest`, `reportFailure` capabilities; an import-free `shared.ts` owning the payload type, its schema version constant, and hand-written guards rejecting arrays, `null`, and any row missing a field; an `activate.ts` supplying `isPayload`, an opener pair that rejects (`sessions opens no files`, as conversations' does), the command including the docking words and the usage rejection, the intent handler, and `notify` calling `updateTab`. Registered in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx` with its schema version pinned as a literal there.

9. **`web/src/plugins/sessions/` — the list.** `SessionList` modelled on `ConversationList`: the `plugin-meta` header with the refresh button and `capabilities.splitAction`, the `No remote sessions` empty line, rows with the five columns, the indent for joined rows, and per-row buttons gated by what the row offers. Selection and key handling go in a pure `sessions-keys.ts` beside it; one parameterized confirm dialog component serves both detach and end, written like `DeleteConversationDialog` (host modal CSS classes, no host imports); styles in its own `sessions.css`.

10. **One RPC method for the metadata-row control.** `src/protocol.ts` gains a single `remoteSession` client message carrying `{ action: 'detach' | 'reattach', label }` rather than one method per verb, with its entry in `CLIENT_METHOD_CONTRACTS` (`src/client-message.ts:13`, mode `ack`), a params decoder in `src/client-params/`, and a dispatcher arm in `src/message-handler.ts` calling the same `SessionsManager` methods the topic actions call — one implementation behind two front doors. `AgentTabMeta` renders the control beside the chip, disabled while provisioning and spinning while the server reports the action in flight.

11. **`--relaunch`** asks `SessionsManager` to reattach each recorded session independently as part of the restore, with failures landing on their rows (decisions 27–28) rather than holding the restore up.

12. **Notifications.** `NotificationEventType` gains `remote-session`, classified in `EXPLICIT_EVENTS` and given its `notificationText` case returning the detail verbatim, exactly as `remote-session-ended` does (`src/notifications.ts:24`, `:79`, `:134`). Lines are attributed to the sessions tab when it is open and to the active tab otherwise, since `notify` reads a tab label for the feed's provenance header (`:162`).

13. **Specs.** `product/specs/remote-server.md` (lifecycle and cleanup, the protocol-version list, and the out-of-scope entries for reconnect and for restoring a remote tab on `--relaunch`), `product/specs/connection.md` (one sentence pointing at the sessions tab for parked sessions), `product/specs/relaunch.md` (the reattach step), and `product/specs/notifications.md` (the new event) are updated in the same change; a new `product/specs/sessions-tab.md` describes the tab as `conversations.md` describes its list.

No dependency on another plan.

## Tests

Colocated, mirroring each area's conventions:

- `src/sessions/store.test.ts` — round trip; atomic rewrite; a malformed file read as empty rather than throwing; pruning a record older than the detach timeout; no clear registered (the state-directory registry's completeness assertions already fail a missing entry).
- `src/sessions/rows.test.ts` — the row set and ordering for a live channel, a channel mid-reconnect, a provisioning channel, a detached record with several processes, an ssh tab, and a navigator; indentation grouping; which actions each row offers; the trash button appearing only after a failed attempt.
- `src/sessions/manager.test.ts` — detach releases labels and sends no `shutdown`; detach refused while provisioning; reattach accepted opens one tab per reported process with recorded labels de-duplicated; an accepted reattach reporting no processes ends the session; a refused reattach marks it ended while a connection failure leaves it detached; end sends `shutdown` and drops the record; forget drops the record only; the change signal fires on each transition.
- `src/remote/manager.test.ts` — `open` with a recorded session id sends `reattach` instead of `provision`; `detach` closes the transport without `finish`'s frames.
- `src/remote/channel.test.ts` — output and exit frames for an unknown id are held and flushed in order when a listener attaches; overflow reports truncation; unclaimed frames are discarded.
- `src/remote/serve.test.ts` / `serve-processes.test.ts` — `session-state` answers one entry per live process with its program, mode, and harness/agent name, and an empty list once they have all exited.
- `src/remote/protocol.test.ts` — the new frames encode and decode; malformed variants are refused by name; the version constant is 15.
- `src/plugins/topics.test.ts` — the topic's `read`, `subscribe`, and each action, including refusal of an action naming a session or tab the view does not hold.
- `src/plugins/sessions/activate.test.ts` and `shared.test.ts` — registration and claims; the command's docking words and its usage rejection; intents including unknown-name and malformed-payload rejections; topic-driven `updateTab`; disposal; guards rejecting arrays, `null`, and incomplete rows.
- `src/message-handler.test.ts` — `remoteSession` routes both actions to the manager and answers invalid params with an error.
- `web/src/plugins/sessions/*.test.tsx` — lazy load and payload validation; the empty state; a row per kind and state; keyboard navigation and two-click open; each button raising its intent; both confirmations; the refresh button re-reading without a network call.
- `web/src/shared/AgentTabMeta.test.tsx` — the control renders only for a remote tab, is disabled while provisioning, and spins while in flight.

## Out of scope

- Anything that is not a remote client of this janissary: local agents, harnesses, shells, browser and sqlite connections.
- Changing how a remote launch starts (`on <address>` grammar, address validation, bootstrap, authentication).
- Changing the seven-day expiry or the 1 MB replay budget.
- Multiplexing independent workspaces onto one connection, and nested remoting — already out of scope in `product/specs/remote-server.md`.
- A saved directory of remote hosts, or completion over previously used hosts.
- Probing hosts on janissary's own initiative: nothing opens an ssh connection except a pressed reattach, a pressed end, or a `--relaunch` restore.
- Arbitrating two janissary instances reattaching one peer (decision 34).
- Any change to `connection list`, the connections panel, or `connection close ssh:<id>`.
- Restoring remote file navigators on a reattach.
- A sessions row for a remote tab's ACP session as a thing of its own; it belongs to the agent tab's row.

## Verification

`$janissary/scripts/run.mjs check-diff` after each step.

Manual: launch `harness claude on <host>`, join an agent from the metadata row's ➕, and open a remote file navigator over that workspace. Open `sessions` and confirm three rows, the two joined ones indented under the harness, each with the expected kind, state, and actions. Press detach on the harness row, confirm the dialog, and confirm all three tabs close, the row moves to detached, and `janus remote-serve` plus the workspace are still alive on the far host. Press reattach: confirm the harness tab opens first carrying the ssh session, the agent tab follows, the navigator does not, and the rows return to active. Detach again, quit janissary, relaunch with plain `janus`, and confirm the row is still listed as detached; press reattach and confirm the same tabs come back with their recorded labels. Detach once more and relaunch with `janus --relaunch`, confirming the peer comes back without pressing anything. Finally, detach, stop the far-side `janus remote-serve` by hand, press reattach, and confirm the row reads ended with its notification — then, with the host powered down or unreachable, confirm the row stays detached and the trash button appears.
