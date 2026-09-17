# Remote peer shutdown frame

**Complexity: 5/10** — one new frame type threaded through the existing decode/encode/dispatch machinery three files already have a slot for, plus wiring it into a `finish()` that already sweeps everything else.

PR 1131 backlog item: *"Give the remote peer an explicit shutdown instruction so a deliberately closed remote session ends its far-side process instead of detaching for seven days."*

Today every local teardown of a remote session — `RemoteManager.closeAll`, `RemoteManager.release` losing its last label, and `RemoteManager.close` — ends the session by killing the local ssh transport. The far side reads that as SIGHUP and, since this PR's own change to `src/remote/serve.ts`, treats SIGHUP as "detach and wait" rather than "shut down": the peer process, its `.janissary/workspace/<label>` clone, and the forwarded `ProjectTokens` held in `RemoteProcesses`/`RemoteAcp` all survive for the full `REMOTE_DETACH_TIMEOUT_MS` (seven days). A deliberate local close has no way to tell the peer the difference between "the network dropped" and "the user is done."

## Design decisions

**A new terminal `ClientFrame` member, not a repurposed signal.** SIGHUP already carries "transport lost" and SIGTERM/SIGINT already carry "kill me now" for a directly-signalled process, but nothing in the existing `ClientFrame` union crosses the wire to say "shut down" the way `kill`/`acp-close`/`filesystem-close` say it for one process. A `shutdown` frame with no payload is the minimal addition: its presence is the entire message.

**Folded into the version-14 bump already in flight, not a new version.** This branch already moves `REMOTE_PROTOCOL_VERSION` to 14 for the reattach handshake. Adding `shutdown` to the same version is correct because both changes are unreleased together — there is no shipped version 14 peer yet that would need a sixteenth version to add this to. A version-13 peer already fails the handshake before any frame crosses, so it is never sent a frame it cannot decode.

**Sent from the one place that already sweeps everything else at teardown.** `RemoteChannel.finish()` already sends `kill` for every spawned process, `acp-close` for every ACP session, and `filesystem-close` for every navigator, right before it marks the channel closed. Every deliberate-close call site (`RemoteManager.release`'s last-label path, `RemoteManager.closeAll`, and `terminateRemoteEntry` in `src/remote/reattach.ts`) already calls `finish()` before `close()`. Sending `shutdown` from inside `finish()`, after the existing sweep and before the state flips to `closed`, means every one of those call sites gets it for free with no new call site to add or forget.

**Ordering relies on `send()` being synchronous, not on a flush.** `finish()` calls `this.send({ type: 'shutdown' })` and returns; the caller then calls `channel.close()`, which calls `transport.kill()`. Because both are plain synchronous method calls in single-threaded JS, the write into the transport (`src/pty.ts`'s `write`, which hands the string straight to the underlying `node-pty` write) always executes-before the later `kill()` call — there is no async gap between them for a signal to arrive out of order. No flush is added because there is nothing to flush: `node-pty`'s `write` does not buffer at this layer, and the write already returns before `finish()`'s caller reaches `close()`.

**Frame delivery when reconnecting is already tolerant.** `send()` silently no-ops non-`reattach` frames while `state` is not `attached` — the same is already true for the `kill`/`acp-close`/`filesystem-close` sends `finish()` performs. A `shutdown` sent while the channel is mid-backoff after a transport loss is dropped the same way; there is no live transport to deliver it over regardless, so this matches existing behavior rather than needing new tolerance.

**The far side treats it exactly like SIGTERM/SIGINT.** `RemoteServer.dispatch`'s `shutdown` case calls `this.shutdown(0)` directly — the same method the signal handlers call — so it kills every process, disposes ACP, and removes the workspace clone identically. No new cleanup path.

## Proposed changes

- **`src/remote/protocol.ts`** — add `| { type: 'shutdown' }` to the `ClientFrame` union with a one-line doc comment ("no payload: the far side removes its workspace and exits, exactly as SIGTERM does — sent by every local path that ends a session on purpose rather than losing its transport"), and `shutdown: true` to `CLIENT_FRAME_TYPES`. No version constant change — this rides the version-13 bump already in this branch.
- **`src/remote/frame-decode.ts`** — add `case 'shutdown': { return { type: 'shutdown' }; }` to `decodeKnownFrame`'s switch. No fields to validate.
- **`src/remote/channel.ts`** — in `finish()`, add `this.send({ type: 'shutdown' });` immediately after the `filesystem-close` sweep loop and before `this.state = 'closed';`.
- **`src/remote/serve.ts`** — add `case 'shutdown': { this.shutdown(0); return; }` to `dispatch`'s switch, beside the `reattach` case.

## Tests

- `src/remote/serve.test.ts` — a new case sends `{ type: 'shutdown' }` after `provision`/`spawn` and asserts `kill` was called on the spawned process, `exit` was called with `0`, and the workspace directory no longer exists — mirroring the existing SIGTERM/SIGINT assertions in the `preserves work on SIGHUP, then cleans up on %s` case.
- `src/remote/manager.test.ts` — extend `managerHarness` so the ssh transport's `write` mock is exposed alongside `kill`, then add two cases: releasing the last label writes the encoded `shutdown` frame to the transport before `kill` is called, and `closeAll` does the same.

## Out of scope

- A crashed local process never gets to call `finish()`, so it still relies on the seven-day `REMOTE_DETACH_TIMEOUT_MS` expiry — this fix narrows the leak to that case rather than eliminating it entirely, which the backlog entry's own risk assessment already states.
- Any change to the reattach frames, the SIGHUP/detach behavior, or the seven-day timeout value itself.

## Verification

```
$janissary/scripts/run.mjs check-diff
```

## Adaptation note (conflict resolution)

Rebasing onto `master` surfaced an independent `master` bump of `REMOTE_PROTOCOL_VERSION` to 13 (for `git-commit`) made while this branch was in flight, so this branch's own version-13 bump for reattach was renumbered to 14 to land after it. `shutdown` still rides that same bump — now 14 rather than 13 — for the same reason: both changes are unreleased together. The version numbers this plan names were updated in place to keep the prose accurate; the change itself is unaffected.
