# Delimit ACP model responses with BEGIN/END lines

**Complexity: 3/10** — a small formatting change confined to one call site
(`AcpManager.run`'s `chunk`/`endTurn` handlers), with no changes to `runner.ts`'s plumbing or to
the value returned via `onDone`.

## Goal

The `acp <prompt>` command's model response, as it appears in the tab transcript, is wrapped in
delimiter lines so it reads as a clearly bounded block, distinct from tool-call output
(`ranCommand` entries) and other transcript content around it:

```
━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━
....
━━━━━━━━━━ END MODEL RESPONSE ━━━━━━━━━━
```

The BEGIN line appears as soon as the model starts streaming text; the END line appears only
once that turn's response is actually complete — not on every intermediate chunk.

## Approach

`AcpManager.run` (`src/acp/manager.ts:94-125`) wires `runAcpToolLoop`'s `chunk`/`endTurn`
handlers straight to `updateRunning` (from `makeUpdateRunning`, `src/acp/runner.ts`), which
stores the text in the tab's running log entry and (on `endTurn`) emits the transcript-appended
event. Both handlers are the only place "the model's own text for this turn" is known, as
opposed to tool-call results (`ranCommand`) or connection errors (`error`), so delimiting there
keeps the change contained to formatting, without touching `runner.ts`'s empty-output guard or
persistence logic.

Two small wrapper functions, used only for what gets displayed:
- `chunk`: prefix the streaming buffer with the BEGIN line only (no END yet, since the response
  isn't finished).
- `endTurn`: wrap the final text with both BEGIN and END lines for the entry passed to
  `updateRunning`.

`lastAnswer` (assigned in `endTurn`, returned to `onDone` in `finished`) keeps the **raw**,
undelimited text — `onDone` is a programmatic callback (e.g. `CaptureManager.run`,
`src/capture/manager.ts:38`) that other code treats as the model's actual answer, not a
transcript-display concern. Only what's handed to `updateRunning` (and, on `endTurn`, therefore
the tab log and the `entry:appended` transcript event) is delimited.

An empty buffer/final string stays empty (no delimiters added) — mirrors `runner.ts`'s own
empty-output check (`if (!running && output && t) ...`) so the "no transcript entry on an empty
finish" behavior is unaffected.

## Implementation steps

1. **`src/acp/manager.ts`** — add two small helpers near the top of the file (after the existing
   constants) and use them in the `chunk`/`endTurn` handlers:
   ```ts
   const RESPONSE_BEGIN = '━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━';
   const RESPONSE_END = '━━━━━━━━━━ END MODEL RESPONSE ━━━━━━━━━━';

   // Prefix a still-streaming buffer with the begin marker only — the end marker appears once
   // the turn is actually finished, not on every intermediate chunk.
   function delimitStreaming(text: string): string {
     return text ? `${RESPONSE_BEGIN}\n${text}` : text;
   }

   // Wrap a finished turn's text with both markers.
   function delimitFinal(text: string): string {
     return text ? `${RESPONSE_BEGIN}\n${text}\n${RESPONSE_END}` : text;
   }
   ```
   Then in the handlers object passed to `runAcpToolLoop` (`:110-123`):
   ```ts
   chunk: (buffer) => updateRunning(delimitStreaming(buffer), true),
   endTurn: (final) => { updateRunning(delimitFinal(final), false); lastAnswer = final; },
   ```
   (`lastAnswer = final` stays unchanged — it keeps the raw text.)

## Tests

- **`src/acp/manager.test.ts`**:
  - Update the existing "chunk handler calls updateRunning with the buffer" test (`:177-185`) to
    expect the begin-delimited form: `updateFn` called with
    `` `━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━\nresponse so far` ``, `true`.
  - Add a case asserting `endTurn` calls `updateRunning` with both markers wrapped around the
    final text.
  - Add a case asserting an empty `chunk`/`endTurn` string stays empty (no markers added).
  - Add a case asserting `handlers.finished` → `onDone` still receives the **raw**, undelimited
    final answer (extending the existing "calls onDone with the last answer" test or adding a
    dedicated one).

## Out of scope

- Any other place ACP-like text appears (monitor's context snapshot, `harness capture`, etc.) —
  the issue is specifically about the `acp <prompt>` command's own transcript output, and
  `makeUpdateRunning`/`runner.ts` has exactly one caller (`AcpManager.run`), so no other feature
  is affected either way.
- Streaming markdown rendering nuances (the entry already carries `markdown: true`) — the
  delimiter lines are plain text and render as an ordinary paragraph; no markdown-specific
  handling is needed.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected server tests.
- Manual: not practical to drive a live ACP session in this environment; covered by the unit
  tests above instead.
