# Fix: editor-persona ACP transcript always empty

**Complexity: 2/10** — the exchange-recording store, its append method, and the transcript-routing plumbing all already exist and are already tested; the only missing piece is two call sites in one function.

## Summary

Clicking the transcript button on an editor-persona connection row (`… (acp)`) always opens a tab reading the `No transcript yet.` placeholder, even after a persona has replied. The bug: `EditorAcpManager.record()` (`src/editor/acp-manager.ts:38`) exists and is tested, and `openAcpTranscript` (`src/controller/transcript.ts:19`) correctly reads back through `managers.editorAcp.transcript(label, persona)`, but nothing ever calls `record()` — `src/editor-suggest/handler.ts`, which drives every editor-persona prompt/reply, never invokes it. The original feature's own plan (`product/plans/complete/acp-connection-row-transcript-button.md`) called for exactly these two call sites and they were dropped during implementation.

## Approach

Add the two missing `record()` calls in `src/editor-suggest/handler.ts:editorSuggest`, mirroring the monitor manager's input-then-response split (`src/monitor/manager.ts:166`, `:173`):

1. Record the full prompt sent to the session (`primingText` + the request line) as an `'input'` block immediately before `session.prompt(...)` is called.
2. Record the accumulated `reply` as a `'response'` block inside `onEnd`, before `finish(...)` is called.

No changes to `EditorAcpManager`, `controller/transcript.ts`, or the protocol — those already work correctly and are already covered by existing tests; this is purely wiring the existing `record` method into the existing prompt/reply flow.

## Implementation steps

1. In `src/editor-suggest/handler.ts`, build the full prompt string into a named `const` (currently inlined at the `session.prompt(...)` call site) so it can be both recorded and sent.
2. Call `managers.editorAcp.record(label, persona.name, <prompt>, 'input')` right before `session.prompt(...)`.
3. Inside the existing `onEnd` callback, call `managers.editorAcp.record(label, persona.name, reply, 'response')` before `finish(parseHunks(reply))`.

## Tests

- `src/editor-suggest/handler.test.ts`: extend (or add if absent) coverage asserting that a successful `editorSuggest` call records an `'input'` block with the full prompt and a `'response'` block with the accumulated reply into `managers.editorAcp`, using its real `record`/`transcript` round trip (per the existing `acp-manager.test.ts` pattern) to assert the transcript is non-empty afterward.

## Out of scope

- Any change to `EditorAcpManager`, `controller/transcript.ts`, the protocol, or the web-side button/wiring — all already correct.
- Recording behavior for `scope: 'tab'` or `scope: 'monitor'` rows — unaffected by this bug.

## Verification

- Run `./scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected server tests pass.
- Manual check: on an editor tab, trigger a persona suggestion (`> reviewer: ...`), then click the clipboard icon on the resulting `reviewer (acp)` connections-panel row — confirm the opened tab shows the recorded prompt/response exchange rather than `No transcript yet.`
