# Let a sessions-tab terminate shut down a peer parked under another protocol version

**Complexity: 6/10** — ~60 added lines across 8 production files, 12 requirements and 10 test scenarios on the security-sensitive relay path (p=6.14)

The relay version refusal added on this branch (`relayPeer` in `src/remote/serve-detach.ts` ends with `ended(false)` for any live peer whose record's `version` is not `REMOTE_PROTOCOL_VERSION`) also refuses the attach a sessions-tab **Terminate** opens only to send `shutdown`. After a remote upgrade every session parked before it reports "could not be terminated: The connection to <host> closed." while its peer keeps its processes, its workspace clone and its label for up to the seven-day detach timeout, and **Forget** only drops the local record.

## Verified against the code

- `terminateParkedSession` in `src/sessions/terminate-session.ts` opens a channel through `managers.remote.create` with a `RemoteResume` and, once `onResult` reports accepted, calls `managers.remote.close(label)`, whose explicit-close path sends `shutdown`. Nothing in the resume marks it as a terminate, so the `attach` frame the `onAttached` branch of `createRemoteEntry` (`src/remote/entry-factory.ts`) sends is the same `{ type: 'attach', session, restore: true, origin? }` a pressed attach sends.
- `RemoteServer.attach` in `src/remote/serve.ts` passes `frame.restore` to `relayPeer`; on a refused mismatch `ended(false)` emits nothing and exits 1, so the local side sees the ssh transport close with no `attach-result` and the terminate settles as not terminated.
- Once `relayPeer` returns a socket, `RemoteServer.receive` writes every later stdin chunk straight to it. That is the path the version gate exists to close: anything the local side sends, in particular a role `acp-open`, would reach the parked peer's decoder.
- `origin/master` still speaks `REMOTE_PROTOCOL_VERSION = 38`; version 39 was introduced on this branch and has never shipped, so a new optional `attach` field is recorded under version 39 rather than a bump to 40.
- The parked peer's pre-attach classifier (`classifyPreAttachFrame` → `decodeAttach`) has accepted `{ type: 'attach', session }` and a bare `{ type: 'shutdown' }` since the detach vocabulary existed; master's `decodeAttach` reads only `session`, `restore` and `origin`. Both are therefore decodable by every peer old enough to write a peer record at all.
- `DetachedPeer.accept` answers an accepted attach with `attach-result` first and only then replays history and pending frames; whatever follows the attach line is handed to the peer's `receive`, which is its own `RemoteServer.receive`, so a `shutdown` line written after the answer stops it exactly as a local `shutdown` does today.

## Goal

A sessions-tab terminate reaches a parked peer whatever protocol version its record carries (or none) and shuts it down, while the version gate stays fail-closed: a non-terminate attach into a mismatched peer is still refused with `ended(false)`, a terminate writes nothing to the peer but an `attach` in the oldest encoding and a `shutdown`, nothing the local side sends is relayed, and the pid is never signalled.

## Approach

Carry the intent on the frame. The `attach` client frame gains an optional `terminate: true`; `RemoteResume` gains the same optional field, `terminateParkedSession` sets it, and `createRemoteEntry` sends it on that entry's attach. The relaying `remote-serve` speaks the current version (the handshake guarantees it), so it is the one that reads the field.

A terminate attach is never relayed, whatever the peer's version: the relaying process writes the two frames itself. Handling the matching-version terminate the same way keeps one terminate path rather than two and is strictly narrower than today, where a matching peer's terminate relays the local side's frames. In a new module `src/remote/serve-detach-terminate.ts`, `terminatePeer(socketPath, session, output, ended)` connects to the record's socket and writes `{"type":"attach","session":"<id>"}` only — no `restore`, no `origin`, no `terminate` — then waits for the first line the peer answers. That line is forwarded to stdout unchanged (it is the `attach-result` the local terminate waits for); if it decodes as an accepted `attach-result`, `{"type":"shutdown"}` is written. Either way the socket's writable side is then ended, so even a stray write after the answer cannot reach the peer, and everything else the peer sends (its history replay) is dropped rather than forwarded. A first line longer than a bounded budget destroys the socket. `close` reports `ended(false)` like the ordinary relay.

`relayPeer` takes a `terminate` flag and branches to `terminatePeer` after the `missing`/`invalid`/dead-pid checks (so a dead peer is still reported as ended) and before the version check. `RemoteServer` records `terminating` from the frame and, while a relay is in place, drops every stdin chunk instead of writing it to the relay socket, closing the window between connecting and the peer's answer.

Nothing uses `process.kill(record.pid, …)`: a recycled pid would signal an unrelated process, while the socket binds the request to the peer that wrote the record.

## Implementation steps

1. `src/remote/protocol-frames.ts`: add `terminate?: true` to the `attach` client frame and extend its comment to say a terminate is never relayed — the relaying server writes the attach and a `shutdown` itself, for a peer parked under any version.
2. `src/remote/frame/decode-lifecycle.ts`: `decodeAttach` accepts `terminate` only when absent or `true`, and carries it through.
3. `src/remote/resume.ts`: add `terminate?: true` to `RemoteResume` with a one-line comment.
4. `src/remote/entry-factory.ts`: the `onAttached` attach frame spreads `terminate: true` when `resume?.terminate` is set.
5. `src/sessions/terminate-session.ts`: set `terminate: true` on the resume it passes to `managers.remote.create`.
6. `src/remote/serve-detach-terminate.ts` (new): `terminatePeer` as described above, with a comment naming why the frames it writes use the oldest encoding.
7. `src/remote/serve-detach.ts`: `relayPeer` gains a `terminate = false` parameter and returns `terminatePeer(record.socket, session, output, ended)` before the version check; update the version-check comment to say a terminate is the one attach that still reaches a mismatched peer.
8. `src/remote/serve.ts`: add a `terminating` field set from `frame.terminate === true` in `attach`, pass `frame.terminate` to `relayPeer`, and in `receive` drop chunks while `terminating` instead of writing them to the relay.
9. `src/remote/protocol.ts`: extend the existing version-39 comment (no bump) to say version 39 also adds `terminate` to `attach`, and that the relay answers a terminate for a peer under any version by writing only an `attach` in the oldest encoding and a `shutdown`, never relaying what the local side sends.
10. `product/specs/remote-server.md`: extend the "Protocol version 39" paragraph with the terminate marker, and the paragraph beginning "The handshake check is narrower for an attach than for a launch" with the terminate exception; add a sentence to the "A session can be terminated for good" paragraph that this works for a session parked under another version.

## Tests

`src/remote/serve.test.ts` (relayPeer, under "detached peer rendezvous"):

- A terminate into a raw fake peer (a socket server recording every byte, record carrying no version) that answers an accepted `attach-result`: the bytes it receives are exactly `{"type":"attach","session":"<id>"}\n{"type":"shutdown"}\n`, the attach line has only `type` and `session`, the answer is forwarded and a later replay line is not, a write to the returned socket afterwards never reaches the peer, `ended(false)` follows, and `process.kill` is never called with a non-zero signal.
- The same fake peer answering `accepted: false` receives only the attach line, and the refusal is forwarded.
- `it.each` over a real `DetachedPeer` whose record carries no version, an older version, a newer version and the current version: a terminate's peer `receive` sees exactly the `shutdown` line, the output is exactly one accepted `attach-result` (the transcript held while parked is not forwarded); for the mismatched rows, a non-terminate `relayPeer` into the same peer still returns `undefined` with `ended(false)`.

`src/remote/serve.test.ts` (RemoteServer, under the home-clone relay describe):

- A terminate attach (with origin) into the home-clone peer whose record carries an older version forwards an accepted `attach-result` to stdout; a role `acp-open` the local side sends afterwards never reaches the peer, whose `receive` sees only `shutdown`.

`src/remote/protocol.test.ts`:

- `attach` with `terminate: true` round-trips; `terminate: false` and `terminate: 'true'` are malformed.

`src/sessions/terminate-session.test.ts`:

- The resume a terminate opens carries `terminate: true`.

`src/remote/manager.test.ts`:

- A resume carrying `terminate: true` sends an attach frame with `terminate: true`; the existing ordinary-resume cases keep asserting an attach without it.

The existing mismatch cases, the matching-version attach cases, `src/remote/serve-detach-query.test.ts` and `src/remote/peer-record.test.ts` keep passing unchanged.

## Out of scope

- The second branch-backlog entry (the version-15 comment in `src/remote/protocol.ts`).
- Signalling the parked peer's pid, or any terminate path that bypasses its socket.
- Bumping `REMOTE_PROTOCOL_VERSION`: version 39 has not shipped.
- A version-specific notification when an ordinary attach is refused at relay time.
- User documentation: the sessions page already says **Terminate** stops a parked session for good, which is what it now does after an upgrade too.
