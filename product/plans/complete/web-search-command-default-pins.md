# Pin the web search command's default values in its tests

**Complexity: 1/10** — a test-only change: two added assertions, no production lines, no production files edited, 2 requirements and 2 scenarios (p=2.76)

## Goal

Make `src/web-search/command.test.ts` fail when a promised default moves. The command grammar plan fixes the defaults at 10 results, 10000 characters, `basic`, and `auto`, but the test file's `defaults` fixture builds its expected values from the same exported constants the parser applies. Moving any constant therefore keeps every assertion green, even though the parsed result and the primer's "up to 10 results by default" prose change underneath.

## Approach

Add a small `describe('exported defaults')` block beside the `defaults` fixture at the top of `src/web-search/command.test.ts`. One test compares the four exported defaults against literal values in a single `toEqual` object, mirroring how `src/file-glob/command.test.ts` pins `limit: 100` in its `defaults` fixture. A second test asserts `WEB_SEARCH_PRIMER` contains `up to ${String(WEB_SEARCH_DEFAULT_RESULTS)} results by default`, tying the primer prose to the default result count.

The four constant imports stay in use by both the fixture and the new block. No existing test changes: the no-flag and primer tests continue to cover their current paths. No production code, constant value, or primer text changes.

## Implementation

1. Add `describe('exported defaults')` after the `defaults` const in `src/web-search/command.test.ts`.
2. In it, assert `{ numResults: WEB_SEARCH_DEFAULT_RESULTS, maxChars: WEB_SEARCH_DEFAULT_MAX_CHARS, depth: WEB_SEARCH_DEFAULT_DEPTH, provider: WEB_SEARCH_DEFAULT_PROVIDER }` equals `{ numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' }`.
3. Add a second test asserting `WEB_SEARCH_PRIMER` contains `up to ${String(WEB_SEARCH_DEFAULT_RESULTS)} results by default`.
4. Temporarily change one default constant in `src/web-search/command.ts`, confirm the new assertions fail, then revert it.

## Tests

- `src/web-search/command.test.ts`: the new `exported defaults` block covers the pinned constants and the primer-to-default tie. Every existing test stays untouched and passing.
- Verification: `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing any default value, range, or primer line.
- Changing the parser or any other production file.
- Rewriting the existing `defaults` fixture or any other existing test.
- A web search functional spec: this is a test-only change with no user-visible behavior, and the feature's specs are written by later slices.
