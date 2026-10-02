# Keep a hidden replay's read position across a hide

**Complexity: 3/10** — one effect split into two in a single hook, plus the cancellation guard that
split makes necessary. No new module, no behavior change while the tab stays visible.

`useReplaySource`'s effect depends on `[url, active]`, so a tab becoming visible again restarts it:
the parser is replaced, the byte offset returns to zero, and the whole recording is fetched and
re-parsed from the beginning every time the user switches away from a replay and back. That is a stall
that grows with the recording rather than with the time since the switch, on the view most likely to be
switched away from — a replay left open behind other work.

## Approach

Split the effect along the two things that actually change. The served reference changes once, when
the tab opens; visibility changes constantly. So the effect keyed on the reference owns the parser, the
offset, the decoder, and the one whole-file read, and a second effect keyed on visibility starts and
stops the poll chain against those same objects without touching them. Hiding therefore costs one
timer and nothing else, and showing costs one timer.

The cancellation flag has to be per-chain rather than per-effect, or a cleanup from an earlier
visibility value can cancel the chain that replaced it — which is the one way this split goes wrong,
and the reason the test names the range offset rather than the fetch count.

## Implementation steps

1. In `web/src/plugins/replay/useReplaySource.ts`, give the stream, the offset, and the decoder to refs
   that survive a visibility change, and move the whole-file read into the effect keyed on the
   reference alone.
2. Give the poll chain its own cancellation flag, so an effect cleanup can only stop the chain that
   effect started, and keep the visibility guard as the only thing deciding whether another poll is
   scheduled.
3. Leave the poll interval, the empty-body and 416 handling, and the growing/live reporting exactly as
   they are — they are already right, and the 750 ms chain is not what this changes.

## Tests

- `web/src/plugins/replay/useReplaySource.test.ts`: the existing case that polling stops while hidden
  and resumes when shown is extended to assert that the read after resuming asks for a range from the
  previous offset rather than reading the file from the beginning again. That assertion is the whole
  point of this change, and it fails against the previous behavior.
- Every other case in that file must keep passing untouched.

## Out of scope

- The poll interval, the idle limit, and anything about playback.
- Caching anything beyond the parser and the offset between hide and show.