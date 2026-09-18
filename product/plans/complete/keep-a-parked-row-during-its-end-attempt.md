# Keep a parked session's row on screen while its end attempt runs

Issue: a parked session's row disappears while its end attempt is running.

Complexity rating: 5/10

## Goal

`endParkedSession` opens a `RemoteManager` entry under the synthetic label `end-session:<session>` with the record's session id set as the channel's. `SessionsManager.snapshot` treats every live entry's session id as live and filters the matching record out of `detached`, while `channelOf` finds no tab for that label and yields a member-less group that `composeSessionRows` drops. So pressing End removes the row entirely for as long as the attempt lasts — and `product/specs/sessions-tab.md` says the opposite for the failure case: "the row stays parked with its failure reported".

The user confirms a destructive action and the row vanishes with no indication anything is happening. A slow or unreachable host reads as a completed end; minutes later the row reappears holding a workspace the user believed was destroyed. In the meantime nothing stops them pressing End again on a second copy of the row, or opening a second ssh connection to the same peer — `RemoteManager.open` overwrites the entry under the same label, so the first connection is leaked.

## Approach

**Stop the end channel counting as a live session.** The `end-session:` prefix is already the marker: `endLabel` mints it and nothing else uses it. `snapshot()` skips entries whose labels are all that prefix when building both `live` and `channels`, so the record keeps producing its detached row and no member-less group is composed. Recognising the prefix in one predicate beside `endLabel` — exported from `end-session.ts`, where the label is minted — keeps the two from drifting.

**Show the attempt rather than hiding it.** The row view already carries `failure`, so an `ending` flag is a one-field addition along the same path: `SessionActionResult` gains `ending`, the manager keeps an in-flight set beside `failures`, `SessionDetached` carries it, and `detachedRows` puts it on the row. The set is cleared in `apply` whichever way the attempt settles, since a flag left set outlives the attempt and leaves the row permanently claiming to be mid-end.

`end` in `src/sessions/actions.ts` raises the flag synchronously — before the promise is awaited — so the row never renders without it. Its `apply` at the end clears it.

**Disable the destructive buttons on an in-flight row.** `SessionRowActions` already has the shape for this in its `provisioning` case: `end` and `reattach` are not pressable while `ending` is set. That is what closes the double-press path, which today leaks an ssh connection every time.

The flag crosses to the client through `RemoteSessionView` and the plugin's own `SessionRow` contract, whose guard gains the optional boolean.

## Implementation steps

1. In `src/sessions/end-session.ts`, export `isEndSessionLabel(label)` beside `endLabel`.
2. In `src/sessions/manager.ts`, skip end-session entries when building `live` and `channels` in `snapshot()`; add the `ending` set, apply `result.ending` and `result.endingDone`, and carry the flag onto each `SessionDetached`.
3. In `src/sessions/actions.ts`, add `ending`/`endingDone` to `SessionActionResult` and raise the flag from `end` before the attempt, clearing it in each settled branch.
4. In `src/sessions/rows.ts`, carry `ending` through `SessionDetached` onto the row.
5. In `src/protocol/sessions.ts` and `src/plugins/sessions/shared.ts`, add the optional field and its guard.
6. In `web/src/plugins/sessions/SessionRowActions.tsx`, disable `end` and `reattach` on a row whose attempt is in flight.

## Tests

In `src/sessions/manager.test.ts`:

- A record whose end attempt has not settled still composes a detached row, rather than disappearing — the defect itself.
- That row carries the in-flight marker while the attempt runs.
- Once the attempt fails, the row carries its failure and no longer claims to be ending.
- Once it succeeds, the row is gone because the record is.

In `web/src/plugins/sessions/SessionList.test.tsx`:

- An in-flight row's `end` and `reattach` buttons are not pressable.

`src/sessions/rows.test.ts`'s existing detached-row cases and the end cases in `manager.test.ts` that mock `endParkedSession` must keep passing.

## Out of scope

- What `endParkedSession` does on the wire, which is unchanged.
- The `ended` row and the `forget` verb, neither of which is in flight by nature.
- A timeout on the end attempt itself: an unreachable host settles through the channel's own failure path, and bounding that wait is a separate question from showing it.

## Specs and docs

- `product/specs/sessions-tab.md`: the end paragraph gains that the row stays on screen while the attempt runs, marked as ending, with its destructive controls not pressable until it settles.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents the end flow's intermediate state.
