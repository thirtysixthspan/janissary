# Restore the channel signal explanation and document the reattach frames

Issue: the comment explaining the remote channel signals was deleted rather than rewritten.

Complexity rating: 2/10

## Goal

`src/remote/serve.ts` used to carry three lines above `CHANNEL_SIGNALS` saying that SIGHUP is what a dropped ssh channel delivers and that all three signals meant one thing: the session is over, so the workspace clone goes with it. The branch replaced that behavior with its opposite in `wireShutdown` — SIGHUP now detaches and waits — deleted the comment, and put nothing in its place. What is left is a bare exported array and an unexplained special case on `SIGHUP`.

That is the single most consequential decision on the far side, and it is recorded nowhere near the code that implements it. A contributor reading `wireShutdown` is as likely to remove the branch as to keep it, which would silently reintroduce the destroy-on-disconnect behavior the feature exists to end.

The same file's protocol counterpart has a smaller version of the problem: `reattach` and `reattach-result` are the only members of either frame union in `src/remote/protocol.ts` with no doc comment, while both of their version-15 neighbours carry one.

## Approach

Write the replacement comment above `CHANNEL_SIGNALS` saying what the deleted one said and what changed: SIGHUP is what a dropped ssh channel delivers, and it now means detach-and-wait; SIGTERM and SIGINT still mean the session is over and the clone goes with it. The reason the two are no longer the same fact is the whole point and goes in explicitly — a lost transport is not evidence the user is finished, which is what the seven-day park in `serve-detach.ts` exists for, while a signal aimed at the process is.

Put the other half beside the `SIGHUP` branch in `wireShutdown`, where a reader meets the special case, rather than only at the constant. `RemoteServer.detach` gets the third piece it alone can state: that it falls back to `shutdown` when a relay is already attached, because a process relaying into someone else's parked peer has no workspace of its own to hold.

For the frames: `reattach` carries the session id the handshake announced when the peer was first created, and that id is the only credential the far side checks — `relayPeer` in `src/remote/serve-detach.ts` refuses any frame whose `session` does not match. `reattach-result` answers it, and the distinction that matters to `src/remote/reattach.ts` is that a refusal is terminal rather than retryable: it means that session is gone, not that the attempt failed. `truncated` says the peer's replay buffer overflowed while it waited.

## Implementation steps

1. Write the new comment above `CHANNEL_SIGNALS` in `src/remote/serve.ts`.
2. Add the matching note beside the `SIGHUP` branch inside `wireShutdown`.
3. Give `RemoteServer.detach` a doc comment covering the relay fallback.
4. Give `reattach` and `reattach-result` doc comments in `src/remote/protocol.ts`, at the density of the `session-state` pair beside them.

## Tests

No behavior changes and no new tests. `src/remote/serve.test.ts`'s signal cases already pin the behavior being described — SIGHUP detaching, SIGTERM and SIGINT shutting down — and must keep passing.

## Out of scope

- The version-15 paragraph in `src/remote/protocol.ts`, which makes a claim about the handshake catching a version-skewed peer that a later backlog entry is about; it is not touched here.
- Every other frame in either union, all of which already carry what they need.
- Any change to what the signals do.

## Specs and docs

No behavior changes, so no spec or documentation update. `product/specs/remote-server.md` already describes the seven-day park and the deliberate-end distinction these comments explain.
