# Remove idle handling from the replay player

**Complexity: 4/10** — a deletion across two halves of one feature (the client's compression rule and the recorder's header field) with no new behavior anywhere; the number comes from the width rather than the depth, because "all aspects" reaches a module rename, a hook's signature, a transport control, a keyboard chord, a CSS rule, a recorded header field, six test files, two specs, and two documentation pages, and every one of them has to land together or the feature stops compiling.

The replay tab compresses a finished recording's silences: it writes `idle_time_limit: 2` into every recording's header, reads it back, and plays every gap longer than it at two seconds, with a transport control and the `i` chord to change the limit per viewing. That was the plan's third depth gap, argued from asciinema's own advice, and it is the wrong call for this app: the recording is the only record of what a session did, and compressing the gaps silently changes its timeline, so what the player shows is not what happened. A run that waited ten minutes and one that thought for ten minutes become indistinguishable. Remove it. The recording plays at the timing it was recorded at, and nothing in the feature carries an idle limit any more.

## Design decisions

**Idle handling goes from both halves, not one.** The client side is the obvious half: the compression rule, its control, and its chord. The recorder side is the one that is easy to leave behind — it writes `idle_time_limit` into every `.cast` header, which nothing in the app honors once the player stops reading it. A recording that carries a limit no player here applies is a claim the app no longer makes, so the field is dropped from the writer and from the reader. The field is optional in both asciicast v2 and v3, so the files stay valid; `asciinema play` uses its own default.

**A foreign recording carrying `idle_time_limit` still opens.** The reader drops the field rather than refusing a file that has it, which is what it already does with `env` and every other key the format permits and this app does not use. A `.cast` written by a current asciinema states a limit, and that recording plays at its recorded timing.

**`live` survives, and only the compression went.** `live` decides what reaching the end of the timeline means — a finished recording stops there and a recording still being written holds its last frame and continues — and that is independent of idle handling. It also decides when the metadata line reads `live`, and it decides the `finished` flag the opener's `isRecordingLive` capability produces. Only the `applied = live ? 'off' : idleLimit` derivation that compression needed goes.

**The timeline helpers move to `timeline.ts`.** `durationOf`, `eventsUpTo`, and `stepIndex` are not idle rules — they are how a timeline is measured and stepped — and they lose their module to the deletion. The module is renamed rather than emptied, so the file name still says what is in it. Its test file moves with it, keeping the three describes that are not `compressIdle`'s.

**`ReplaySource.recorded` goes with it.** It is documented as "the length of the recording as written, before idle compression" and had no consumer even while compression existed; with compression gone it would be `duration` under another name.

**The `i` chord is removed, and so is `i` from both key tables.** The chord was added in this pull request and documented in `documentation/user-documentation/tab-types/recording-player.md`, `documentation/user-documentation/advanced-agents/harness.md`, and the pull request's own description. Every chord the transport offers is also a button, and the two that remain are unaffected.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The pure timeline rules that stay — measure, step, filter | `web/src/plugins/replay/idle-compression.ts` (`durationOf`, `eventsUpTo`, `stepIndex`) |
| The clock, the end-of-timeline rule, and the reset-and-replay a backward seek needs | `web/src/plugins/replay/usePlayback.ts` |
| The header the recorder writes and the recorder's call into it | `src/harness/cast-header.ts`, `src/harness/recorder.ts` |
| The v2/v3 header reader | `web/src/plugins/replay/cast-stream.ts` (`parseCastHeader`) |
| The recorded limit's documented places | `product/specs/harness-recording.md` § File format, § Retrieval; `product/specs/tab-plugins.md` § replay plugin |

## Proposed changes

### The client

`web/src/plugins/replay/idle-compression.ts` becomes `web/src/plugins/replay/timeline.ts`, holding `durationOf`, `eventsUpTo`, and `stepIndex` and nothing else; `IdleLimit`, `IDLE_LIMITS`, `nextIdleLimit`, and `compressIdle` are gone.

`web/src/plugins/replay/usePlayback.ts` drops the `recordedIdleLimit` parameter, the `idleLimit` field and `cycleIdle()` on `Playback`, the `idleLimit` state, the `SELECTABLE` set, the effect that adopted the recorded limit as a default, and the `applied` derivation. The timeline is the recorded events, `duration` is measured from them on each render, and the hook's `live` parameter is unchanged. The three effects that referenced the compressed timeline now reference the events.

`web/src/plugins/replay/TransportBar.tsx` loses the `idle` button; `web/src/plugins/replay/replay.css` loses the `.replay-idle` selector, leaving `.replay-speed` on its own.

`web/src/plugins/replay/ReplayTab.tsx` loses the `i` case from `onKey` and the `source.header?.idleTimeLimit` argument, and its comments stop describing compression.

`web/src/plugins/replay/cast-stream.ts` loses `idleTimeLimit` from `CastHeader` and the `idle_time_limit` read that filled it.

`web/src/plugins/replay/useReplaySource.ts` loses `recorded` from `ReplaySource`, `EMPTY`, and `publish`.

### The recorder

`src/harness/cast-header.ts` loses `idleTimeLimit` from `CastHeaderInput` and `idle_time_limit` from the object it returns, and the header comment's paragraph about it.

`src/harness/recorder.ts` loses the `IDLE_TIME_LIMIT` constant and the field it passes.

### Tests

`web/src/plugins/replay/idle-compression.test.ts` becomes `web/src/plugins/replay/timeline.test.ts`, keeping the `eventsUpTo` and `stepIndex` describes and dropping `compressIdle`'s.

`web/src/plugins/replay/usePlayback.test.ts` loses the four idle cases and the `recordedIdleLimit` option, and its setup passes the events, terminal, and `live` only. The cases that survive are the clock, the speed ladder, the frame step, the seek, and the two end-of-timeline behaviors.

`web/src/plugins/replay/ReplayTab.test.tsx` loses the idle assertions from the transport case, and the chord case now cycles only the speed.

`web/src/plugins/replay/cast-stream.test.ts` and `web/src/plugins/replay/useReplaySource.test.ts` keep their fixture headers carrying `idle_time_limit` — a foreign recording does — and stop asserting it was read.

`src/harness/recorder.test.ts` loses the `idle_time_limit` assertion from the v3 header case.

### Documentation and specs

`product/specs/harness-recording.md` loses the `idle_time_limit` bullet from § File format and the "compresses a finished recording's silences" bullet from § Retrieval; § Retrieval's transport bullet already lists the chords without `i`.

`product/specs/tab-plugins.md` § replay plugin drops the idle limit from the sentence naming the client's view-local state.

`documentation/user-documentation/tab-types/recording-player.md` drops the `i` row and the paragraph about a finished recording's compressed silences.

`documentation/user-documentation/advanced-agents/harness.md` drops the `i` row and the "A finished recording has its silences compressed" paragraph.

`help.md` is untouched: neither of its two replay rows mentions the transport.

## Tests

Server, colocated:

- `src/harness/recorder.test.ts` — the v3 header case no longer expects `idle_time_limit`, and the cases that pin the recorded theme, the `x` event, the lazy open, and the interval rounding are untouched.

Client, colocated:

- `web/src/plugins/replay/timeline.test.ts` — the surviving `eventsUpTo` and `stepIndex` describes, unchanged.
- `web/src/plugins/replay/usePlayback.test.ts` — a recording plays at the timing it was recorded at: the ten-minute-gap timeline reports a duration of 602 seconds rather than a compressed one, with no parameter left to ask for compression. The `live` cases stay: a finished recording stops at its end, a live one holds and keeps playing, and a finished recording reached its end starts again from the beginning.
- `web/src/plugins/replay/ReplayTab.test.tsx` — the transport case asserts the remaining controls with no idle button among them, and the `i` chord case becomes the speed chord case. A recording whose header carries `idle_time_limit` opens and plays as one that does not.
- `web/src/plugins/replay/cast-stream.test.ts` — the v2 and v3 header cases keep their fixtures' `idle_time_limit` and stop expecting it back, which is the pin that a foreign file carrying one still parses.
- `web/src/plugins/replay/useReplaySource.test.ts` — the first-read case stops expecting `idleTimeLimit` on the parsed header.

## Out of scope

- Any other idle behavior in the app: a harness going idle, the busy/ready dot, the idle escalation, the unread badge on a hidden idle tab, tab dwell, and the sleep-and-resume idle timer all belong to other features and are not touched.
- The pull request's description, which names the compression, the `i` chord, and the control in its What, Behavior examples, How to verify, Files changed, and Additional test cases sections. `update-pull-request.md` owns it at merge time; this task's entry names no description change.
- `product/plans/complete/in-app-recording-replay.md`, the feature plan, which records the original decision to compress. It is history, and this plan is the record of the reversal.
- Markers, loop playback, a per-frame wall-clock timestamp, and the other gaps the feature plan declined.
- Fitting or scaling the recorded grid to the pane, which is a separate backlog entry.

## Verification

`./scripts/run.mjs check-diff`.