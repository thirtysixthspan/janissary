# ACP tool loop 25 — remove `acp-prompt` and `acp-end`, protocol version 40

**Complexity: 5/10** — 9 edited files, ~15 added lines, 6 requirements, 10 scenarios (p=5.43)

Run order: 25 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the deletion and version sentences of "Wire protocol", the "replaces `prompt`" sentence of "Far side", the "`onEnd`" sentence of "Local side"; decision 11). Depends on subplans 23 and 24 (`move-janissarys-acp-tool-loop-23-remote-loop-switch.md`, `move-janissarys-acp-tool-loop-24-remote-step-tags.md`). Subplan 23 leaves `acp-prompt` with no sender and runs ending in `acp-run-end`; subplan 24 changes no frame. Subplans 26 and 27 change no code, so this is the series' last wire change.

After subplan 23 no local code sends `acp-prompt`, so its far-side dispatch case and `RemoteAcp.prompt` are unreachable, and a remote run ends only with `acp-run-end`. This subplan removes both dead frames from the contract and every piece of live code that handled them. It also makes the series' one protocol bump. The bump is what turns a mismatched peer into a clear handshake refusal rather than a remote tab that accepts prompts and runs no loop.

## Design decisions

- **This subplan owns the protocol bump.** `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts:212` moves from 39 to 40, exactly once, here. This is the change that makes the contract incompatible with version 39, because the version-39 frames `acp-prompt` and `acp-end` leave the contract. The constant and its history paragraph land in the same edit.
  - **Wire additions already covered.** The same bump covers every earlier wire addition in this pull request, which all landed under 39 with no bump of their own:
    - the `read-lines` filesystem operation (subplan 4);
    - the `acp-run` frame (subplan 14);
    - the `acp-tool-result` frame (subplan 15);
    - the `acp-turn` and `acp-run-end` frames (subplan 16);
    - the `acp-tool-request` and `acp-tool-step` frames (subplan 17).
  - **Nothing after it.** No later subplan in the series changes the wire. Anything added to the contract after this in the same pull request stays under 40 and must be named in this history paragraph.
- **History paragraph**, in the style of its predecessors:
  - **What changes.** Version 40 moves janissary's ACP tool loop onto the far side. `acp-run` carries the prompt and its per-prompt snapshot in place of `acp-prompt`. `acp-run-end` replaces `acp-end` as a run's terminal. `acp-turn`, `acp-tool-request`, `acp-tool-result`, and `acp-tool-step` add turn boundaries, caller-tool round trips, and far-side steps; `acp-chunk` keeps carrying reply deltas. It also adds the read-only `read-lines` operation that backs a typed `file read` on a remote tab.
  - **Why it needs a bump.** A version-39 remote would accept prompts and run no loop at all, so workspace tools would never run where the workspace is, while both ends looked healthy. The exact-version handshake refuses that pairing.
  - **Parked peers.** A peer parked under 39 is refused at relay time by its peer record, as for every earlier bump.
  - **Placement.** The paragraph goes after version 39's paragraph and before `export const REMOTE_PROTOCOL_VERSION`, which becomes 40.
- **Deletions.**
  - `acp-prompt`: its `ClientFrame` member (`src/remote/protocol-frames.ts:157`), its `CLIENT_FRAME_TYPES` entry (`:318`), its branch in `decodeAcpText` (`src/remote/frame/decode-acp.ts:53`; narrow that parameter to `'acp-chunk'` and keep the function name), its `decodeKnownFrame` case (`src/remote/frame/decode.ts:87`), its base64 branch in `toWire` (`src/remote/protocol.ts:251`), its `RemoteServer.dispatch` case (`src/remote/serve.ts:153`), `RemoteAcp.prompt` (`src/remote/serve-acp.ts:95-109`), and its `unavailableSend` case (`src/remote/channel/unavailable.ts:20`). The `acp-run` case from subplan 15 stays.
  - `acp-end`: its `ServerFrame` member (`src/remote/protocol-frames.ts:276`), its `SERVER_FRAME_TYPES` entry (`:328`), `decodeAcpEnd` (`src/remote/frame/decode-acp.ts:68-71`) and its import in `src/remote/frame/decode.ts:17`, its `decodeKnownFrame` case (`src/remote/frame/decode.ts:92`), its `dispatchAcp` case (`src/remote/channel/acp.ts:30`), and `onEnd` on `AcpSessionListener` (`:15`) with the adapter's `onEnd` handler (`src/remote/acp-session.ts:120-123`).
  - **Stale comments.** Comments that describe the old per-prompt exchange as current are updated in the same change: the ACP family comment in `src/remote/protocol-frames.ts:148-150` ("what crosses here is prompts and reply text"), the `RemoteAcp` class comment in `src/remote/serve-acp.ts:37-40` ("the local side sends prompts and gets reply text back"), and the `decodeAcpText` comment in `src/remote/frame/decode-acp.ts:51-52` ("An empty prompt cannot occur"), which now describes only chunks. Version 8's `acp-prompt`/`acp-end` sentence and every other historical version paragraph stay as written.
- **Both frames become unknown.** After the deletion `decodeFrame` answers `Unknown remote frame type "acp-prompt".` and the same for `acp-end`, like any other frame outside the contract. The test is the existing unknown-type case at `src/remote/protocol.test.ts:455-459`.

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

The deletions and the bump above, across these files, as one atomic change: a union member, its registry entry, its decoder case, and its dispatch case cannot be removed separately without breaking the exhaustive switches and the registry types. No new module, and every touched file shrinks except `protocol.ts`, which gains only the comment paragraph.
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
  - pin `REMOTE_PROTOCOL_VERSION` to 40 in the `protocol version` case (`:971-973`); the existing older-version sweep (`:1056-1062`) generates 1 through 39 once the constant is 40, so the version-39 refusal needs no new case, and the both-versions message is already pinned by the mismatched-version case (`:1034-1039`);
  - remove `acp-prompt` from the round-trips-every-client-frame list (`:362`), `acp-end` from the server list (`:408`), and the prompt assertion from the base64 case (`:417`) while keeping the chunk assertion;
  - remove the four malformed rows at `:575-576` and `:584-585`;
  - remove the `FULLY_POPULATED_FRAMES` entries at `:812` and `:856`;
  - remove both names from the admitted-type lists at `:982` and `:990`;
  - extend the unknown-type case at `:455-459` to assert the exact `Unknown remote frame type "acp-prompt".` and `"acp-end".` messages.
- `src/remote/serve.test.ts`:
  - in `refuses an ACP frame that arrives before a workspace exists` (`:350-364`), drop the `acp-prompt` line; `acp-open` and `acp-run` remain, so the expected list is two `workspace-failed` frames;
  - in `drives the ACP holder once a workspace has been provisioned` (`:366-386`), send a run frame whose text is `'summarize this'` instead of `acp-prompt`, and assert `acpMock.prompt.mock.calls[0][0]` contains `'summarize this'` — the loop prepends the primer, so equality no longer holds;
  - in the detached-replay case (`:925-959`), emit an `acp-run-end` frame for `a1` with reason `answered` instead of `acp-end` and update the expected frame-type list and the wait condition.
- `src/remote/serve-acp.test.ts`:
  - delete the prompt-only cases in `describe('RemoteAcp — prompting')`: the addressed-holder cancellation, chunk/end, unknown-session, closed-session, and id-routing cases. Their run equivalents live in the later `RemoteAcp — running` and `RemoteAcp — cancelling, closing, and losing a run` blocks and in `src/remote/serve-acp-loop.test.ts`; the id-routing case is dropped because a run for an existing id and `refuses a run for a missing or closed session` cover the same lookup;
  - keep `contains cancellation rejection as a session-local fatal error` (`:207-214`): it never calls `prompt`;
  - rewrite and rename `emits a non-fatal error for a failed prompt and a fatal one for a dead session` (`:234-246`) to drive `acp.run(RUN_FRAME)` and call `lastHandlers().onError('rate limited')` before the connection-level fatal error, so the fatal/non-fatal split stays pinned at the holder;
  - in the two detach cases (`:520-534`, `:696-707`), drop the trailing `acp.prompt` calls; the `acpMock.shutdown` call counts already prove which records were torn down.
  - Every `lastHandlers().onEnd(...)` in the run and cancellation cases stays: it is the provider callback the loop drives, not the remote frame.
- `src/remote/channel/index.test.ts`:
  - drop `onEnd: vi.fn()` from every listener literal (`:298`, `:321-322`, `:332-333`, `:347`, `:360`, `:549`);
  - change `routes ready, chunk, and end frames…` (`:365-377`) to send `acp-run-end` and expect `onRunEnd('answered')`;
  - there is no unavailable `acp-prompt` test in this file, so no unavailable case is removed.
- No change is needed in `src/remote/acp-session.test.ts`: it never names `acp-end` or `onEnd`.

## Out of scope

Any behavior change; this subplan only removes dead frames and bumps the version. The provider's `PromptHandlers.onEnd` (`src/acp/types.ts:6`), `AcpPromptControl`, the loop's `onEnd` forwarding (`src/remote/serve-acp-loop.ts:77`), and the adapter's provider-turn `onEnd` in `src/remote/acp-session-run.ts:51` stay: they are provider-turn semantics, not the remote frame. Specs and docs (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then grep `src/` for `acp-prompt` and `acp-end`: the only survivors should be the historical version-8 paragraph and the tests asserting both types are unknown. By hand, connect a remote shell tab to a host running the same build and run one `ask`; it answers. Connect to a host still on version 39 and confirm the handshake refuses with the message naming 39 and 40.
