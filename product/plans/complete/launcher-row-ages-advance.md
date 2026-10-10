# Tick the rail's clock while the launcher is on screen

**Complexity: 4/10** — one minute clock that runs only while it is wanted, one value threaded to the rows, and fake-timer tests at the three boundaries the wording changes at.

A row's age is `relativeTime(row.lastActivity)` in `web/src/plugins/launcher/LauncherTabRowView.tsx`, which defaults its `now` to `Date.now()` at the moment of the render. Nothing schedules another render: the payload arrives on a `tabs` broadcast, and `src/plugins/launcher/payload.ts` deliberately drops a republish whose rows have not moved, so an idle tab's row keeps the age it was drawn with. A tab that has done nothing for an hour reads "1m" for an hour — the row says the opposite of what the list promises, and the list's whole claim is that recency is visible.

The cost of fixing this is the reason it is worth being careful about. A tick per row is a render per minute, which is nothing; a broadcast per minute would be exactly the per-mutation traffic the minute-rounded `lastActivity` exists to avoid. So the clock belongs to the view, not to the host and not to the payload.

## Goal

A row's age advances while the launcher is on screen, with no server broadcast and no ACP prompt, and stops when the launcher is not.

## Approach

1. **`web/src/plugins/launcher/useClock.ts`** (new) holds one `now` and a minute interval. It runs only while the launcher is visible, and the interval is cleared when it stops being visible or unmounts. The cadence is one minute because that is the coarsest unit a row's age is expressed in: a finer tick would re-render rows that cannot look different.
2. **`LauncherTab`** reads the clock and passes its value down through `LauncherTabList` to `LauncherTabRowView`, which hands it to `relativeTime` instead of letting the helper read the clock itself. The pure conversion in `time-ago.ts` keeps its own coverage unchanged.
3. The hook's `now` is seeded when the tab becomes visible rather than left at the value from when it was hidden, so a rail returned to shows the age as of its return.

### Rejected alternatives

- Re-rendering on every `tabs` broadcast and hoping the payload changes. It is exactly what does not happen: the broadcast is dropped when the rows have not moved.
- A one-second clock so the ages are second-precise. A row's age is minute-rounded by the host, so a second-resolution render would repaint identical text sixty times a minute.
- Having the host re-publish `lastActivity` on a timer. It would put the launcher's own cadence onto the state bus, which is the traffic the minute rounding exists to prevent.

## Implementation steps

1. Add `useClock`.
2. Thread its value from `LauncherTab` through `LauncherTabList` into `LauncherTabRowView` and `relativeTime`.
3. Add the client tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: with a payload that never changes and fake timers running, a row's age advances across a minute boundary, then an hour, then a day — the three points the wording changes at.
- The clock stops when the launcher is not visible: advancing timers while it is hidden changes nothing, and advancing them again once it is visible moves the age on.
- `web/src/plugins/launcher/time-ago.test.ts` keeps its pure-conversion coverage untouched.

## Spec updates

- `product/specs/launcher.md`: a row's age coarsens on its own while the launcher is on screen, without anything being broadcast or prompted.

## Out of scope

- Re-sorting the rows as they age. The rows stay in tier order by design; the timestamp is the recency answer.
- A different age for the hover card's "active … since" wording. It reads the same value a row does.
