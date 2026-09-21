# Offer detach on the rows that survive their launching tab's closure

**Complexity: 4/10** — one pure function gains a case (`src/sessions/rows.ts`), its colocated tests, and one harness extension in `src/sessions/manager.test.ts`. No protocol, manager, action, or web change: the authorization (`SessionsManager.offers`), the action path (`runSessionAction` resolves the entry by any label it holds), and the web's action rendering are all already generic over the row's own action list.

## Goal

Per the PR backlog entry: "Offer the park-and-return path on the rows that survive their launching tab being closed, which today can only ever be destroyed."

A remote session's channel-level verb lives on its launching row alone (`liveActions` in `src/sessions/rows.ts` keys on the launching label), but the launching tab can be closed while joined tabs keep the channel alive — `RemoteManager.release` carries the entry on a surviving label — so the remaining rows offer only `focus` and `close`, and the only way to leave a healthy shared connection is destroying it: closing the last tab sends `finish()`, killing every process and removing the remote workspace.

**Verified starting facts.** `channelOf` in `src/sessions/snapshot.ts` builds members from the entry's label set, dropping labels whose tab has closed — so `entry.workspaceLabel`'s name may appear in no member. `RemoteManager.detach` (`src/remote/manager.ts:208`) refuses nothing for a joined label: it takes the whole entry out of its table, withholding `finish()`'s frames. `detach` in `src/sessions/actions.ts` already resolves the entry by any label in `entry.labels` and closes every surviving tab the entry held. `src/sessions/rows.test.ts` pins a launching row's action set and a joined row's, both with the launching member present — they must keep passing.

## Approach

**When the launching member cannot be presented, its channel verbs move to the surviving rows.** In `liveRows`, a channel whose `launchLabel` matches no member is detected once, and every row of that channel is then granted the launching action set — `['focus', 'detach']`, plus `reattach` while reconnecting. Any member earning them is by definition a survivor, and detached-style precedence (reattach on any row) already exists as the model: the rows are a view of one channel. `detach` is the park-and-return path; `end` stays off live rows — its contract operates on a parked record, and the live channel's destroy path is the existing `close`.

## Implementation steps

1. In `src/sessions/rows.ts` `liveRows`, compute `launchAbsent` (no member's label equals `channel.launchLabel`) and pass it into `liveActions` as part of the launching decision. Update the `liveActions` doc comment: the channel-level verbs live on the launching row because a detach acts on the whole channel, and on a channel that cannot present its launching row they belong on every surviving row.
2. No change to `snapshot.ts`, `manager.ts`, `actions.ts`, or the web plugin — verify each reads only what already flows through the rows.

## Out of scope

- `end` on live rows (see Approach).
- A `launching`-with-members-missing session state: the row's state continues to describe the channel (active/provisioning/reconnecting), not the missing member.
- `SessionChannel` type change: `launchAbsent` is derived from members in `liveRows`, so no field is added.

## Tests

- `src/sessions/rows.test.ts` (new describe block, mirroring existing channel cases): a channel whose launching member is absent grants `['focus', 'detach']` on its surviving row; the same channel while `reconnecting` grants `['focus', 'reattach', 'detach']`; a channel with the launching member present keeps joined rows at `['focus', 'close']` (regression — pinned by the existing cases and re-asserted).
- `src/sessions/manager.test.ts`: with the launching tab closed (`byLabel('claude')` → undefined) and a joined tab live, `offers('detach', { label: 'bekir' })` authorizes; raising detach on the surviving row calls `remote.detach` before any `closeTab`, parks without `finish()`'s frames (the ordering the existing detach tests pin), and leaves the record in place so the row becomes detached.
