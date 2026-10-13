# Shell transcript writer: bound the unparsed xterm backlog

**Complexity: 5/10** — a small change confined to `ShellTranscriptWriter` (a counter, a cap, a fail-once guard, and a non-throwing finishing path), but it reasons about xterm's asynchronous `WriteBuffer`, a failure that can arrive from inside xterm's own parse loop, and two failure sources that must report once between them.

## Goal

Keep the shell transcript writer inside the promises of subplan 04 (`product/plans/complete/shell-tab-text-transcript-04-transcript-writer.md`) when a shell produces output faster than the headless terminal parses it: every failure fires `onFailure` once, nothing throws into the bus or out of `dispose()`, the file stream is always released, and in-memory pending output stays bounded.

## Problem (verified against `@xterm/headless` 6.0.0)

`WriteBuffer.write` in `node_modules/@xterm/headless/lib-headless/xterm-headless.js` throws `write data discarded, use flow control to avoid losing data` from every `write` call — the empty `write('', cb)` included — once more than 50,000,000 characters are queued unparsed. Each chunk's callback runs right after that chunk is parsed. The writer passes every PTY chunk to `term.write` with no accounting, so a burst that outruns the parse:

- loses later chunks with only the bus's stderr line per chunk and no `onFailure`;
- makes `finish()` throw before it registers its drain callback, so `dispose()` throws and the file stream and terminal leak;
- holds up to ~100 MB of UTF-16 strings in memory, well beyond the 4 MiB bound the writer otherwise keeps;
- can throw out of xterm's timer-driven parse loop (an uncaught exception) when the file's own 4 MiB limit trips inside a line-feed handler and `fail()` then calls `term.write('')` against an overfull buffer.

## Approach

- A named cap, `MAX_UNPARSED_CHARS = 4 * 1024 * 1024`, beside `SCROLLBACK_ROWS`, with a comment naming xterm's 50,000,000-character discard watermark it stays far below. The constructor takes an optional seventh argument, `maxUnparsedChars`, defaulting to it, so tests can use a small cap; subplan 05's six-argument call is unchanged.
- `onData` counts characters handed to xterm and not yet parsed: a chunk that would push the count past the cap stops the transcript through `fail()` instead of being written; an accepted chunk adds its length and passes a per-chunk callback that subtracts it.
- Every `term.write` goes through one `queue(data, parsed)` helper that catches xterm's throw and returns `false`. `onData` and `onResize` treat `false` as a failure; `finish()` treats it by closing at once without the final flush.
- `fail()` gets its own `failed` flag so it is idempotent across both sources (the cap and `BoundedAppendFile`'s once-only `onFailure`).
- Deviation from the review's proposal: `fail()` does **not** dispose the file up front. The chunks already accepted are under the cap, so letting the drain parse them writes their finished rows and the transcript ends on a prefix of complete rows of what the shell printed. The final flush of the cursor's row is skipped after a failure, because that row may be the start of output that was dropped. If the file's own limit trips during that drain, the `failed` flag keeps `onFailure` at one call. Memory stays bounded: at most the cap in unparsed characters, and the file's 4 MiB pending rule on what reaches the stream.

## Implementation steps

1. `src/shell/transcript/writer.ts`: add `MAX_UNPARSED_CHARS` with its comment, the optional `maxUnparsedChars` constructor argument, `unparsed` and `failed` fields, the `queue` helper, the cap check and per-chunk callback in `onData`, the guarded write in `onResize`, the idempotent `fail()`, and a `finish()` whose drained callback and synchronous fallback share one `close(flush)` method. Update the class comment and the `fail()` comment.
2. `src/shell/transcript/writer.test.ts`: the cases below.
3. Spec text: the shell transcript's user-facing spec is written by subplan 08 (`product/plans/draft/shell-tab-text-transcript-08-specs-docs-and-end-to-end.md`), which states decision 7's 4 MiB pending limit; extend that bullet so the spec it produces also states that output arriving faster than it can be transcribed stops the transcript the same way.

## Tests

In `src/shell/transcript/writer.test.ts`:

- A burst over the unparsed cap (small test cap; complete rows, then a chunk that would exceed it, then more data) fires `onFailure` exactly once, no `emit` throws, `dispose()` afterwards does not throw, and the file holds exactly the complete rows accepted before the overflow.
- Output whose total exceeds the cap but arrives after earlier chunks have been parsed does not fail: the per-chunk callback releases the count.
- When xterm refuses writes (its `write` stubbed to throw the discard error), a `data` event fires `onFailure` once without throwing, and `dispose()` does not throw.

Existing writer tests stay unchanged; `src/bounded-append-file.test.ts` keeps covering the file's own limit.

## Out of scope

- PTY flow control (pausing the shell while the transcript catches up).
- Making the row tracker's per-line work cheaper.
- Installing the writer on tabs and the failure notification (subplan 05); the spec itself (subplan 08).
