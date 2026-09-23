# Update the sessions list when an ssh tab opens or closes

## Complexity

3/10. Two small server-side signal sites plus a shared tab predicate. No wire, client, or plugin-contract change.

## Goal

A plain `ssh <destination>` tab opened or closed in another tab updates an open sessions list as it happens — including a docked list, which never regains focus and so never re-reads on its own.

## Approach

The sessions list is composed from three sources: the remote channels `RemoteManager` holds, the recorded parked sessions, and the plain `ssh` tabs `TabManager` holds. The first two already raise the low-frequency `sessions: changed` signal from their own lifecycles, which is what drives the plugin notification that rewrites the tab's payload. The third raises nothing at all, so an `ssh` row only ever appears or disappears when something else happens to move the list — or when the user presses Refresh, or returns to the tab, which is the path a docked list does not have.

Raise the same signal from the `ssh` tab lifecycle: once after the tab has been opened, and once after a closed tab has left `tabs`. The ordering on close matters — the list is read synchronously off the signal, so a signal raised while the closing tab is still in the array would recompose the list with the row it is meant to remove.

`isSshTab` — the `harness.name === 'ssh'` with a destination test — already exists privately in the sessions snapshot module and is now needed by the close path too, so it moves to `src/tab/view-guards.ts` beside the other tab predicates and both callers import it from there.

## Implementation

1. Move `isSshTab` from `src/sessions/snapshot.ts` into `src/tab/view-guards.ts` and import it back. Run `check-diff`.
2. Raise `sessions: changed` at the end of `SshManager.open`, beside the existing `state: dirty` emit. Run `check-diff`.
3. Raise `sessions: changed` in `closeTabOp` after the closing tab has been removed from `tabs`, and only when that tab was an `ssh` tab. Run `check-diff`.
4. Extend the `SessionsEvent` comment in `src/bus.ts` so the channel's documented sources include the `ssh` tab lifecycle. Run `check-diff`.

## Tests

- `src/tab/view-guards.test.ts`: `isSshTab` accepts an ssh harness tab and refuses a harness tab with no destination and a non-harness tab.
- `src/ssh-manager.test.ts`: opening an ssh tab raises `sessions: changed`; a rejected invocation raises nothing.
- `src/tab/manager.test.ts`: closing an ssh tab raises `sessions: changed`, and the tab is already gone from `tabs` when the signal is delivered; closing an ordinary tab raises nothing.

## Out of scope

Any change to what an ssh row shows or which actions it offers, the ssh row's activity stamp, other connection kinds that the sessions list does not list, the client's refresh-on-focus behavior, the PR title or description, and merging the PR.
