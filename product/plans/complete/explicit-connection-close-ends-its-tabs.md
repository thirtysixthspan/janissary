# Explicit connection close ends its tabs quietly

Issue: an explicit connection close raises an unexpected-session-ended notification and leaves its tabs open.

Complexity rating: 3/10

## Goal

`connection close ssh:<id>` on a remote tab reaches `RemoteManager.close`, which now calls `terminateRemoteEntry` with announcing left on. Two things follow that the user did not ask for: a `remote-session-ended` notification reading `Remote janus on <host> ended — start a new agent or shell to continue.`, which describes a deliberate action as an unexpected loss and cannot be silenced because the event is classified as explicit; and every tab and navigator on the channel left open in an exited state instead of closing.

Restore the command's documented outcome — every tab and navigator holding the channel closes — and record nothing in the feed, because an end the user commanded is not news.

## Approach

Two specs disagree about this today, which is the decision the fix has to settle. `product/specs/connection.md` describes the user-facing command and says explicitly closing a remote tab's `ssh:` connection "closes every tab and navigator using it"; `product/specs/remote-server.md` says it "leaves its tabs showing the ended session". The command's own contract wins: a remote tab's `ssh:` row is separately closable precisely so that killing the channel closes the tab, which is what the comment in `src/connection/close.ts` already states is the whole point of the row. The `remote-server.md` sentence is the one that changed behavior without its command's spec following, so it is the one corrected.

`terminateRemoteEntry` in `src/remote/reattach.ts` already does everything the close needs — stops recovery, clears the workspace's file cache, sends the shutdown frames through `finish()`, and closes the channel — and already takes the `announce` flag that suppresses the notification. The one thing it does not do is the handler sweep that closes the tabs: it clears `entry.handlers` without calling them, and `channelClosed` in `src/remote/manager.ts`, which owns that sweep, returns early on an entry already marked closed.

Rather than duplicate the sweep, have `terminateRemoteEntry` return the handlers it cleared. Every existing caller ignores the value and is unaffected; `close` takes it and runs `onClosed()` on each after dropping the entry's labels from the table, in the order `channelClosed` uses. The creator's `onClosed` in `src/harness/remote-launch.ts` closes its tab once the workspace has settled, and `joinedHandlers` closes each joined tab and navigator, so one sweep covers the whole channel.

The redundant `entry.channel.close()` that `close` runs after `terminateRemoteEntry` — which closes the channel itself — goes away with the rewrite.

## Implementation steps

1. In `src/remote/reattach.ts`, change `terminateRemoteEntry`'s return type to `RemoteLaunchHandlers[]`: return an empty array on the already-closed guard, and otherwise capture `[...entry.handlers.values()]` before `entry.handlers.clear()` and return it. Note in its doc comment that the handlers are returned rather than called, so a caller that means to end the tabs can.
2. In `src/remote/manager.ts`, rewrite `close`: call `terminateRemoteEntry(this.managers, entry, false)`, delete every label of the entry from `this.entries`, clear `entry.labels`, then call `onClosed()` on each returned handler. Replace the doc comment, which currently claims the opposite of what the method did.

## Tests

In `src/remote/manager.test.ts`, beside the existing shared-channel cases:

- An explicit `close` on a channel with a joined tab records no notification — `notify` is not called — and calls `onClosed` on both the creator's and the joined tab's handlers.
- After that close, the channel is gone from the table for both labels (`get` returns undefined for each).
- The transport still receives a `shutdown` frame before it is killed, so the far side is genuinely ended rather than parked, distinguishing this path from `detach`.

The existing detach cases (`drops the transport without sending kill, acp-close, or shutdown`, `leaves the tab-close walk nothing to release`) pin the opposite path and must keep passing, as must `src/connection/close.test.ts`'s result-message cases.

## Out of scope

- `detach`, which deliberately leaves the peer running, and every other termination path — `endRemoteProcess`, `handleReattachResult`, and the automatic recovery — keep announcing exactly as they do.
- The `remote-session-ended` event's classification in `EXPLICIT_EVENTS`; the fix removes the misleading line rather than making it suppressible.
- `channelClosed`'s early return on an entry with a session id and a workspace, which is the recovery branch and stays.

## Specs and docs

- `product/specs/remote-server.md`: the lifecycle sentence about explicitly closing the shared connection is corrected to say the tabs close and nothing is announced.
- `product/specs/connection.md`: already describes the restored outcome; checked and left alone.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents the notification or the tabs' fate, so no update.

## Pull request description

The pull request's behavior examples gain the `connection close` outcome, since the command's result changed on this branch's lineage and the description does not mention it.
