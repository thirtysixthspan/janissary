# Live recording playback in real time

**Complexity: 2/10** — a two-line change in one hook, one test case, and no behavior anyone depends on
yet: the feature has not shipped, so the rule it broke was only ever the plan's and the specification's.

`usePlayback` compresses the timeline whatever the recording's liveness says, and every recording this
version writes carries `idle_time_limit: 2`, so a replay of a session that is still running sprints
through the session's silences and then sits pinned at the newest frame. The plan decided the
opposite — "Compression applies only to a finished recording, and a live one plays in real time" — and
`product/specs/harness-recording.md` § Retrieval and the user documentation both say so. A `live` badge
on a visibly wrong timeline is the only hint otherwise.

## Approach

One rule, in the hook that already knows both facts. The compressed timeline is what the player
addresses, so it is built from the effective limit, and the effective limit is `off` for a live
recording. The control keeps showing and cycling the user's choice, so that when the session ends the
limit the recording stated applies without the user having to set it again — the choice is remembered
through the live period rather than discarded, which is the same reason the recorded default is not
overwritten by cycling it.

Nothing else moves: the recorded default, the cycle order, the end-of-timeline behavior, and the
reported duration all stay as they are.

## Implementation steps

1. In `web/src/plugins/replay/usePlayback.ts`, derive the effective limit from liveness once, and
   build the timeline from it rather than from the stored limit. Report the effective limit as
   `idleLimit` so the control's own label is what it is applying.
2. Leave `cycleIdle` writing to the stored limit, so a choice made while a recording is live is the
   one that applies once it is not.

## Tests

- `web/src/plugins/replay/usePlayback.test.ts`: a live recording reports the uncompressed duration and
  shows `idle off`, while a finished recording of the same events reports the compressed one and shows
  the limit its header stated. The existing cases in that file already cover the finished side and
  must keep passing untouched.
- `web/src/plugins/replay/idle-compression.test.ts` covers the rule in isolation and must not change.

## Out of scope

- Recording a limit, or changing which limit a new recording is written with.
- Anything about the recorded format, the commands, or the plugin.
