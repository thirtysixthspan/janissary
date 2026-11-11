# ACP tool loop 25 — remove `acp-prompt` and `acp-end`, protocol version 40

**Complexity: 5/10** — 9 edited files, ~15 added lines, 6 requirements, 8 scenarios (p=5.35)

Run order: 25 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the deletion and version sentences of "Wire protocol", the "replaces `prompt`" sentence of "Far side", the "`onEnd`" sentence of "Local side"; decision 11). Depends on subplans 23 and 24 (`move-janissarys-acp-tool-loop-23-remote-loop-switch.md`, `move-janissarys-acp-tool-loop-24-remote-step-tags.md`), after which nothing sends `acp-prompt` or expects `acp-end`.

After subplan 23 no local code sends `acp-prompt`, and no far-side run ends in `acp-end`. This subplan removes both frames from the contract and every piece of code that handled them. It also makes the series' one protocol bump. The bump is what turns a mismatched peer into a clear handshake refusal rather than a remote tab that accepts prompts and runs no loop.

## Design decisions

- **This subplan owns the protocol bump.** `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` moves from 39 to 40, exactly once, here. This is the change that makes the contract incompatible with version 39, because the version-39 frames `acp-prompt` and `acp-end` leave the contract.
  - **Wire additions already covered.** The same bump covers every earlier wire addition in this pull request, which all landed under 39 with no bump of their own:
    - the `read-lines` filesystem operation (subplan 4);
    - the `acp-run` frame (subplan 14);
    - the `acp-tool-result` frame (subplan 15);
    - the `acp-turn` and `acp-run-end` frames (subplan 16);
    - the `acp-tool-request` and `acp-tool-step` frames (subplan 17).
  - **Nothing after it.** No later subplan in the series changes the wire. Anything added to the contract after this in the same pull request stays under 40 and must be named in this history paragraph.
- **History paragraph**, in the style of its predecessors:
  - **What changes.** Version 40 moves janissary's ACP tool loop onto the far side. `acp-run` carries the prompt and its per-prompt snapshot in place of `acp-prompt`. `acp-run-end` replaces `acp-end` as a run's terminal. The new frames exchange turns, chunks, caller-tool requests and results, and far-side steps. It also adds the read-only `read-lines` operation that backs a typed `file read` on a remote tab.
  - **Why it needs a bump.** A version-39 remote would accept prompts and run no loop at all, so workspace tools would never run where the workspace is, while both ends looked healthy. The exact-version handshake refuses that pairing.
  - **Parked peers.** A peer parked under 39 is refused at relay time by its peer record, as for every earlier bump.
- **Deletions.**
  - `acp-prompt`: its `ClientFrame` member, its `CLIENT_FRAME_TYPES` entry, its branch in `decodeAcpText`, its case in `decodeKnownFrame`, its base64 branch in `toWire`, its `RemoteServer.dispatch` case, `RemoteAcp.prompt`, and its `unavailableSend` case. The `acp-run` case from subplan 15 stays.
  - `acp-end`: its `ServerFrame` member, its `SERVER_FRAME_TYPES` entry, `decodeAcpEnd`, its case in `decodeKnownFrame`, its `dispatchAcp` case, and `onEnd` on `AcpSessionListener` with the adapter's handler for it.
  - **Stale comments.** Comments that describe the old per-prompt exchange as current are updated in the same change. Examples are the `RemoteAcp` class comment ("the local side sends prompts and gets reply text back") and the `createRemoteAcpSession` comment naming `runAcpToolLoop` as built on the session. The historical version paragraphs below 40 stay as written.
- **Both frames become unknown.** After the deletion `decodeFrame` answers `Unknown remote frame type "acp-prompt".` and the same for `acp-end`, like any other frame outside the contract.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Version constant and history | `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` |
| Frame unions and registries | `src/remote/protocol-frames.ts` |
| Decoders and dispatcher | `src/remote/frame/decode-acp.ts`, `src/remote/frame/decode.ts` |
| Far-side routing and holder | `RemoteServer.dispatch` in `src/remote/serve.ts`; `RemoteAcp` in `src/remote/serve-acp.ts` |
| Local routing, unavailable answers, adapter | `src/remote/channel/acp.ts`, `src/remote/channel/unavailable.ts`, `src/remote/acp-session.ts` |
| Parked-peer version refusal | `relayPeer` in `src/remote/serve-detach.ts` |

## Proposed changes

The deletions and the bump above, across these files. No new module.
- `src/remote/protocol.ts`
- `src/remote/protocol-frames.ts`
- `src/remote/frame/decode-acp.ts`
- `src/remote/frame/decode.ts`
- `src/remote/serve.ts`
- `src/remote/serve-acp.ts`
- `src/remote/channel/acp.ts`
- `src/remote/channel/unavailable.ts`
- `src/remote/acp-session.ts`

## Tests

- `src/remote/protocol.test.ts`:
  - `acp-prompt` and `acp-end` now decode as unknown frame types;
  - the version is 40;
  - a version-39 handshake is refused with a message naming both versions;
  - the `acp-prompt`/`acp-end` round-trip cases are removed or moved to their replacements.
- `src/remote/serve.test.ts`: the `acp-prompt` routing cases move to `acp-run`, and an `acp-prompt` frame is refused as unexpected.
- `src/remote/serve-acp.test.ts`: the remaining `prompt`/`acp-end` cases move to `run`/`acp-run-end`.
- `src/remote/channel/index.test.ts`: the `acp-end` dispatch case moves to `acp-run-end`, and the unavailable `acp-prompt` case is dropped.
- `src/remote/acp-session.test.ts`: any remaining `acp-end` expectation moves to `acp-run-end`.

## Out of scope

Any behavior change; this subplan only removes dead frames and bumps the version. Specs and docs (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, connect a remote shell tab to a host running the same build and run one `ask`; it answers. Connecting to a host still on version 39 is refused at the handshake with the version message.
