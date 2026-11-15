# Make the exactly-limit sentinel timeout case reach the limit it names
**Complexity: 1/10** — no production code, one existing test case repaired, 1 requirement and 1 scenario (p=2.32244).

## Goal

The `scanFiles deadlines` case `returns timeout while seeking a sentinel after exactly the limit` in `src/file-grep/scan.test.ts` passes `args()`, whose default is `limit: 100`, while its worker returns one row. The read that times out is therefore an ordinary next-candidate read: the scan has retained one of 100 rows and is nowhere near its sentinel search. Passing `args({ limit: 1 })` makes the first candidate's single row reach exactly the requested limit, so the pending second read is the sentinel search the case names. The case keeps its existing retained-row and timeout-ending expectation and gains a reader-call count asserting the scan continued past the limit instead of stopping there.

## Reading

- `scanFiles` in `src/file-grep/scan.ts` sets `cap = args.limit + 1`. It appends each matching batch up to the remaining cap, then returns the limit ending only when the sentinel row fills `cap`.
- Reaching exactly `args.limit` rows does not return. The loop continues through the remaining candidates to discover whether a further matching row exists, which is the sentinel search.
- With the default limit of 100, the current case retains one row and then awaits `b.txt`, so its pending read is the next ordinary candidate read. With `limit: 1`, the row from `a.txt` is exactly the limit and the pending `b.txt` read is the sentinel search.
- `withDeadline` in `src/file-grep/deadline.ts` resolves timeout when the timer for the injected deadline fires, and the scan selects the retained rows with the timeout ending before aborting.
- The neighbouring cases `continues after exactly the limit and finds a later sentinel` and `exhausts remaining candidates after exactly the limit without a sentinel` already cover the completed sentinel and the exhausted continuation. This case covers expiration during that same continuation. They pass unchanged.

## Decision

The fix is test-only and confined to the one case. No production code changes: `scan.ts`, `deadline.ts`, and `read-candidate.ts` already implement exactly-limit continuation and timeout selection correctly, and the plan's requirement is to pin that combination. The repaired case proves both states the case names: exactly the requested limit retained, and a timeout while the sentinel read is pending.

## Approach

1. Change the case's `scanFiles` call from `args()` to `args({ limit: 1 })`.
2. Keep the worker returning `[first]` for `a.txt`; that one row now equals the limit.
3. Keep the `b.txt` read pending on the deferred promise, so its read is the sentinel search that times out.
4. Keep the `rows: [first]` / `ending: { kind: 'timeout' }` expectation and the single worker disposal assertion.
5. Add `expect(reader).toHaveBeenCalledTimes(2)` after the result assertion, proving `a.txt` was read and the scan continued to `b.txt` rather than stopping at the limit.

## Implementation steps

1. Edit the `returns timeout while seeking a sentinel after exactly the limit` case in `src/file-grep/scan.test.ts`: replace `args()` in its `scanFiles` call with `args({ limit: 1 })`.
2. Add `expect(reader).toHaveBeenCalledTimes(2);` before the existing `expect(worker.dispose).toHaveBeenCalledOnce();` line.
3. Run `$janissary/scripts/run.mjs check-diff` and confirm the case and its two neighbours pass.

## Tests

No new cases are added. The existing case is corrected to exercise the state its name claims, with the added reader-call assertion distinguishing continuation from an early limit stop. The two neighbouring exactly-limit cases must pass unchanged and keep their current assertions.

## Verification

`$janissary/scripts/run.mjs check-diff` must report no lint, typecheck, or test failure. The changed case must still resolve to the retained row with the timeout ending, and the whole `src/file-grep/scan.test.ts` suite must pass. `git diff` must show only the two lines in that one case.

## Spec and documentation

No user-visible behavior changes. The case pins existing scan behavior, so no file under `product/specs/` changes, and neither `help/` nor `documentation/user-documentation/` documents this test or its coverage.

## Out of scope

- `src/file-grep/scan.ts`, `src/file-grep/deadline.ts`, and `src/file-grep/read-candidate.ts` stay unchanged.
- The neighbouring exactly-limit sentinel and exhaustion cases stay unchanged.
- Other deadline cases and the scan's production behavior are not reviewed.
