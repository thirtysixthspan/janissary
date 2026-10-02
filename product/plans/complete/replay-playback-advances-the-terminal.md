# Advance the replayed terminal as the recording plays

**Complexity: 2/10** — one call in one effect, a corrected comment, and two test cases; there is nothing to design and nothing to remove.

Playing a recording moved the seek bar and nothing else. The clock's tick advanced a position and published it as state — which is what draws the seek bar's thumb and the clock readout — but never asked the terminal to show the frame at that position. The only thing that ever called `terminal.renderUpTo` while playing was a separate effect keyed on the recording's length, so a finished recording sat on its first frame for the whole of its run: the timeline went to the end and the terminal never moved off frame zero. Dragging the seek bar worked because a seek goes through the same path that shows a frame, and so did stepping, and so did a recording still being written — its length grows as output arrives, which is what re-fired that effect. The clock now shows each frame it reaches.

## Design decisions

**The tick calls `show`, not `setPosition`.** `show` is already the one place that clamps a time to the recording, moves the clock's mirror, publishes the position, and renders the frame, so the interval calls it and the three steps cannot come apart again. Nothing else in the hook changes shape.

**Twenty render calls a second is the cost, and `renderUpTo` is written for it.** The terminal's `renderUpTo` resumes from an index into the timeline rather than walking from the start, so a tick that crosses no event does no work at all and a tick that crosses several writes only those. That is the same call a seek already makes, so this adds no new path into the terminal.

**The length-keyed effect stays.** It re-shows the current position whenever the recording grows, which is what catches up a *paused* live replay: a paused clock does not tick, so an event that lands behind the paused position is only fed by this. Its comment said it was there because compression moved every timestamp after the first gap, which is no longer true; it now says what it actually does.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The one path that shows a frame, whatever asked for it | `web/src/plugins/replay/usePlayback.ts` (`show`) |
| The terminal's incremental render, which is what makes a per-tick call cheap | `web/src/plugins/replay/useReplayTerminal.ts` (`renderUpTo`, resuming from `cursor.index`) |
| The fake terminal that already records every time it was asked for a frame | `web/src/plugins/replay/usePlayback.test.ts` (`fakeTerminal`, its `shown` array) |
| The fake-timer clock cases this change lands beside | `web/src/plugins/replay/usePlayback.test.ts` § `usePlayback — the clock` |

## Proposed changes

### The client

`web/src/plugins/replay/usePlayback.ts`: the clock's interval calls `show(next)` in place of writing `clock.current.position` and calling `setPosition`, and lists `show` among the effect's dependencies. The effect keyed on the recording's length keeps its behavior and gets a comment that describes it.

### Tests

`web/src/plugins/replay/usePlayback.test.ts`, in the existing `usePlayback — the clock` describe, beside the two cases that already advance fake timers:

- **the terminal advances while the recording plays.** The fake terminal's `shown` array must receive more than one distinct time while the clock runs, and the last one must be the position the transport reports. Against the old code `shown` holds a single `0` for the whole run, because only the length-keyed effect ever rendered.
- **the last frame is what is left on screen at the end.** After a finished recording has played out, the last time the terminal was asked for is its final event's time, so the viewer is looking at the end of the session rather than at whatever frame the last length change left up.

## Out of scope

- The clock's rate, its speed ladder, and the 50 ms tick.
- The end-of-timeline rule — a finished recording stopping and a live one holding — which the clock cases already cover and this change leaves alone.
- Reconstructing frames on a backward seek, and the terminal's own cursor bookkeeping.
- The pull request's description, whose "How to verify" describes watching a replay play. `update-pull-request.md` owns it at merge time; this entry names no description change.
- `product/plans/complete/in-app-recording-replay.md`, which describes the clock rather than this wiring.

## Verification

`./scripts/run.mjs check-diff`.