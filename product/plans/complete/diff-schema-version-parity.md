# Fix: stop the diff tab from being disabled by its own schema bump

**Complexity: 2/10** — one literal in the client's plugin registry and one assertion in the parity test that pins the other eight plugins. No behavior beyond the tab running at all.

## Goal

The diff tab must open. A live run of the branch answers `Tab plugin "diff" disabled: payload schema 2 is not supported; expected 1`, so the command the whole feature hangs on reports a refusal, and every behavior the branch adds is unreachable.

## Approach

The server's plugin manifest declares its payload schema from the shared contract's own constant, and the client registry pins the same version as a literal — deliberately, so importing a shared contract can never pull plugin guards into the entry bundle. The two must stay equal, and a test pins the equality for every other bundled plugin: `web/src/plugins/registry.test.tsx` walks image, conversations, markdown, pdf, schedules, shell, sql, and video. The diff plugin was added to the branch and never joined that list, so nothing compared its literal to its constant.

The shared constant moved from 1 to 2 when the payload grew the layout preference, and from 2 to 3 when it grew the old-side line number. The registry's diff literal stayed at 1 the whole time, and the host disables a plugin whose two versions differ — the tab was dead from the first of those two commits, and every check run in the meantime was green because the only test that would have caught it never looked at diff.

1. **Pin the literal to the constant.** `web/src/plugins/registry.tsx` carries the diff entry at the version the tab now publishes.
2. **Cover the plugin.** `web/src/plugins/registry.test.tsx` asserts the diff entry against its own constant alongside the other eight, so the next payload change cannot ship this failure again.

## Implementation steps

1. Change the diff entry's schema literal in `web/src/plugins/registry.tsx`.
2. Add the diff assertion to `web/src/plugins/registry.test.tsx`.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Record the resolution in this plan and promote it to `./product/plans/complete/`.
5. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

- The registry's diff schema version is the shared contract's own constant, pinned by the test that already pins the other eight.

## Out of scope

- The payload's shape, which is what the branch changed and what made the versions move.
- The other plugins' entries, which the existing assertions already cover.

## Specs and documentation

No spec and no documentation change: the spec records the behavior a working tab shows, and this fix restores it rather than changing it.
