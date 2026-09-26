# Encode remote navigator file contents once

Backlog: technical debt — "Stop encoding navigator file contents twice on the remote wire by removing the frame codec's content special cases, so the port layer's base64 is the only encoding."

Complexity rating: 4/10

## Goal

File bytes were base64-encoded by the remote filesystem port and then encoded again by `toWire`, which re-encoded any `filesystem-reply` result carrying a string `content` field by sniffing its shape rather than by the operation's contract. The decoder undid one layer by mutating a cast argument object. Transfers carried about a third more bytes than needed, any future result with a `content` string would be silently re-encoded, and the protocol tests round-tripped plain text production never sends.

## Approach

- `src/remote/protocol.ts`: remove the `write-file` and `filesystem-reply` branches and `isContentResult` from `toWire`; bump `REMOTE_PROTOCOL_VERSION` to 22 with a comment in the file's per-version style.
- `src/remote/frame-decode-filesystem.ts`: remove the `write-file` mutation and `decodeContentResult`; base64 ASCII is already JSON-safe.
- The port (`RemoteFileSystemPort`), the `write-file` operation and `RemoteFileNavigators.readFile` keep their single base64 layer unchanged.

A version-21 peer is refused at the handshake rather than misreading the frames — the intended outcome, and a compatibility break a mixed-version host pair will hit.

## Tests

- `src/remote/protocol.test.ts`: the `write-file` request and `filesystem-reply` fixtures carry base64 content, as production sends; the version assertion is 22; new cases send all 256 byte values through `encodeFrame` and `decodeFrame` in both directions and check the wire carries the port's base64 verbatim.
- `src/file-navigator/remote-port.test.ts` (binary round trip), `src/remote/serve-file-navigator.test.ts` and `src/remote/file-navigator-refusal-contract.test.ts` keep passing.

## Out of scope

- Any other payload's encoding (`output`, `transcript`, ACP text, captures).

## Specs and docs

- `product/specs/remote-server.md`: a version-22 paragraph in the protocol history — contents cross once encoded, and a version-21 remote is refused.
- `documentation/user-documentation/advanced-agents/remote-agents.md` already documents the version-mismatch message generically; `help.md` does not cover it. No edit.
