# Normalize activity transcript-tail limits

**Complexity: 3/10** — normalize one optional numeric limit and pin its boundary behavior in the activity reader tests.

`tabActivityRows` currently treats every defined `tailLines` value as a request for transcript content. JavaScript's `slice(-0)` and `slice(-NaN)` select the full log, and non-finite values can build a large intermediate string before the character cap.

## Goal

Attach transcript tails only for usable positive finite limits, preserving the existing no-tail behavior when the limit is omitted.

## Approach

1. Normalize the limit once per `tabActivityRows` call, flooring positive finite values to a whole entry count and omitting a tail if the result is zero.
2. Add boundary coverage for zero, negative, NaN, Infinity, a positive fraction below one, and valid limits of one and eight.
3. Document the limit behavior on `tabActivity` in the published API and developer guide.

## Tests

- `src/plugins/activity.test.ts`: invalid, zero, and below-one limits carry no tail; one and eight return the requested newest entries.
- Run `./scripts/run.mjs check-diff` after the implementation and test/documentation changes.

## Out of scope

- Changing the transcript character cap or the tail text formatting.
- Changing the launcher's current eight-entry request.
