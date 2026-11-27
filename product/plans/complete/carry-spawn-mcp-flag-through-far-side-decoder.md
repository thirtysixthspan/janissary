# Carry the spawn MCP flag through the far-side decoder

**Complexity: 2/10** — 2 added production lines in 1 file, 8 requirements and 3 scenarios (p=4.1749); a single mirrored optional-boolean field in one decoder.

## Goal

The near side already puts `mcp` on the spawn frame and `RemoteProcesses.spawnPty` already launches a far-side MCP endpoint when `frame.mcp === true`. The decoder between them does not: `decodeSpawn` neither validates nor returns `mcp`, so every spawn the far side decodes drops the flag before the consumer can read it and no endpoint is ever created. Make the decoder validate and return the optional boolean so the flag survives the codec and a remote harness actually starts its endpoint as the spec promises.

## Requirements

1. `decodeSpawn` adds `mcp` to the fields destructured from the spawn record — "add `mcp` to the fields destructured from the spawn record".
2. `decodeSpawn` accepts `mcp` only when `mcp === undefined || typeof mcp === 'boolean'` — "validate it the same way as `browser`/`autoApprove`/`autoResume` (`mcp === undefined || typeof mcp === 'boolean'`)".
3. `decodeSpawn` refuses a spawn whose `mcp` is neither `undefined` nor a boolean, returning the malformed-spawn result — the rejection implied by requirement 2's validation.
4. `decodeSpawn` returns `mcp` on the decoded frame when it is present — "spread `...(mcp !== undefined && { mcp })` into the returned frame".
5. `decodeSpawn` omits `mcp` from the decoded frame when it is absent — the absent branch of the same conditional spread.
6. A spawn encoded with `mcp: true` decodes with `mcp: true` intact — "encodes and decodes a spawn with `mcp: true` and asserts the flag survives".
7. A spawn encoded with `mcp: false` decodes with an explicit `mcp: false` rather than dropping it — "one with `mcp: false` asserting an explicit false is preserved rather than dropped".
8. `RemoteProcesses.spawnPty` receives `frame.mcp === true` from a decoded spawn frame — "so `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts` sees `frame.mcp === true` and launches `FarSideMcp`".

## Design decisions

- Mirror the three existing optional booleans exactly: destructure `mcp`, validate it with the same `undefined || boolean` clause, and copy it into the result with the same conditional spread. No new helper or guard module.
- The frame union already declares `mcp?: boolean`, so no type change is needed — "the union already declares it".
- `mcp` is not a binary field, so no base64 declaration changes — "the spawn field is not binary".
- Pin the behavior through `encodeFrame`/`decodeFrame`, not by constructing frames directly: `src/remote/serve-mcp.test.ts` builds spawn frames directly and bypasses the codec, which is why the gap went unnoticed.
- One production file changes, and the only test edit is the two round-trip cases named in the Proposal.

## Preserved behavior

1. A `browser: true` spawn still carries that flag through a codec round-trip — the new `mcp` handling must not alter it — pinned by `round-trips a spawn frame carrying the browser flag`.
2. A spawn with a non-boolean `browser` is still refused as malformed — the new validation clause must not soften it — pinned by `rejects spawn with a non-boolean browser flag`.
3. `autoApprove` still survives decoding when present — the new clauses must not displace it — pinned by `keeps every optional field of spawn`.
4. A spawn with no `mcp` field still decodes to a frame with no `mcp` property — the new field must not appear as `undefined` — pinned by `round-trips a spawn frame carrying the browser flag`.

## Assumptions

1. `src/remote/pty-session.ts:124` — `type: 'spawn', ... autoResume, mcp,`: the near side already writes `mcp` onto the spawn frame.
2. `src/remote/frame/decode-lifecycle.ts:59` — `const { id, program, command, mode, harness, cols, rows, offline, agentName, browser, autoApprove, autoResume, shell, cwd } = record;`: the decoder's field list omits `mcp`.
3. `src/remote/frame/decode-lifecycle.ts:69` — `!(browser === undefined || typeof browser === 'boolean')`: the validation idiom `mcp` must mirror.
4. `src/remote/frame/decode-lifecycle.ts:80` — `...(browser !== undefined && { browser })`: the conditional-spread idiom `mcp` must mirror.
5. `src/remote/protocol-frames.ts:145` — `mcp?: boolean;`: the spawn frame union already declares the field.
6. `src/remote/serve-processes.ts:116` — `const mcp = frame.mcp === true ? ...`: the sole consumer that needs the decoded flag.
7. `src/remote/frame/decode.ts:55` — `case 'spawn': { return decodeSpawn(record); }`: the dispatch path a wire frame takes to reach the decoder.
8. `src/remote/protocol.test.ts:891` — `it('round-trips a spawn frame carrying the browser flag', ...)`: the neighbor beside which the new cases belong.

## Existing functionality

1. `decodeSpawn`'s optional-boolean validation and conditional-copy pattern for `browser`, `autoApprove` and `autoResume` — `src/remote/frame/decode-lifecycle.ts:69`, `:80`.
2. The `malformed('spawn')` refusal returned when a spawn field fails validation — `src/remote/frame/decode-lifecycle.ts:75`.
3. The codec's `encodeFrame` and `decodeFrame` pair and its round-trip test style — `src/remote/protocol.test.ts:10`, `:891`.
4. The far-side MCP launch at the spawn site, which needs no change once the flag arrives — `src/remote/serve-processes.ts:116`.
5. The `RemoteFrame` union's declared optional `mcp` field — `src/remote/protocol-frames.ts:145`.

## Implementation steps

1. In `src/remote/frame/decode-lifecycle.ts`, add `mcp` to the fields `decodeSpawn` destructures from the record, add a validation clause requiring `mcp === undefined || typeof mcp === 'boolean'` alongside the browser/autoApprove/autoResume clauses, and add the conditional spread copying `mcp` into the returned frame beside theirs. Touch no other production file. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Read `src/remote/pty-session.ts:124` and `src/remote/serve-processes.ts:116` and confirm no change is needed at either end: the producer already writes the field and the consumer already reads it. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add the two codec cases in `src/remote/protocol.test.ts` described under Tests, immediately after the browser-flag spawn case, then run the build command. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface is added or changed. The harness question panel and its answer text stay exactly as they are; the only difference is that a remote harness launched with MCP enabled now has a working far-side endpoint behind that existing panel.

## Tests

1. `src/remote/protocol.test.ts` — two cases beside `round-trips a spawn frame carrying the browser flag`, following its `encodeFrame`/`decodeFrame` style: encode then decode a spawn with `mcp: true` and assert the decoded frame equals the original with the flag intact (requirement 6); encode then decode a spawn with `mcp: false` and assert the decoded frame still carries an explicit `mcp: false` rather than an omitted field (requirement 7). The tests named in Preserved behavior must keep passing unchanged.

## Out of scope

- No edits to `src/remote/base64-fields.ts`, `src/remote/protocol-frames.ts`, `src/remote/pty-session.ts`, or `src/remote/serve-processes.ts`.
- No protocol version bump, no new frame type, and no new malformed-input case beyond the two round-trip cases named in the Proposal.
- The other three pull-request backlog entries — double-encoded `mcp-call` args, the remote-launch decision test, and channel-close cleanup wiring — are separate repairs and are not implemented here.
- No help page or user/developer documentation edits.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then perform these concrete checks:

- Read `src/remote/frame/decode-lifecycle.ts` and confirm `mcp` appears in all three places in `decodeSpawn` — the destructuring, the validation clause, and the returned spread — directly alongside `browser`, with no other production file changed.
- Run the two new codec cases in `src/remote/protocol.test.ts`; then, against the decoded object from a spawn line carrying `"mcp":false`, confirm `Object.hasOwn(decoded, 'mcp')` is true so the explicit false is a real field and not an omission.
- End-to-end interaction: launch a remote harness with MCP enabled and ask it a question through the existing question panel; the question should reach the far-side endpoint and resolve normally. A failure looks like the question never arriving, the harness reporting no MCP tool, or a malformed-spawn refusal on the far side.
