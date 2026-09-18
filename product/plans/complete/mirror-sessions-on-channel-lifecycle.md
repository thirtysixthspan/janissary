# Mirror the session record on channel lifecycle, not on reads

Issue: the remote-session record is only written when the sessions tab is composed.

Complexity rating: 6/10

## Goal

The pull request body says the record "is written as a *mirror* of what is live rather than through a separate 'remember this' step, so a session becomes reattachable the moment it has a workspace and something running in it, and there is no window a crash could land in".

The code does not do that. `SessionsManager.mirror` runs from `view()`, `view()` runs when the sessions topic is read, and the only emitter of the `sessions` bus channel is `SessionsManager.changed` — which the four row actions fire and nothing in `RemoteManager`'s lifecycle does. So a remote session launched while the sessions tab is shut, or launched after the tab was last redrawn, is never recorded at all; and an open list never notices a launch, a join, a close, or a transport loss until the user presses Refresh, which is worse than no list because it looks live.

Make the claim true: write the record when the live set moves.

## Approach

**Emit from the lifecycle.** `RemoteManager` gains one private emitter and calls it wherever the live set actually moves. The reviewer's list — the end of `open`, `attach`, `release`, `close`, `detach`, and `channelClosed` — covers the list's freshness but not the record's existence, because none of those moments is when a record first becomes writable. `recordOf` needs a session id, a workspace directory, *and* at least one spawned process, and for an ordinary `harness claude on devbox` the last of those arrives after all of them: `open` returns long before the handshake, and `workspace-ready` lands before the harness spawns anything. Emitting only where the reviewer named would leave the central case — a session launched with the tab shut — exactly as unrecorded as it is today.

So two more points are added. The `workspace-ready` frame handler emits, because that is when the workspace the record names comes into existence. And `RemoteChannel` gains an `onProcesses` handler, called when a `spawn` or `kill` frame goes out — the two moments `SessionRouter`'s spawned set changes — which `RemoteManager` wires to the same emitter. A process exiting reaches the manager through the existing `onSessionExit` handler and emits there.

`Reattach.lost` and `Reattach.accepted` emit too, so a row's `reconnecting` state moves on its own rather than at the next Refresh. `accepted` emits only when it was actually active, so `stop()`'s call on an already-settled entry is silent.

**Subscribe and mirror.** `SessionsManager` subscribes to the channel in its constructor and runs `mirror` on it, released in `dispose` beside the stamp clearing that is already there. `mirror` emits nothing itself, so a `changed()` raised by an action re-enters it once and stops; the extra walk finds nothing to write, since `mergeRemoteSession` is only reached when a record's description has actually moved.

**Frequency.** The bus comment for the channel calls it a named, low-frequency signal. That still holds and the comment now says why: these are per-channel and per-process transitions — a launch, a join, a spawn, an exit, a transport loss — not per-byte ones. The channel's output does not come through here, and `sameRecord` keeps a burst of transitions from becoming a write per event.

**File size.** `src/remote/manager.ts` sits eight effective lines under the limit, and the emitters need nine. `channelClosed` moves to a new `src/remote/manager-closed.ts` as a function over the entry table, the same extraction `manager-reports.ts` already established for this file.

## Implementation steps

1. Add `src/remote/manager-closed.ts` holding `remoteChannelClosed(managers, entries, entry)` — `channelClosed`'s body, taking the table it mutates — and point both call sites in `src/remote/manager.ts` at it.
2. Add `onProcesses?: () => void` to `RemoteChannel`'s handlers in `src/remote/channel.ts` and call it from `send` after a `spawn` is recorded or a `kill` forgotten.
3. In `src/remote/manager.ts`, add the private emitter and call it from `open`'s end, the `workspace-ready` frame case, `onSessionExit`, `onProcesses`, `attach`, `release`, `close`, `detach`, and the closed sweep.
4. In `src/remote/reattach.ts`, emit from `Reattach.lost` and from `Reattach.accepted` when it was active.
5. In `src/sessions/manager.ts`, subscribe to `sessions: changed` and run `mirror` on it; unsubscribe in `dispose`.
6. Update the channel's comment in `src/bus.ts` to say what its frequency rests on.

## Tests

In `src/sessions/manager.test.ts`:

- A live channel that spawns a process produces a record on disk with no call to `view()` at all — the assertion that the mirror is no longer a side effect of a read.
- A channel still provisioning produces no record when the signal fires, so the emitters have not weakened `recordOf`'s preconditions.

In `src/remote/manager.test.ts`:

- A launch emits the sessions signal once its workspace is ready and once its first process is spawned, and a joined tab, a release, and a lost transport each emit as well — the transitions the list has to notice without a Refresh.

In `src/plugins/topics.test.ts`:

- The sessions topic's subscription fires for a lifecycle event, not only for a row action, which is what makes an open list live.

`src/remote/manager.test.ts`'s existing cases cover every lifecycle path being instrumented and must keep passing unchanged.

## Out of scope

- Any change to what `recordOf` will and will not record; the preconditions are the previous entry's subject and stay exactly as they are.
- Throttling or coalescing the signal. `sameRecord` already keeps a burst from writing repeatedly, and a per-channel event is not frequent enough to need more.
- The row's activity column, which continues to move only when a record's description does.

## Specs and docs

- `product/specs/sessions-tab.md`: the refresh section says reachability is learned only by pressing reattach or end, which stays true; it gains that the list updates itself as sessions are launched, joined, released, and lost, so Refresh is for re-reading rather than for noticing.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents when the record is written.
