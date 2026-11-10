# Refuse to relay an attach into a parked peer that speaks another protocol version

**Complexity: 5/10** — ~15 added lines across 3 production files, but 8 requirements and 13 test scenarios on a security-sensitive relay path (p=5.30)

A remote claude role session reattached to a peer that was parked across a remote upgrade still starts with its built-in tools on. Protocol version 39 added `sessionMeta` to `acp-open`, and its comment in `src/remote/protocol.ts` and the "Protocol version 39" paragraph in `product/specs/remote-server.md` both say the exact-version handshake refuses a host that would drop it. That holds for a launch but not for an attach.

An attach's handshake is written by the freshly started `janus remote-serve`, which then relays bytes into the parked peer through `relayPeer` in `src/remote/serve-detach.ts`. The handshake therefore binds the version installed on the host now, not the version of the peer waiting behind it. A version-38 peer still answers `attach` (it is in the version-14 vocabulary) and `session-state` (version 15) normally, so the attach is accepted, the tabs are rebuilt, and the role `acp-open` reaches a version-38 decoder that silently drops `sessionMeta` and launches the Claude adapter with Read, Glob, Grep and the other permission-free built-in tools on.

## Verified against the code

- `relayPeer` reads the record with `readPeerRecord(peerRecordPath(root, session))`, checks only `missing`, `invalid` and `isPidAlive(record.pid)`, then `createConnection(record.socket)` and relays everything after its `attach` frame. Nothing about the peer's version is known on this path.
- `PeerRecord` in `src/remote/peer-record.ts` is `{ pid, socket, label? }`. It is written in exactly two places, both in `DetachedPeer` (`start` and `setLabel`). Its readers are `relayPeer`, `requestParkedCapture` in `src/remote/serve-detach-query.ts`, and `src/launch-name/leftover.ts`; the latter two read only `pid`, `socket` and `label`, so an extra optional field changes nothing for them.
- `RemoteServer.attach` in `src/remote/serve.ts` passes `relayPeer` an `ended(terminated)` callback: `terminated === true` emits `attach-result { accepted: false }` and exits 0, which the local side reads as "the session is over"; `terminated === false` emits nothing and exits 1. When `relayPeer` calls `ended` synchronously it returns `undefined`, so `this.relay` stays unset.
- The local side of a relay that exits without an `attach-result` (read in `src/remote/entry-factory.ts`, `src/remote/manager-closed.ts`, `src/remote/attach.ts`, `src/remote/resume.ts`, `src/harness/remote-launch.ts` and `src/sessions/attach.ts`):
  - A pressed attach from a sessions record creates an entry whose `workspaceDir` is not set until an accepted `attach-result` settles it, so the entry is not established. The ssh transport exiting reaches `remoteChannelClosed`, which rejects readiness with "Remote session to <host> ended before its workspace was ready." and runs the launch handlers' `onClosed`. For both the shell bridge and a harness attach (`startRemoteLaunch` in `src/harness/remote-launch.ts`) that calls `resume.onFailed(message)`, which `startSessionAttach` reports as `{ kind: 'failed' }`. `handleAttachResult` and `terminateRemoteEntry` are never reached, no `shutdown` frame is sent, and `dropTerminatedSessionRecord` is not called, so the record survives with its attach button and the peer stays parked.
  - An automatic reconnect of an established entry reaches `remoteChannelClosed` with `isEstablished(entry)` true and calls `entry.attach.lost()`, which schedules another retry with backoff. The tab stays in its reconnecting state and the session is never declared gone.
  - Neither path sends a single frame to the parked peer, because the relay never connects to its socket.

## Goal

A `remote-serve` relaying an attach refuses to connect to a live parked peer whose record does not carry this build's `REMOTE_PROTOCOL_VERSION` — including a record written before the version was stamped — and ends the relay through the non-terminal path, so the session stays parked rather than being declared gone, and no frame (in particular no role `acp-open`) ever reaches a peer that could decode it differently.

## Approach

The version a parked peer speaks is a fact only that peer's own process knows, and the record file it writes beside its socket is the one place a relaying process on the same host reads before connecting. Stamping the record with the writer's `REMOTE_PROTOCOL_VERSION` and comparing it in `relayPeer` closes the gap without a wire change: this is an on-host file contract between two processes under the same user, not a frame, so `REMOTE_PROTOCOL_VERSION` stays 39 and no network surface changes.

Fail closed: a missing version is a peer started by a build that predates the stamp, which is exactly the version-38 case, so it is refused the same way as a different version. The check sits after the existing `isPidAlive` check so a dead peer of any version is still reported as ended (its session really is gone) rather than parked forever behind a refusal; every existing check keeps its place and meaning.

`isPeerRecord` keeps accepting a record without `version` (a newer relay must still read an older record in order to refuse it as a mismatch rather than as an unreadable file, and `leftover.ts` and the capture query must keep reading them) but rejects a `version` that is present and not a safe integer.

## Implementation steps

1. `src/remote/peer-record.ts`: add `version?: number` to `PeerRecord`, extend the file's leading comment to name the protocol version the peer speaks, and have `isPeerRecord` require `record.version === undefined || Number.isSafeInteger(record.version)`.
2. `src/remote/serve-detach.ts`: import `REMOTE_PROTOCOL_VERSION` from `./protocol.js`; write `version: REMOTE_PROTOCOL_VERSION` in both `writePeerRecord` calls (`start` and `setLabel`, updating `setLabel`'s comment to say `pid`, `socket` and `version` are rewritten unchanged); in `relayPeer`, after the `isPidAlive` check, `if (record.version !== REMOTE_PROTOCOL_VERSION) { ended(false); return; }`, with a short comment saying why (the handshake bound the relaying build, not the parked one, and a peer under another version could decode the relayed frames differently, so it stays parked rather than being connected or declared gone). The file is 193 physical lines, with comments and blanks well under the 200-code-line limit; confirm with lint.
3. `src/remote/protocol.ts`: extend the version-39 comment to say that an attach's handshake is answered by the relaying process, so a peer parked under another version is refused at relay time by the version its peer record carries.
4. `product/specs/remote-server.md`: in the "Protocol version 39" paragraph, add that an attach into a session parked under another version is refused by the relaying server instead. Rewrite the sentences of the paragraph beginning "The handshake check is narrower for an attach than for a launch" that say an older peer refuses the query by name: the relaying server now compares the version the parked peer recorded when it started (or the absence of one) with its own and refuses to relay, the attach reports a failure (an automatic reconnect keeps retrying), and the session stays parked. Keep the bounded-wait sentences, rephrased so they no longer depend on the upgrade case.

## Tests

`src/remote/peer-record.test.ts`:

- A record round-trips with its `version`.
- A record with no `version` still reads as valid.
- A fractional or non-number `version` reads as invalid (two new `it.each` rows).

`src/remote/serve.test.ts`:

- `DetachedPeer.start` writes a record stamped with `REMOTE_PROTOCOL_VERSION`, and `setLabel` keeps the stamp.
- `relayPeer` against a live parked peer whose record has no version, an older version, or a newer version returns `undefined`, calls `ended` exactly once with `false`, and the peer's `receive` is never called; once the record carries the current version again, a relay is accepted with `attach-result { accepted: true }`, showing the peer stayed parked.
- `RemoteServer` relaying an attach (with `origin`, under the home-clone describe) into a peer whose record carries another version exits with 1 and writes no `attach-result` to either its frame sink or stdout.
- The existing "distinguishes a dead pid from a live unreachable peer" case keeps its dead-pid row unversioned (still reported ended) and stamps its unreachable-socket row with the current version, so it keeps testing the socket-close path rather than the new refusal.
- Every other existing attach case uses a record written by `DetachedPeer.start`, so it covers the matching-version path unchanged.

`src/remote/serve-detach-query.test.ts`:

- The existing `DetachedPeer.setLabel` case asserts the exact record after the label is stamped; it now expects `pid`, `socket` and `version` kept unchanged beside the label.

## Out of scope

- Telling the user why the attach failed with a version-specific message: the relay ends without a frame, exactly as for an unreadable record, so a pressed attach reports the existing "ended before its workspace was ready" failure. A dedicated frame would be a wire change and would repeat on every automatic-reconnect retry.
- The parked-capture query in `src/remote/serve-detach-query.ts`: it sends one `capture-request` and reads one reply, never relays an `acp-open`, and a version-14-or-later peer answers it the same way.
- Bounding the automatic reconnect's retries against a peer that will keep refusing: that is the existing behavior for every non-terminal relay end.
- Any change to `REMOTE_PROTOCOL_VERSION`, the handshake, or the frame union.
