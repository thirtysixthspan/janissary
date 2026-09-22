# Date a replayed notification whose detection time is not today

Complexity 4/10 - one new small function plus a one-line change at `notify()`'s single call
site, following the plan's own instruction to add a sibling rather than change
`formatTimestamp`'s shape, since it has no other production readers to risk but is still worth
leaving alone as a pinned, independently-tested primitive.

`formatTimestamp` in `src/notifications.ts` renders a twelve-hour clock time with no date, and
`notify()`'s `detectedAt` parameter can be up to the full seven-day detach window old, so a
notification replayed on reattach reads as `9:05am` exactly like one raised minutes ago.

## Goal

A notification whose `detectedAt` falls on a different calendar day than now renders with a
short date prefix (`Sep 20 9:05am`); a same-day time renders exactly as `formatTimestamp`
already does today, byte-identically, since every existing call site passes the default `new
Date()`. The comparison is on local calendar day, not elapsed hours, so an event from 11pm last
night is dated even though it is only a few hours old.

## Approach

Add `provenanceTimestamp(detectedAt: Date, now: Date = new Date()): string` to
`src/notifications.ts`, directly below `formatTimestamp`. It compares `detectedAt` and `now`'s
year/month/date; on the same calendar day it returns `formatTimestamp(detectedAt)` unchanged;
otherwise it prefixes a short month/day (`Sep 20`) built from a fixed three-letter month-name
table (avoiding `toLocaleDateString`, whose output shape is locale/ICU-dependent) ahead of the
same time string. `notify()`'s header line changes from `` `${formatTimestamp(detectedAt)}
${tabLabel}` `` to `` `${provenanceTimestamp(detectedAt)} ${tabLabel}` ``. `formatTimestamp`
itself is untouched, so its own five existing test cases keep pinning the bare time format
`provenanceTimestamp` builds on.

## Implementation steps

1. Add `provenanceTimestamp` to `src/notifications.ts`.
2. Change `notify()`'s `from` line to call it instead of `formatTimestamp` directly.
3. Run `check-diff`.

## Tests

`src/notifications.test.ts`'s `notify` block (system time fixed at `2026-01-01 20:32:00` via
`vi.setSystemTime`):

- Keep "stamps the header with a given detectedAt time rather than now" and "defaults
  detectedAt to now when not given" exactly as written — both pass a same-day `detectedAt` (or
  none) and must keep rendering the bare time.
- Add a case for a `detectedAt` several days back (e.g. `2025-12-28 9:05am`) asserting the
  header reads `Dec 28 9:05am janus`.
- Add a case for a `detectedAt` at 11pm the previous calendar day (only a few hours before the
  fixed "now"), asserting it is still dated — proving the comparison is calendar-day, not an
  elapsed-hours threshold.

## Out of scope

- `formatTimestamp` itself — its exported shape and existing five test cases are unchanged.
- Any other caller of `formatTimestamp`; a repo-wide grep found none besides `notify()` and its
  own tests.
