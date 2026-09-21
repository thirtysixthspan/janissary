# Settle a reattach whose peer never answers session-state

Issue: an accepted reattach hangs forever when the peer never answers session-state.

Complexity rating: 5/10

## Goal

`askSessionState` returns a promise resolved only by an inbound `session-state-result`. There is no timeout and no resolution when the channel closes, so `settleAccepted` awaits forever and `startSessionReattach`'s promise never settles.

The pull request body says this cannot happen — "a version-14 peer recognizes neither frame, so the mismatch is refused at the handshake" — and the relay architecture cannot give that guarantee. The handshake is answered by the freshly started `janus remote-serve` that relays into the parked peer, not by the parked peer itself. A remote host whose `janus` was upgraded while a session sat detached therefore announces version 15 and then hands the query to a version-14 process that refuses it by name.

The reattach hangs with its placeholder tab open and its record showing neither a failure nor a trash button, so the row offers a button that hangs again every time it is pressed, each attempt leaving another unresolved promise and another ssh connection behind. The same hang is reachable with no version skew at all, whenever a peer accepts and then stops answering.

## Approach

**Give the query two exits besides the answer.** `askSessionState` resolves `undefined` on a bounded deadline and on the entry closing, which is distinguishable from the empty list — and the distinction matters, because an empty list means the session is over and no answer means nothing was established. That is exactly the difference between the row becoming `ended` and the row staying parked with its reattach button, which is the contract `product/specs/sessions-tab.md` already states.

The deadline is 30 seconds. It bounds a query on an already-authenticated channel — the ssh connection is up and the peer has already accepted the reattach, so what is being waited on is one frame from a local process on the far host. The reconnect backoff's own 15-second connect deadline is the nearest neighbour and this is deliberately looser, since a peer under load answering slowly should not be called dead.

**Resolve when the transport goes.** `answerSessionState` already owns the resolver. A `cancelSessionState(entry)` beside it resolves any waiter with `undefined`, called from both `terminateRemoteEntry` and `detachRemoteEntry` — the two ways an entry stops being able to answer. Without it a channel that dies mid-query waits out the full deadline for something that can never arrive.

**Map either exit to a failure.** `settleAccepted` returns `{ kind: 'failed' }` with a reason naming the host, so the reason reaches the row through the existing `apply` path and the trash button is earned the way the spec describes.

**Correct the version paragraph.** Both `src/remote/protocol.ts` and `product/specs/remote-server.md` promise a guarantee the relay architecture cannot give. Both are rewritten to say what is true: the handshake check binds the relaying process, and a peer parked across a remote upgrade is caught by the timeout instead.

## Implementation steps

1. In `src/remote/resume.ts`, add `SESSION_STATE_TIMEOUT_MS`, have `askSessionState` return `Promise<RemoteProcessState[] | undefined>` with a deadline, and add `cancelSessionState`.
2. In `src/remote/reattach.ts`, call `cancelSessionState` from `terminateRemoteEntry` and `detachRemoteEntry`.
3. In `src/sessions/reattach.ts`, have `settleAccepted` map `undefined` to `{ kind: 'failed' }`.
4. Rewrite the version-15 paragraph in `src/remote/protocol.ts`.

## Tests

A new `src/sessions/reattach.test.ts`, since `startSessionReattach` has no suite of its own:

- An accepted reattach whose peer never answers settles as failed once the deadline passes, with a reason naming the host.
- One whose channel is terminated mid-query settles as failed without waiting out the deadline.
- An answer that arrives normally still reattaches, so the deadline has not broken the ordinary path.
- An empty answer still ends the session rather than failing — the distinction the `undefined` exists to preserve.

`src/remote/serve.test.ts`'s `session-state` cases cover the answering side and must keep passing.

## Out of scope

- Bounding the reattach's own connection, which the reconnect deadline already covers.
- Making a version-skewed relay detectable, which would need the parked peer's version carried through the relay — a protocol change, and the timeout is the honest answer until then.
- The placeholder tab's fate on a failed reattach, which the launch failure path already owns.

## Specs and docs

- `product/specs/remote-server.md`: the version-15 paragraph is corrected — the handshake binds the relaying process, and a peer parked across a remote upgrade is caught by the bounded wait.
- `product/specs/sessions-tab.md`: already says a timeout establishes nothing and leaves the row parked, which is what this makes true; checked, no change.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents the query.
