# Correct the version-15 protocol comment about a peer parked across a remote upgrade

**Complexity: 1/10** — ~6 changed comment lines in 1 file, 2 requirements, no behavior change (p=3.07)

The version-15 paragraph of the protocol comment in `src/remote/protocol.ts` (the one beginning "That check is narrower here than elsewhere, and deliberately so.") still ends by saying a peer parked across a remote upgrade announces 15, hands the session-state query to a 14 that refuses it by name, and that nothing in the handshake can see that, so the bounded wait in `askSessionState` is what catches it. This branch now refuses that peer at relay time instead, and the spec's matching paragraph was rewritten to say so.

## Verified against the code

- `relayPeer` in `src/remote/serve-detach.ts` reads the parked peer's record and, after the `missing`/`invalid`/dead-pid checks, ends with `ended(false)` for any live peer whose record's `version` differs from `REMOTE_PROTOCOL_VERSION` (an absent version included), so nothing is relayed and the session stays parked.
- A terminate attach branches to `terminatePeer` (`src/remote/serve-detach-terminate.ts`) before that version check: the relay never relays a terminate, and writes the peer only an `attach` carrying nothing but `session` and then a `shutdown`.
- The version-39 paragraph of the same comment already describes both of those, and the `product/specs/remote-server.md` paragraph beginning "The handshake check is narrower for an attach than for a launch" says each parked peer records its version, a mismatched or versionless peer is never relayed into, the attach reports a failure and the session stays parked, and the session-state query's bounded wait settles a peer that accepts an attach and then never answers.

## Goal

The version-15 paragraph, the version-39 paragraph and the spec paragraph describe the same mechanism: the relay's version check, not the session-state wait, is what keeps a peer parked across a remote upgrade from being reached.

## Approach

Keep the paragraph's opening, which explains that an attach's handshake is written by the freshly started relaying `janus remote-serve` and so binds the version installed now. Replace its last two sentences with ones saying each parked peer records the protocol version it speaks, `relayPeer` refuses to relay into a live peer whose record carries another version or none, so the attach reports a failure and the session stays parked, and the bounded wait in `askSessionState` remains for a peer that accepts an attach and then never answers. Leave terminate to the version-39 paragraph, which already covers it.

## Implementation steps

1. Rewrite the last two sentences of the version-15 "narrower" paragraph in `src/remote/protocol.ts` as described above.
2. Run `check-diff`.

## Tests

None: only a comment changes, and nothing tests a comment. Confirm by reading that the version-15 paragraph, the version-39 paragraph and the spec paragraph agree.

## Spec

No change: `product/specs/remote-server.md` already describes the behavior the corrected comment now matches.

## Out of scope

- Any code change in `src/remote/serve-detach.ts`, `src/remote/serve-detach-terminate.ts`, or `askSessionState`.
- Rewording the version-39 paragraph or the spec paragraph.
