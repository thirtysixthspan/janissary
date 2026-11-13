# Pin the glob walker's ignored-set lookup to root-relative paths with a test

**Complexity: 1/10** — no production code changes, 1 test requirement, 2 test scenarios (p=2.47)

Every walker test in `src/file-glob/walk.test.ts` that passes a non-empty ignored set either starts at the root, where root-relative and start-relative paths are identical, or ignores the start directory itself. A walker that handed `isPruned` the start-relative path instead of the root-relative one would pass every test. Once `--path` narrows the search directory, that swap would make git-ignored files under the narrowed directory reappear, or prune unrelated start-relative names, with nothing catching it.

## Goal

A test fails if `walkGlob` looks up the ignored set by anything other than the root-relative path when the start directory is below the root.

## Approach

Add one test to `src/file-glob/walk.test.ts` that builds `src/gen/out.ts`, `src/keep.ts` and `gen/out.ts` under the temp root and walks from `start: path.join(root, 'src')` with pattern `**/*`. With `ignored: new Set(['src/gen'])` the result is `['src/keep.ts']`, which proves the root-relative name prunes the nested directory. With `ignored: new Set(['gen'])` the result is `['src/gen/out.ts', 'src/keep.ts']`, which proves a start-relative name is not treated as ignored. `walkDirectory` already passes the root-relative path, so the test passes on the current implementation.

## Implementation steps

1. In `src/file-glob/walk.test.ts`, add the test "looks up ignored paths relative to the root when start is below it" covering both ignored sets above.

## Tests

- Start `src`, ignored `{'src/gen'}`: paths are `['src/keep.ts']`.
- Start `src`, ignored `{'gen'}`: paths are `['src/gen/out.ts', 'src/keep.ts']`.

Verify by temporarily passing `startRelative` to `isPruned` in `src/file-glob/walk.ts`, confirming the new test fails, and restoring it.

## Out of scope

- Any change to `src/file-glob/walk.ts`.
- The existing ignored-set tests, which stay unchanged.
- Specs and help pages, since no user-visible behavior changes.
