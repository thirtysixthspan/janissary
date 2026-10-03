# Own each replay read lifecycle

Complexity: 5/10 (threshold: 7).

## Goal

Read each recording byte once even when the initial load is slow or visibility changes, and prevent replaced recordings from publishing late responses.

## Approach

Extract a framework-free `AsciicastReader` in `web/src/plugins/asciicast/source-reader.ts`. One instance owns a URL, parser, decoder, offset, fetch cancellation, and a single polling chain. Disposal marks that instance stale before aborting it. The hook owns the reader lifecycle and forwards current visibility and the latest host capability. Retain comments explaining streaming decoding, liveness, and stale async results; deferred test fixtures may use ES2023 lint annotations.

## Implementation steps

1. Extract the reader and thin `web/src/plugins/asciicast/useAsciicastSource.ts`; update imports in its existing tests. Add lifecycle regressions alongside those hook tests.
2. Update `product/specs/harness-recording.md` and the existing live-recording behavior in `documentation/user-documentation/tab-types/recording-player.md`. No help commands change.
3. Complete this plan and remove only the resolved backlog entry.

## Tests

Keep all current source and parser tests. Add delayed initial fetch, hide/show during a pending poll, late body from a replaced URL, unmount cancellation, and late host liveness answer after URL replacement. Assert exact event counts and byte ranges, current-source liveness, abort signals, and no post-disposal requests. Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

Playback timing, recording format changes, HTTP response policy changes, server recording limits, and other backlog entries.
