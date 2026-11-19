# Share the fake remote channel harness across file command tests

**Complexity: 1/10** — no production code changes or behavioral requirements; the only new unit is one test-only shared module (p=1.60).

## Goal

Replace the five duplicated fake remote channel harnesses in the file command tests with one test-only shared helper, so a change to the channel protocol or reply shape is made in a single place.

## Approach

The canonical harness is `fakeChannel()` in `src/commands/file.test.ts`, together with the `RequestFrame` type its neighbour `wireChannel()` uses. Extract both into one clearly test-only module, export them, and import them back into that file and the four executor test files. Delete every local copy. Keep the helper's `listener: () => listener` accessor and its `request?.type !== 'filesystem-request'` reply guard exactly as they are, so the reply path is unchanged. No production code changes.

## Implementation

1. Add a clearly test-only module `src/testing/fake-remote-channel.ts` with a short doc comment stating it exists only for tests. Export `RequestFrame` and `fakeChannel()` copied from `src/commands/file.test.ts`, preserving the listener accessor and the filesystem-request guard. Add only the type-level adjustments the module needs to typecheck: a `RequestFrame` predicate on the request filter and a cast of the reply frame to the navigator listener's parameter type. Runtime behavior stays identical.
2. In `src/commands/file.test.ts`, delete the local `fakeChannel()` and `RequestFrame`, import both from the shared module, and leave `wireChannel()` and every remote-tab assertion unchanged.
3. In `src/file-list/tab-list.test.ts`, `src/file-stat/tab-stat.test.ts`, `src/file-exists/tab-exists.test.ts`, and `src/file-head-tail/tab-head-tail.test.ts`, delete the local `fakeChannel()` and `RequestFrame`, drop the now-unused type imports, and import `fakeChannel` from the shared module. Leave every remote-tab assertion unchanged.

## Tests

Run the five affected files: `src/commands/file.test.ts`, `src/file-list/tab-list.test.ts`, `src/file-stat/tab-stat.test.ts`, `src/file-exists/tab-exists.test.ts`, and `src/file-head-tail/tab-head-tail.test.ts`. They already assert operation names and args, session prefixes, refusal wording, absolute-path handling, and the unavailable line, so the refactor needs no new assertions. Run `$janissary/scripts/run.mjs check-diff` after the change.

## Out of scope

Production code, the other fake-channel copies in `src/file-grep/tab-grep.test.ts`, `src/file-write/tab-write.test.ts`, and `src/remote/acp-session.test.ts`, the PR description, help pages, and user documentation. This is a test-support refactor with no user-visible behavior change, so no functional spec needs an edit.
