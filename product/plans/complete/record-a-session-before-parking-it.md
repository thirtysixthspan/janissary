# Record a session before parking it

Issue: detaching a session janissary holds no record of parks an unreachable peer.

Complexity rating: 5/10

## Goal

`SessionsManager.mirror` — the step that writes the record for every live channel — runs only from `view()`. `act()` does not call it, so `runSessionAction` resolves `recordFor(session)` against whatever happens to be on disk. When nothing is, `detach` parks the peer anyway and answers `{ ran: true }` with no record.

Two ordinary paths reach that state. A detach raised from a tab's metadata row goes through `ControllerCore` straight to `SessionsManager.detach` without the list ever being composed. And a session launched or restarted while the sessions tab was closed has never had its record written at all.

The result is the exact failure the feature exists to end: the user presses the one control every remote tab carries, watches the tabs close as promised, and the session is gone. The peer holds its workspace and its processes on the remote host for the full seven-day expiry while janissary can neither list it nor reach it, and the only recovery is an ssh session and a manual kill.

## Approach

**Make the record current before the action runs, not only when the list is read.** `act()` calls `mirror()` first. `mirror` is already idempotent and already writes only when a record's description has actually moved, so the cost on an action that changes nothing is a walk of the live entries. Every verb benefits, not just detach: `end`, `reattach`, and `forget` all resolve a record by session id and all inherit a current one.

**Refuse a detach that cannot be recorded, before anything is dropped.** With the mirror in place a live channel that `RemoteManager.detach` would accept is always recordable, so this guard should never fire in practice — but the two conditions are computed in different modules and would drift silently, and the cost of the drift is an unreachable peer. `detach` in `src/sessions/actions.ts` returns `REFUSED` when it has no record, before calling `park`, so the transport is never dropped.

**Say why.** A control that does nothing when pressed is its own defect, so the refusal reports a line to the notifications feed naming the reason, in the user's terms. The three reasons are the three things `recordOf` declines for and they read differently: a workspace still being prepared, a host that never named the session, and a workspace with nothing running in it.

**Leave `recordOf`'s empty-process rule as it is, and write down why.** The reviewer asks whether a remote agent tab with a live ACP session but no shell should be recordable. It should not, and the reason is in the protocol: `session-state` is answered from `RemoteProcesses.states()`, which reports `spawn`ed processes only — an ACP session is not one. A peer holding nothing but an ACP session therefore answers an empty list, and `settleAccepted` in `src/sessions/reattach.ts` reads an empty answer as "nothing still running", closes the peer, and reports the session ended. Recording such a session would put a row on screen whose reattach button destroys the session it names, which is worse than the row's absence. The honest answer today is to refuse the detach and say so, which is what the guard above does. `recordOf`'s doc comment gains the third reason it declines for, which it does not currently mention at all.

## Implementation steps

1. In `src/sessions/manager.ts`, call `this.mirror()` at the top of `act`, with a comment saying that an action resolves a record and the record has to describe what is live *now*, not what the last read of the list saw.
2. In `src/sessions/actions.ts`, add a `detachRefusal(entry)` helper returning the user-facing reason for each of the three cases, and have `detach` report it and return `REFUSED` when `record` is undefined — placed before the `park` call, so nothing is dropped.
3. In `src/sessions/snapshot.ts`, extend `recordOf`'s doc comment with the empty-process case and the `session-state` reasoning behind it.

## Tests

In `src/sessions/manager.test.ts`:

- A detach with no call to `view()` first — the metadata-row path — parks the session and leaves a record on disk, asserted through `loadRemoteSessions()`. This is the case the suite currently masks, because every existing detach case composes the list first.
- After that detach, the row composes as `detached` rather than disappearing.
- A live channel whose `spawnedProcesses()` is empty refuses the detach: `RemoteManager.detach` is not called, no tab is closed, and a reason reaches `notify`.
- A channel still provisioning refuses with its own wording rather than the empty-workspace one, so the three reasons stay distinguishable.
- The existing ordering case, `takes the entry out of the table before closing any tab`, pins the order that must not move and composes no list — it passes only because the mirror now runs, which makes it a second proof of step 1.

## Out of scope

- Making `mirror` run on channel lifecycle events rather than on reads. That is a separate backlog entry and a larger change; this one makes the record current at the moment an action needs it, which is what the failure requires.
- Teaching `session-state` about ACP sessions, which is a protocol change and the only thing that would make an agent-only session genuinely reattachable.
- The metadata-row control's own spinner and its handling of a refusal, which is its own backlog entry; this one makes the refusal reportable, that one makes the control answer for it.

## Specs and docs

- `product/specs/sessions-tab.md`: the detach paragraph gains the second case in which detach is unavailable — a session with nothing running in its workspace, which cannot be listed afterwards — and the reporting section notes that a refused detach records its reason.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents detach's preconditions.
