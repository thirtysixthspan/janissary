# Keep the PDF find selection non-negative before results arrive

**Complexity: 2/10** — a small guard in the PDF find hook, one regression case, one spec sentence, and a note in the canonical plan's reuse table; the shared overlay and its other callers stay untouched.

## Goal

While the PDF find overlay is open with a non-empty query and the document's text is still being read, `LineFind` hands ArrowDown to `rankedOverlayKeys` with no rows, which calls `onChangeSelected(Math.min(-1, selected + 1))` — always `-1`. That callback is `usePdfFind.select`, which stores the index unconditionally. `useLineFind`'s clamp only lowers an index with `Math.min`, so the negative selection survives once matching rows arrive. The first row is then unhighlighted and `current` is `null`, leaving the current occurrence unmarked until another key press.

Pressing Down before results exist must not clear the selection. The PDF hook should ignore a negative index so the row stays on the first result, which is highlighted and marked as soon as it arrives.

## Approach

Guard `select` in `web/src/plugins/pdf/usePdfFind.ts`: when `index < 0`, return before `setSelected`. The shared `rankedOverlayKeys` keeps emitting `-1` for a Down press over an empty list, which is harmless to the editor and shell because their behavior is pre-existing and out of scope; only the PDF hook needs to reject it. Nothing in `useLineFind`, `rankedOverlayKeys`, `LineFind`, or the PDF rendering path changes.

## Implementation steps

1. **`web/src/plugins/pdf/usePdfFind.ts`** — add `if (index < 0) return;` at the start of `select`. Keep the existing reveal path and dependencies unchanged.
2. **`web/src/plugins/pdf/usePdfFind.test.ts`** — add a case in `describe('usePdfFind revealing')`: with `deferredPdf(1)`, open, call `setQuery('needle')` while the page is still reading, call `select(-1)`, resolve the page with `[line('needle')]`, then assert `selected` is `0` and `current` is `{ page: 0, line: 0, start: 0 }`. Without the guard the negative index survives the clamp and `current` stays `null`.
3. **`product/specs/pdf-tab.md` § Find** — add to the arrow/click paragraph that a Down press before any result has arrived leaves the first row selected rather than clearing it, so the first match is highlighted as soon as it appears.
4. **`product/plans/complete/pdf-tab-find.md` § What already exists (reuse, don't rebuild)** — extend the `rankedOverlayKeys` row: with no rows yet it emits `-1` for Down, and the PDF find hook ignores a negative index so the highlighted row survives until results arrive.
5. Run `$janissary/scripts/run.mjs check-diff` and the focused `usePdfFind` tests.

## Tests

- New case in `web/src/plugins/pdf/usePdfFind.test.ts`: "keeps the first result selected when Down arrives before any result". The deferred page keeps `reading` true when `select(-1)` is called, so it exercises the zero-result path the shared handler creates. After the page resolves with `needle`, `selected` is `0` and `current` reports page `0`, line `0`, start `0`.
- Existing `usePdfFind` reading, revealing, focus, and no-document cases stay green.

## Out of scope

- `web/src/shared/line-find/useLineFind.ts` and `web/src/shared/ranked-overlay-keys.ts`. Their behavior is pre-existing, shared with the editor and shell, and the entry explicitly leaves it unchanged.
- The editor and shell find overlays, which keep today's behavior when Down is pressed over an empty result list.
- Any PDF loading, rendering, marking, or reveal behavior.
- Help and user documentation: no documented key or state changes.
- The other entries in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/plugins/pdf/usePdfFind.test.ts`
- `gh pr view 1958 --json state,headRefName,headRefOid` shows `OPEN` on `feature/pdf-tab-find` at the pushed commit.
