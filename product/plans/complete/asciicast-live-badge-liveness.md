# Show `live` for as long as a recording's session is still recording

Complexity: 5/10

## Goal

Make the `live` badge mean what the spec says it means — the session that is writing this recording is still running — so a live harness waiting on the next prompt no longer looks identical to a session that has finished.

## Background

The badge is rendered from `source.growing`, and `growing` is true only when the most recent poll brought new bytes. A poll that finds nothing sets it false, and an agent between two prompts produces no bytes for as long as the user takes to type the next one — which for this harness is minutes. So the badge disappears while the session is very much alive.

The plan argues the badge's presence is what distinguishes a live recording whose session has finished from a finished recording, and reasons that no bytes means the session has finished. That inference is wrong for an interactive session: no bytes means the session is *quiet*, which is its normal state. The two are distinguishable only by asking, and now that a recording carries its own exit event, the natural end of a session is visible in the file — but a recording ended by closing its tab is not, and that is the case the host has to answer.

## Approach

Split the two facts the tab is conflating.

`AsciicastSource` reports `live` instead of `growing`. It starts from the host's answer at open — the payload's `finished` flag, which is `!isRecordingLive` — and is a latch: once it is false it is never true again for that recording, because a session cannot resume writing a recording the host has stopped watching.

The file cannot answer the question on its own, so the plugin gets the one capability it already declares — `isRecordingLive` — to the client as an intent. A poll that brings bytes needs no question: bytes arriving is proof enough. A poll that brings nothing asks, and the answer either keeps the latch or clears it. That bounds the extra traffic to exactly the case that needs it, and stops once answered. A failed ask keeps the latch, since a recording that is still being written should not be declared finished because the host did not answer.

The recording's own exit event clears the latch too, so a session that exits on its own needs no round trip at all.

`usePlayback`'s live flag becomes this same `live` rather than `!finished && growing`. That is a simplification rather than a change: holding at the end of what has been recorded was always meant to be about the session, and a session that is live and quiet now holds instead of reporting the playback finished — the behaviour the spec describes and the old condition could not produce.

## Implementation steps

1. Give the asciicast activation one intent, `liveness`, answering whether a live tab still holds this tab's own recording. Its manifest already declares `isRecordingLive`; the capability is what answers.
2. Change `useAsciicastSource` to take the host's answer at open and a way to ask again, and report `live` as the latch described above. Drop `growing`: once the badge and the hold both read `live`, nothing consumes it.
3. Point `AsciicastMeta`'s badge and `usePlayback`'s live flag at `source.live`.

## Tests

- A live recording whose poll brings nothing stays live while the host says its session is still writing, and stops being live once the host says otherwise.
- A poll that brings bytes asks the host nothing.
- A recording carrying its own exit event is not live whatever the host says.
- A recording finished when it opened is never live and never asks.
- A host that fails to answer leaves the latch alone, so a recording in progress is not declared finished by an unanswered question.
- The tab: the badge shows for a session that is live and quiet, and the transport holds at the end of what has been recorded rather than reporting finished.
- The server intent answers from the host capability for the tab's own path, and the empty intent table's rejection of an unknown name still works.

## Out of scope

- Polling a finished recording less often than it does now. The poll chain stays as it is; only the extra question is bounded.
- Any change to what the host considers a live recording, which is `liveRecordingPaths` and unchanged.
- Inventing an exit event for a session ended by closing its tab. The specs say none is invented, and the question is now asked of the host instead.