# feat: add the remote MCP call and result frames

**Complexity: 2/10** — ~70 added lines, 4 edited files, 1 requirement (p=4.12)

## Goal

Extend the remote wire contract with the two frames the relay needs and bump the protocol version so a peer that does not understand them is refused at the handshake. This is pure wire grammar: no relay behavior is added here, so it is green on its own and later subplans only send frames the compiler already knows.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on no earlier subplan.

## Requirements

1. The remote MCP server passes each command back to the local Janissary process for execution, over the session's existing connection — user answer: "but pass commands back to the local machine for execution." This requirement is shared with `janissary-mcp-server-13-far-side-relay-grace.md` and `janissary-mcp-server-14-local-relay.md`: this subplan defines the frames they exchange.

## Design decisions

- The relay uses two new remote frames modelled on the existing `acp-tool-request` / `acp-tool-result` pair: a far-side `mcp-call` carrying `{ call: string; tool: string; args: string }`, with `args` as base64 JSON, and a local `mcp-result` carrying `{ call: string; text: string; isError: boolean }`, with `text` as base64. No SSH port forward is used.
- Adding them bumps `REMOTE_PROTOCOL_VERSION` from 48 to 49, as every new frame does, with a `Protocol version 49` paragraph in `product/specs/remote-server.md` explaining what the version adds and that a version-48 peer would refuse the frames after the handshake had passed.
- The frame-name tables and `BINARY_FIELDS` are keyed by every frame type, so adding a frame without classifying it and declaring its binary fields is a compile error; this is a feature, not a hurdle.
- If the additions push `src/remote/protocol-frames.ts` past 200 lines, move the two new frame types into `src/remote/protocol-frames-mcp.ts` and union them in, rather than compacting the file.

## Preserved behavior

None found.

## Assumptions

1. Remote frames from local to far are client frames and frames from far to local are server frames, each with a base64 field table — `src/remote/base64-fields.ts` `// Server frames.` and `src/remote/protocol-frames.ts:353` `CLIENT_FRAME_TYPES`.
2. The protocol version is a single pinned literal with a paragraph per version — `src/remote/protocol.ts:272` `export const REMOTE_PROTOCOL_VERSION = 48;`.
3. Correlated request/reply frames already exist as precedent — `src/remote/protocol-frames.ts:307` `type: 'acp-tool-request'; id: string; request: number; command: string` and `src/remote/protocol-frames.ts:192` `type: 'acp-tool-result'`.
4. A far-side capture request carries a correlation id — `product/specs/remote-server.md` "Each capture request carries a correlation id" (§ Detached-session auto-accept, notifications, and captures).
5. A frame is refused at runtime unless the codec has a decode case for it — `src/remote/frame/decode.ts:99` `default: { return unhandledRemoteFrame(type); }`.

## Existing functionality

1. Correlated far-side request / local result frames — `src/remote/protocol-frames.ts:307` `type: 'acp-tool-request'` and `src/remote/protocol-frames.ts:192` `type: 'acp-tool-result'`.
2. Remote protocol version constant — `src/remote/protocol.ts:272` `export const REMOTE_PROTOCOL_VERSION = 48;`.
3. Base64 field registry keyed by frame type — `src/remote/base64-fields.ts:14` `export const BINARY_FIELDS: Record<RemoteFrame['type'], readonly BinaryField[]> = {`.
4. Frame-name tables keyed by the frame unions — `src/remote/protocol-frames.ts:353` `export const CLIENT_FRAME_TYPES` and `:360` `SERVER_FRAME_TYPES`.
5. The frame decoder that every new frame must join — `src/remote/frame/decode.ts:99` `unhandledRemoteFrame(type)`.

## Implementation steps

1. Bump `REMOTE_PROTOCOL_VERSION` to 49 in `src/remote/protocol.ts:272` and add the `Protocol version 49` paragraph to `product/specs/remote-server.md` beside the version-48 paragraph (`product/specs/remote-server.md:353`). State that a version-48 peer is refused at the exact-version handshake. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add the far-side `mcp-call` server frame and the local `mcp-result` client frame to `src/remote/protocol-frames.ts` (or extract them to `src/remote/protocol-frames-mcp.ts` and union them in if the file passes 200 lines), and add both names to `CLIENT_FRAME_TYPES` (`:353`) and `SERVER_FRAME_TYPES` (`:360`). Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Register `mcp-call`'s `args` and `mcp-result`'s `text` as `{ field, shape: 'text' }` entries in `BINARY_FIELDS` (`src/remote/base64-fields.ts:14`). Add `case 'mcp-call'` and `case 'mcp-result'` to `decodeKnownFrame` in `src/remote/frame/decode.ts:99`, validating the correlation id, tool name and argument fields the same way the `acp-tool-request` / `acp-tool-result` decoders validate theirs, so a wire frame is usable rather than refused as unhandled. No sender or handler exists yet, so no behavior changes. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit, by extraction if needed. Relative imports in `src/` carry the `.js` extension per NodeNext; do not add a barrel.

## UI design

1. This subplan has no UI surface; the frames are internal to the SSH connection and produce no visible control.

## Tests

- `src/remote/protocol.test.ts`: the version is 49, and `mcp-call` and `mcp-result` round-trip through the codec with their base64 fields intact (requirement 1).

## Out of scope

- Sending or handling either frame: `janissary-mcp-server-13-far-side-relay-grace.md` and `janissary-mcp-server-14-local-relay.md`.
- The grace window, the far-side listener, and the token it mints.
- SSH port forwarding or a Unix-socket relay.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then read `src/remote/protocol.ts`, `src/remote/protocol-frames.ts` and `src/remote/base64-fields.ts`: confirm the version is 49, both new frames are present in the right frame-name table, and `args` and `text` are declared base64. A failure is a compile error from an unregistered frame or a version that still reads 48.
