# Send mcp-call arguments once and answer malformed calls locally

**Complexity: 3/10** — ~12 added production lines across 2 files, 6 requirements and 4 scenarios (p=4.57)

## Goal

A remote harness's question reaches the local executor instead of failing before it leaves the far side. Today `FarSideMcp.relay` base64-encodes the arguments and then the frame codec base64-encodes the `args` field again, so the relay's `JSON.parse` throws on every real call; because it records the call id before parsing, the entry stays result-less and later re-sends are silently dropped. The far side should hand the codec plain JSON for one encoding pass, and the local side should answer a genuinely malformed frame with an error result and no leftover state, so the harness sees an error rather than an exception and a later valid call with the same id still opens a question.

## Requirements

1. "change `FarSideMcp.relay` to put `JSON.stringify(args)` (plain text) in the `mcp-call` frame": the far side stores plain JSON text in the frame's `args` field.
2. "let the codec's `BINARY_FIELDS['mcp-call']` entry in `src/remote/base64-fields.ts` do the single base64 pass": on the wire, `args` is one base64 encoding of that JSON text, never two.
3. "move `pending.set` after a successful `JSON.parse`": a call whose arguments do not parse is never inserted into the relay's pending map.
4. "wrap the parse in a try/catch that settles the call with an `isError` result whose text names the malformed arguments": a malformed call is answered with an error `mcp-result` that includes the offending argument text.
5. "a bad frame never throws out of `handle()`": handling malformed arguments returns normally instead of propagating a parse exception.
6. "never leaves a result-less entry that silences re-sends": after a malformed call, a later valid call using the same id registers a fresh question and receives its own answer.

## Design decisions

- The frame codec owns binary encoding: the far side hands it plain text and performs no explicit base64 conversion (Requirements 1–2; Assumption 1).
- Argument parsing is the boundary between a transport frame and a tool call: only a successful parse earns a pending entry, so failed parses cannot accumulate state (Requirements 3 and 6; Assumption 2).
- A malformed frame is answered on the same channel as a tool failure, with an error result naming the bad arguments, rather than dropped or thrown (Requirements 4–5; Assumption 3).
- The codec declaration and its own tests already treat `mcp-call.args` as one binary text field, so neither changes (Assumption 4).

## Preserved behavior

1. An in-flight call re-sent with the same id still attaches to the one registered question rather than registering a second. Pinned by `attaches a re-sent call to the in-flight question instead of registering a second` in `src/remote/mcp-relay.test.ts`.
2. A settled call re-sent with the same id still replays its stored result rather than running the tool again or answering with different text. Pinned by `answers a re-sent settled call from the stored result without registering again` in `src/remote/mcp-relay.test.ts`.
3. `clear()` still empties the pending map so a re-send registers a fresh question rather than receiving a stale result. Pinned by `clears the map on channel close so a re-send registers a fresh question` in `src/remote/mcp-relay.test.ts`.
4. Far-side calls still wait through a link loss, re-send when it returns, and expire with the not-connected message: the encoding change must not alter that pending lifecycle. Pinned by `holds in-flight and new calls through a link loss and re-sends them when it returns` in `src/remote/serve-mcp.test.ts`.
5. A `mcp-call` built directly with `encodeFrame` still decodes to its original arguments and reaches the local executor, so the harness path must not depend on the far side's old pre-encoding. Pinned by `runs the local executor and answers with the correlated result` in `src/remote/manager.test.ts`.

## Assumptions

1. `src/remote/protocol.ts:303` `function toWire(frame: RemoteFrame)` applies `encodeText` once per declared binary field, and `src/remote/protocol.ts:336` `const fields = BINARY_FIELDS[frame.type]` reads nothing outside that declaration.
2. `src/remote/mcp-relay.ts:26` `pending.set(frame.call, entry);` currently runs before `src/remote/mcp-relay.ts:27` `const args = JSON.parse(frame.args)`, which is why a parse failure leaves a result-less entry.
3. `src/remote/mcp-relay.ts:14` `const answer = (call: string, result: ToolResult): void =>` sends `mcp-result` frames and is available for the error answer without a pending entry.
4. `src/remote/base64-fields.ts:66` `'mcp-call': [{ field: 'args', shape: 'text' }]` already declares the single encoding pass, and `src/remote/protocol.test.ts:1164` `'mcp-call': { type: 'mcp-call', call: 'call-1', tool: 'file read', args: '{"path":"notes.txt"}' }` already supplies plain JSON as the frame value.
5. `src/remote/manager.test.ts:1024` `send: (frame: Extract<ServerFrame, { type: 'mcp-call' }>) => transport?.onData(\`${encodeFrame(frame)}\n\`)` builds frames through the codec, so that test does not pin the far side's pre-encoding.

## Existing functionality

1. `src/remote/protocol.ts:322` `export function encodeFrame(frame: RemoteFrame): string` and `src/remote/protocol.ts:335` `export function decodeFrame(line: string)` provide the single-pass wire encoding the far-side test uses to assert the wire form.
2. `src/remote/base64-fields.ts:66` `'mcp-call': [{ field: 'args', shape: 'text' }]` already declares `args` as a binary text field, so no codec change is needed.
3. `src/remote/mcp-relay.ts:14` `answer` already sends an `mcp-result` with text and `isError`, which the malformed-args path reuses.
4. `src/remote/mcp/tools.ts` `ToolResult` supplies the `{ text, isError }` shape used for the error answer.
5. `src/remote/mcp-relay.test.ts:7` `function fixture()` provides `call`, `answer`, `send`, and `register` helpers for the new malformed-args case.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, change `FarSideMcp.relay` so the `mcp-call` frame's `args` is `JSON.stringify(args)` plain text instead of an explicit base64 string; leave the pending map, abort handling, grace window, and resend logic untouched, and leave `src/remote/base64-fields.ts` untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/mcp-relay.ts`, inside `handle`, parse `frame.args` inside a try/catch before creating or storing the pending entry. On a parse failure, send an `isError` `mcp-result` through `answer` whose text names the malformed arguments and return without registering anything. On success, create the entry, call `pending.set`, and run the executor exactly as today. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `product/specs/remote-server.md`, extend the far-side MCP section with the single encoding pass and the malformed-arguments behavior described in Requirements 2 and 4–6, in user-visible prose only. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. No command, flag, key binding, or visible surface changes; the only user-visible difference is that a malformed remote question returns an error answer instead of failing the call, while a valid question now reaches the human's question panel.

## Tests

1. `src/remote/serve-mcp.test.ts` — Requirement 2: update the existing relay-and-settle case to pass the captured frame through `encodeFrame` and `decodeFrame`, narrow the decoded frame to `mcp-call`, and assert that `JSON.parse(Buffer.from(wire.args, 'base64').toString('utf8'))` equals `ARGS`. This fails on the old double encoding and passes once the codec performs the only pass.
2. `src/remote/mcp-relay.test.ts` — Requirements 4 and 5: add a case that calls `relay.handle` directly with a non-JSON `args` string and asserts it does not throw, sends exactly one `mcp-result` with `isError` true and text containing the bad arguments, and registers no question.
3. `src/remote/mcp-relay.test.ts` — Requirement 6: in the same case, follow the malformed call with a valid call using the same id, answer it, and assert a fresh question is registered and a normal result is sent.
4. The preserved-behavior tests named above stay unchanged and keep passing; `src/remote/manager.test.ts` is not edited.

## Out of scope

- Changing `src/remote/base64-fields.ts`, `src/remote/protocol.ts`, or their tests.
- Editing `src/remote/manager.test.ts`; its `mcpHarness` test builds frames with `encodeFrame` and cannot detect the double encoding.
- The remote-launch decision test and the channel-close cleanup wiring entries that remain in the pull request backlog.
- User and developer documentation, and help pages: none describes wire encoding or malformed-frame handling.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes.
2. Manual: run a remote harness with MCP enabled and ask it a question; the question panel should appear and the answer should reach the harness, where before every call failed before reaching the local executor. Then send a `mcp-call` with non-JSON arguments through the relay (the new test is a minimal reproduction): the harness should receive an `mcp-result` with `isError` true whose text names the bad arguments, and a subsequent valid call using the same id should open a fresh question panel and receive the real answer. A failure looks like an exception escaping the PTY data callback, or the second call replaying the earlier error without registering a question.
