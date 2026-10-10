# Coalesce tabs plugin notifications

Complexity: 5/10

## Goal

Keep bursts of raw tab-state changes from repeatedly scanning tab activity and invoking notification handlers.

## Approach

Give only the `tabs` topic a 100 ms coalescing window. The source schedules one delivery for a burst, and the existing dispatcher reads current topic data and checks subscriber eligibility when the timer fires. Unsubscribing removes the bus listener and cancels pending work.

## Implementation steps

1. Add the tabs-only scheduled subscription in `src/plugins/topics.ts`, preserving immediate delivery policies for every other topic.
2. Add fake-timer integration coverage for latest focus and unread state, host disposal, and a plugin disabled before delivery.
3. Update the tab-plugin behavior spec and topic contract comment to describe the bounded coalescing window.

## Tests

- Extend `src/plugins/notifications.test.ts` to cover one delivery for a burst, latest state, and cancellation or eligibility changes before delivery.
- Run `./scripts/run.mjs check-diff` after implementation and spec updates.

## Out of scope

- Changing the tabs payload, launcher row comparison, or delivery policy for other topics.
- Adding a new bus channel or moving tab activity computation.
