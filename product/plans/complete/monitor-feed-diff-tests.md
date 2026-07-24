# Add test coverage for src/monitor/feed-diff.ts

**Complexity: 2/10** — a new colocated test file for a small, pure, self-contained module; no
source changes needed. Both functions are plain synchronous functions with no I/O, so tests are
direct calls with no fixtures or setup beyond a fresh `Map`.

## Goal

`src/monitor/feed-diff.ts` has no test file anywhere in the repo despite two functions with real
untested edge cases:

- `cap()`'s byte-length capping, which truncates UTF-8 text at a byte boundary using
  `Buffer.from(text, 'utf8').subarray(0, MAX_FEED_BYTES)` — a boundary that can land mid
  multi-byte character.
- `diffFeedEntry()`'s stateful diff-vs-full-snapshot logic keyed by a `Map`, with distinct
  first-call, unchanged, and changed-since-last-call branches.

Add `src/monitor/feed-diff.test.ts` covering both.

## Approach

Both functions are pure/synchronous aside from `diffFeedEntry()` mutating the passed-in `Map` —
so tests call them directly with plain string/Map fixtures, no temp dirs or mocking needed.

For `cap()`'s multi-byte boundary case: construct a string whose UTF-8 byte length is just over
`MAX_FEED_BYTES` (20,000) with a multi-byte character (e.g. `'é'`, 2 bytes in UTF-8) straddling
the 20,000-byte cut point, and assert the exact truncated head produced (the byte-offset cut
mid-character decodes to a trailing `�` replacement character, per `Buffer.toString('utf8')`'s
documented behavior on incomplete sequences) and that the total byte count reported in the
truncation suffix matches the original string's `Buffer.byteLength`. This test documents the
existing byte-boundary behavior; fixing it to cut on code-point boundaries is out of scope (see
below).

For `diffFeedEntry()`: exercise each branch by calling it repeatedly against the same `Map` and
label — first call (nothing seen yet), unchanged call (same content as last time), and changed
call (different content, producing a unified diff via `createPatch`).

## Implementation steps

No source code changes — this is test-only.

## Tests

`src/monitor/feed-diff.test.ts`:

- **`cap()` under the limit** — a short string is returned unchanged.
- **`cap()` at the multi-byte truncation boundary** — a string built so a 2-byte UTF-8 character
  straddles byte offset 20,000; asserts the exact truncated head (ending in a `�` replacement
  character, since the cut is a byte offset, not a code-point boundary), and that the appended
  suffix reports the correct original byte count.
- **`diffFeedEntry()` first call, empty content** — returns `undefined` (nothing to report) and
  records `''` as seen for the label.
- **`diffFeedEntry()` first call, non-empty content** — returns the full (capped) content as the
  entry's `output`, with empty `input`.
- **`diffFeedEntry()` unchanged** — a second call with identical content to the first returns
  `undefined`.
- **`diffFeedEntry()` changed** — a second call with different content returns an entry whose
  `output` is a unified diff (from `createPatch`) between the previous and current content, and
  updates the `Map` to the new content for the next call.
- **`diffFeedEntry()` per-label isolation** — two different labels in the same `Map` are tracked
  independently.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the new/related server tests.

## Out of scope

- Any change to `cap()` or `diffFeedEntry()` themselves — this item is test coverage only, per the
  backlog entry's own scope ("add src/monitor/feed-diff.test.ts covering..."). In particular,
  `cap()`'s mid-character truncation is documented as-is, not fixed to cut on a code-point
  boundary — that would be a behavior change outside this item's scope.
- Testing `page-feed.ts`/`editor-feed.ts`, the two callers — out of scope for this item.
