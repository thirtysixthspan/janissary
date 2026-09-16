# Clear a remote workspace's file cache only when its session ends

**Complexity: 4/10** — move one call, drop an unused parameter, split one test into two.

PR 1131 backlog item: *"Clear a remote workspace's local file cache only when its session has actually ended, not when any one of its processes exits."*

`endRemoteSession` in `src/remote/reattach.ts` calls `clearRemoteFileCacheForWorkspace` on every invocation, and `endRemoteProcess` calls `endRemoteSession` for each individual remote shell or harness exit — so a single process ending on a channel that still has other live tabs and file navigators wipes the whole workspace's cache under `.janissary/remote-files/<host>/<workspaceLabel>`, even though the plan at `product/plans/complete/survive-laptop-sleep-and-resume.md` states the clear "runs here and only here," meaning the terminal path (`terminateRemoteEntry`) alone.

## Design decision

**Move the clear from `endRemoteSession` to `terminateRemoteEntry`, unconditionally.** `endRemoteSession` marks and notifies the tabs it is given; it has no way to know whether the whole session is ending or just one process on it, since both `endRemoteProcess` (one label) and `terminateRemoteEntry` (every label, when announcing) call it. `terminateRemoteEntry` is the one function that represents genuine termination — its own `if (entry.closed) return;` guard means it runs at most once per entry — so it is the only correct place for the clear, and it needs to run there whether or not this particular termination announces (`announce` only controls the notification, not whether the session actually ended). Dropping the clear out of `endRemoteSession` removes its only use of the `workspaceLabel` parameter, so the parameter is removed from its signature along with both call sites.

`RemoteManager.channelClosed`'s own `clearRemoteFileCacheForWorkspace` call is untouched — it is a separate terminal path (a channel with no session id, predating reattachment) that already clears exactly once at its own true end.

A cache entry can now outlive one process's end by however long the channel's other tabs stay live — checked against `src/file-navigator/remote-file-cache.ts`, which has no other lifecycle hook and is a plain on-disk cache keyed by workspace, so this is the correct direction: the cache should track the workspace's actual lifetime, not any one process using it.

## Proposed changes

- **`src/remote/reattach.ts`** — remove the `clearRemoteFileCacheForWorkspace` call from `endRemoteSession` and the now-unused `workspaceLabel` parameter from its signature; update its doc comment to state it does not touch the cache. Update both call sites (`endRemoteProcess`, `terminateRemoteEntry`) to drop the now-removed argument. Add `clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel)` to `terminateRemoteEntry`, unconditional on `announce`.

## Tests

- `src/remote/reattach.test.ts` — the existing `it.each([true, false])('reports a terminated process with harness=%s and never recreates it', ...)` case has only one tab on the channel, so it still terminates and the cache still clears exactly once; its existing assertion needs no change. Add a new case beside it with a second live tab attached to the same channel (via `RemoteManager.attach`, matching the pattern `src/remote/manager.test.ts`'s joined-tab fixtures use): deliver the same `spawn`/`kill`/`exit` sequence for one tab's process, and assert `clearRemoteFileCacheForWorkspace` is **not** called while the second tab stays live and the channel remains open (not `closed`).

## Out of scope

- `RemoteManager.channelClosed`'s own cache-clear call — a distinct, already-correct terminal path untouched by this fix.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
