# Stop auto-resume detection during a usage-limit blockage

**Complexity: 2/10** — one existing observer guard is too permissive when changing captures still show the same usage limit. Keep the observer latched for that blockage, with direct unit coverage and a short spec correction.

## Goal

When a recognized usage limit schedules an auto-resume, changing captures of that same limit must not replace or reschedule the pending retry. After the retry is delivered, the same still-visible limit must not trigger another attempt. Detection re-arms once the screen no longer shows a schedulable limit.

## Approach

Use `HarnessAutoResumer.actedAt` as the per-blockage latch. Once set, ignore further recognized limit captures until an unrecognized screen clears it. Continue cancelling a pending scheduled entry when the blockage clears, and preserve the existing scheduling, notification, and parked-state behavior.

## Implementation steps

1. Change the resumer to return for an already-latched blockage instead of comparing newly calculated retry instants. Add tests proving changed limit captures do not reschedule before or after delivery, and that clearing the limit allows a later blockage to schedule.
2. Update the auto-resume behavior in `product/specs/harness.md` to state that refreshed limit captures do not replace the scheduled retry and that detection re-arms after the blockage clears.

## Tests

- In `src/harness/auto-resume.test.ts`, verify a changed limit screen leaves the original scheduled instant untouched both before and after `onSettled()`.
- Verify an unrecognized screen clears the latch and a subsequent recognized limit schedules a new resume.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Changing reset parsing, schedule timing, notification wording, or the resume prompt.
- Changing user documentation or help output; they already describe one resume per limit and the existing flags.
