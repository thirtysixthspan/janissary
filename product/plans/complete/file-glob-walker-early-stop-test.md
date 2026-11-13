# Pin the glob walker's early stop at limit + 1 with a test

**Complexity: 1/10** — no production code changes, 1 test requirement, 1 test scenario (p=2.32)

The walker's two limit tests in `src/file-glob/walk.test.ts` assert only the returned paths and the truncated flag. A walk that read every directory and sliced its result at the end would produce the same answers, so the plan's core reason for a custom walker, stopping directory reads once `limit + 1` matches are held, is not pinned by any test. A later refactor could drop the stop check and make every truncated search walk the whole tree without failing anything.

## Goal

A test fails if `walkGlob` reads any directory after it holds `limit + 1` matches.

## Approach

Mock `node:fs/promises` in `src/file-glob/walk.test.ts` with a `vi.mock` factory that uses `importOriginal` and replaces `readdir` with a `vi.fn` delegating to the real implementation, so every other test in the file keeps the real filesystem behavior. The new test clears the recorded calls, builds files `a`, `b`, `c/x` and `d/y`, walks with `limit: 1`, and asserts the result is `['a']` with `truncated: true` and that `readdir` was called only for the root. With the stop check in place the walk records `a`, then `b`, sets the stop flag and returns before visiting `c` or `d`; a walk-then-slice implementation would read both.

## Implementation steps

1. In `src/file-glob/walk.test.ts`, import `vi` from vitest and `readdir` from `node:fs/promises`, and add a `vi.mock('node:fs/promises', ...)` factory that spreads the original module and wraps `readdir` in a delegating `vi.fn`.
2. Add the test "stops reading directories once it holds limit + 1 matches" that clears the mock, builds the four files, walks with limit 1, and asserts both the result and the recorded directory arguments.

## Tests

- With `limit: 1` and files `a`, `b`, `c/x`, `d/y`, the walk returns `{ paths: ['a'], truncated: true }` and `readdir` was called only with the root directory.

Verify by temporarily removing the `if (state.stopped) return;` line in `src/file-glob/walk.ts`, confirming the new test fails while the existing limit tests still pass, and restoring it.

## Out of scope

- Any change to `src/file-glob/walk.ts`.
- The existing "truncates at limit + 1 matches" and "does not truncate at exactly limit matches" tests, which stay unchanged.
- Specs and help pages, since no user-visible behavior changes.
