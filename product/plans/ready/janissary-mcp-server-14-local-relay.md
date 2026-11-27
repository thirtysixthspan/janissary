# feat: relay remote MCP calls into the local executor

**Complexity: 4/10** — ~110 added lines, 3 edited files, 5 requirements (p=5.15)

## Goal

Handle far-side `mcp-call` frames in the local process by running the same local question executor a local call uses, and answer with a correlated `mcp-result` frame. Re-sends after a reconnect attach to the in-flight question rather than registering a second one. Also send `mcp: true` on the spawn frame so the far side starts its endpoint, while building no local MCP variables for a remote launch.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-4-local-question-executor.md`, `janissary-mcp-server-7-harness-spawn-env.md` and `janissary-mcp-server-11-remote-frames.md`.

## Requirements

1. A remote harness's question runs in the local Janissary process, and its answer returns to the remote harness — user answer: "the question executes locally and the mcp server responds to the remote harness." Shared with `janissary-mcp-server-12-far-side-endpoint.md`.
2. A remote harness can only run commands on the local process — feature text: "can only run commands on the local process."
3. A link that returns within the grace window delivers every waiting call's answer to its harness — user answer: "Hold over reconnect": "in-flight and new calls wait and are re-sent once the link is back." This subplan owns the deduplication half.
4. The `spawn` client frame carries the MCP flag so the far side knows to start its endpoint — feature text: "the server should expose its connection and authentication details to all harnesses".
5. A remote harness launched while the local server is not running receives no MCP — user answer: "Harnesses launched while it's down get no MCP flags or variables" (requirement 34), following the same effective-MCP rule as a local launch.

## Design decisions

- The local side runs a far-side call through the same `src/mcp/executor.ts` a local call uses, so validation, tab lookup, queueing and the withdrawn notification cannot drift between the two paths. Only the transport differs.
- A per-channel map from `call` id to the in-flight promise or settled result makes a re-send attach to the existing question. When the promise settles, send `mcp-result`; when a re-sent call finds a settled result, answer from the stored result without registering again.
- The map is cleared when the channel closes. A detach closes the local tab, which cancels its question through `Questions.closeTab`; a call the far side re-sends after an Attach within the grace window therefore registers afresh and opens the panel on the rebuilt tab.
- The local launch path adds `mcp` to the `registerRemotePty` spawn options object and builds no local MCP variables for a remote launch, just as it builds no local browser. The effective `mcp` follows the same rule as a local launch, so a local server that is not running gives a remote harness no MCP.

## Preserved behavior

None found.

## Assumptions

1. `mcp-call` and `mcp-result` frames and their base64 fields already exist — `src/remote/protocol-frames.ts` and `src/remote/base64-fields.ts`, added by `janissary-mcp-server-11-remote-frames.md`.
2. The local executor is a pure function of `Managers` so the relay can call it without a listener — `src/mcp/executor.ts`, added by `janissary-mcp-server-4-local-question-executor.md`.
3. Local inbound channel frames are dispatched in one switch — `src/remote/entry-factory.ts:108` `onFrame: (frame) => {`.
4. The remote spawn options object already carries the browser and auto-approve flags — `src/harness/tab-spawn.ts:100` `registerRemotePty(label, channel, { program, command, harness: name, offline, browser, autoApprove, autoResume }, options.resumePtyId)`.
5. The `spawn` client frame already carries `browser?: boolean` beside which `mcp?: boolean` goes — `src/remote/protocol-frames.ts:141` `browser?: boolean;`.
6. An inbound server frame reaches `onFrame` only if it is a channel frame — `src/remote/channel/index.ts:235` `if (isChannelFrame(frame)) { this.handlers.onFrame(frame); return; }`.

## Existing functionality

1. The local question executor — `src/mcp/executor.ts`, added by `janissary-mcp-server-4-local-question-executor.md`.
2. Correlated far-side request / local result frames — `src/remote/protocol-frames.ts:307` `type: 'acp-tool-request'` and `:192` `type: 'acp-tool-result'`.
3. Local inbound frame dispatch — `src/remote/entry-factory.ts:108` `onFrame: (frame) => {`.
4. Remote PTY registration with a spawn options object — `src/harness/tab-spawn.ts:100` `registerRemotePty(label, channel, { … })`.
5. Channel-close cleanup — `src/remote/channel/index.ts` `fail`/`settleAcp` teardown path.
6. Tab-close question cancellation — `src/questions.ts:75` `closeTab(tab: string): void { this.cancelTab(tab); }`.
7. The channel-frame union and its keyed classifier — `src/remote/channel/types.ts:48` `export type ChannelFrame = Extract<ServerFrame, {` and `:55` `CHANNEL_FRAME_KEYS`.

## Implementation steps

1. In `src/remote/protocol-frames.ts`, add `mcp?: boolean` to the `spawn` client frame beside `browser?: boolean` (`src/remote/protocol-frames.ts:141`). In `src/harness/tab-spawn.ts:100`, add `mcp` to the `registerRemotePty` spawn options object and build no local MCP variables for a remote launch (requirement 5 follows the effective-MCP rule from `janissary-mcp-server-7-harness-spawn-env.md`). Update `product/specs/remote-server.md` with the new spawn field. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Create `src/remote/mcp-relay.ts` with a per-channel map from `call` id to an in-flight promise or settled result. On `mcp-call`, run the local executor from `janissary-mcp-server-4-local-question-executor.md` with the frame's arguments and send `mcp-result` when it settles; a re-sent id attaches to the existing entry and answers from the stored result once settled. Clear the map on channel close. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Add `mcp-call` to the `ChannelFrame` union and `CHANNEL_FRAME_KEYS` in `src/remote/channel/types.ts:48` so the channel hands it to `onFrame` rather than failing on an unexpected frame. Wire a `case 'mcp-call'` in the local dispatch at `src/remote/entry-factory.ts:108` that forwards the frame to this relay, and make the channel-close path clear its map. Keep the executor as the only path that runs a question, so a remote call can never register a command on the far side. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit; `mcp-relay.ts` is a new focused module. Relative imports in `src/` carry the `.js` extension per NodeNext; do not add a barrel.

## UI design

1. The panel is the same non-modal question panel on the rebuilt local tab; a reconnected remote tab keeps its MCP flag state as described in `janissary-mcp-server-8-metadata-flag-and-focus.md`.

## Tests

- `src/remote/mcp-relay.test.ts`: a re-sent `call` id attaches to the existing question rather than registering a second, a settled id answers from the stored result, and the map is cleared on channel close (requirement 3).
- A local-dispatch test beside `src/remote/manager.test.ts` (which already imports `src/remote/entry-factory.ts`): an `mcp-call` frame invokes the local executor and produces a correlated `mcp-result`, and a remote launch with no local server sends no `mcp: true` (requirements 1, 2, 4, 5).

## Out of scope

- The far-side grace window: `janissary-mcp-server-13-far-side-relay-grace.md`.
- Exposing any command other than `question` through the relay.
- Detached-session reattach automation.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then open a remote harness tab and ask it to use the Janissary question tool on its `$JANISSARY_TAB`: the panel opens locally and the answer returns to the remote harness. Repeat, Detach and Attach within a minute: the panel reappears once on the rebuilt tab and answering returns to the harness. A failure is a second panel on re-send, a question answered on the far side, or no `mcp` flag on the spawn frame.
