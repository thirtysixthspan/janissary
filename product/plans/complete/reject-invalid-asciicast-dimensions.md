# Reject invalid terminal dimensions in asciicast headers

**Complexity: 3/10** — one production file edited, one shared predicate added, 5 behavioral requirements and 19 test scenarios, with no new module and both files well under the 200-line limit (p=4.74).

## Goal

Refuse a recording whose header declares terminal dimensions that are not positive safe integers, so a malformed file cannot hand a nonsensical grid to the terminal emulator. Valid v2 and v3 recordings keep playing, and recorded resize events keep applying.

## Approach

`parseCastHeader` in `web/src/plugins/asciicast/cast-stream.ts` currently checks only `typeof cols !== 'number' || typeof rows !== 'number'` before returning the header. A header carrying `Infinity`, `NaN`, a negative number, a fraction, zero, or an integer past the safe range passes that guard, and `createAppTerminal` in `useAsciicastTerminal.ts` builds a terminal at that size: the tab renders blank, allocates a huge grid, or throws on first render. The sibling `parseResize` in the same file is stricter — it requires `/^\d+$/u` on both parts — but that regex still accepts `0` and digit strings whose numeric conversion is not a safe integer.

Add one local pure predicate, `isPositiveDimension(value: unknown): value is number`, to `cast-stream.ts`: `typeof value === 'number' && Number.isSafeInteger(value) && value > 0`. Use it in the header guard in place of the two `typeof` checks, so both dimensions must be positive safe integers. Use the same predicate on the numbers `parseResize` derives from its regex, so the two boundaries that feed terminal dimensions share one rule.

`useAsciicastTerminal.ts` needs no change: it only receives headers that the parser has already validated. The existing error string is kept, and the metadata line still reports the reason exactly as before.

## Implementation steps

1. In `web/src/plugins/asciicast/cast-stream.ts`, add the `isPositiveDimension` predicate near the other local helpers and use it in the `parseCastHeader` dimension guard.
2. In the same file, run the two numbers produced by `parseResize` through `isPositiveDimension` before returning a `CastResize`.
3. Add the tests listed below to `web/src/plugins/asciicast/cast-stream.test.ts`.
4. Update `product/specs/harness-recording.md` to state the accepted shape of the header dimensions.

## Tests

`web/src/plugins/asciicast/cast-stream.test.ts` keeps its existing cases and adds:

- Header cases in the `refuses` table for `Infinity`, a negative value, a fraction, zero, and an integer beyond `Number.MAX_SAFE_INTEGER`, each asserting a non-empty error.
- A case asserting a valid header is still read for both v2 and v3 (the existing cases cover this and stay).
- A `CastStream` case asserting a resize with a zero dimension is ignored, confirming the shared predicate is applied on the resize path too.

## Spec

`product/specs/harness-recording.md`: state in the file-format section that a header's `cols` and `rows` must each be a positive whole number, and that a header carrying a missing, fractional, non-finite, zero, or out-of-range dimension is refused with the reason shown on the metadata line.

## Out of scope

- Changing `useAsciicastTerminal.ts` or the terminal factory; validation belongs at the parse boundary.
- Changing the existing error string or the metadata-line presentation of it.
- Bounding how large a valid safe-integer dimension may be; a large but safe value is still accepted.
- Any change to recording capture, the tab plugin contract, or command behavior.
