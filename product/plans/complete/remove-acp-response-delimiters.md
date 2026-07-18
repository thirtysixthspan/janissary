# Remove the BEGIN/END MODEL RESPONSE delimiter lines from ACP replies

**Complexity: 2/10** — deletes two helper functions and two constants in one file and wires the `chunk`/`endTurn` handlers to the raw text; the only ripple is updating the tests and spec that documented the delimiters. No new modules, no protocol/server surface changes.

An `acp <prompt>` reply is currently bracketed in the transcript with `━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━` and `━━━━━━━━━━ END MODEL RESPONSE ━━━━━━━━━━` lines (added by [[acp-response-delimiters]]). The backlog issue asks for these "model response lines" to be removed, so a reply renders as just the model's own words — e.g.

```
what is the name of the tower in paris
The Eiffel Tower is the most famous tower in Paris.
```

instead of wrapping the answer in the two banner lines.

## Design decisions

- **Remove, don't hide**: delete the `RESPONSE_BEGIN`/`RESPONSE_END` constants and the `delimitStreaming`/`delimitFinal` helpers in `src/acp/manager.ts` outright, and pass the raw streaming buffer / final text straight to `updateRunning`. They have no other callers (confirmed by grep — only `src/acp/manager.ts` and its test reference them; `src/monitor/context.ts`'s separate `MODEL RESPONSE` marker is unrelated monitor-context serialization and is left untouched).
- **No behavior change beyond display**: `lastAnswer` already held the raw, undelimited text and is what `onDone` receives, so removing the wrappers only changes what the transcript shows — the empty-reply guard in `runner.ts` and the `onDone` contract are unaffected.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Change |
| --- | --- | --- |
| Delimiter constants + helpers | `src/acp/manager.ts:17-30` | Delete |
| `chunk`/`endTurn` handlers | `src/acp/manager.ts:127-128` | Pass raw text to `updateRunning` |
| Delimiter unit tests | `src/acp/manager.test.ts:195-236` | Update to expect raw text |
| Spec paragraph on the delimiters | `product/specs/acp.md:17` | Rewrite to drop the delimiter description |

## Proposed changes

**`src/acp/manager.ts`.** Remove the `RESPONSE_BEGIN` and `RESPONSE_END` constants and the `delimitStreaming`/`delimitFinal` functions (lines 17-30). Change the two handlers to:

```ts
chunk: (buffer) => updateRunning(buffer, true),
endTurn: (final) => { updateRunning(final, false); lastAnswer = final; },
```

Relative imports in `src/` carry `.js` (NodeNext) — no import changes are needed here.

**`src/acp/manager.test.ts`.** Update the two non-empty delimiter cases so they expect the raw text: the `chunk` test now expects `updateFn` called with `('response so far', true)`, and the `endTurn` test now expects `('the final answer', false)`; retitle both to drop the "marker"/"wrapped" wording. The two empty-string cases (`('', true)` / `('', false)`) already assert the un-delimited form and stay as-is (their titles are still accurate). The existing "finished → onDone with the last answer" case already asserts the raw answer and needs no change.

## Tests

- `src/acp/manager.test.ts`: `chunk` forwards the streaming buffer to `updateRunning` verbatim; `endTurn` forwards the final text to `updateRunning` verbatim; empty `chunk`/`endTurn` strings still forward `''`; `onDone` still receives the raw final answer (unchanged existing case).

## Out of scope

- The monitor context snapshot's own `SENT TO MODEL` / `MODEL RESPONSE` markers (`src/monitor/context.ts`) — a different feature, not the `acp <prompt>` transcript.
- Any other ACP reply formatting (markdown rendering, streaming behavior, busy indicator).

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual: driving a live ACP session isn't practical in this environment; the unit tests cover the change. A live check would confirm an `acp` reply now shows only the model's words with no banner lines above/below.
