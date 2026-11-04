<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore the completed connection-tab window-rule consolidation by keeping the 20-block window and paging counts only in the ACP records spec.

Existing Issue: `product/specs/connections-tab.md` again states "newest 20 prompt blocks", "20 older blocks", and "newest 20 blocks again" after the later `release-connection-window-on-tab-close` repair, while `product/plans/complete/consolidate-connection-tab-follow-and-window-rules.md` requires `connections-tab.md` to contain no "20" and `product/specs/acp-records.md` to remain the sole owner of the window size and paging increments, so the two specs now duplicate the number that a later window-size change would have to update twice. Severity: 4/10

Existing Risk: 4/10 - A future window-size or paging change can update `acp-records.md` and leave the connection-tab spec promising a different count, so an implementation following the wrong spec silently disagrees with the recorder and the other surface.

Proposal Risk: 1/10 - This is wording only; the tab-scoped lifetime rule and every runtime behavior stay exactly as they are.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "remove the duplicated window counts from the connection-tab spec". In `product/specs/connections-tab.md`, replace the numeric phrases with the non-numeric wording the consolidation used: the tab opens on the newest history window, loads older blocks at the top while preserving the viewport, and reopening loads the newest window again. Keep the existing `[[acp-records]]` link and the tab-scoped lifetime sentence, and do not add a new spec section. Leave `product/specs/acp-records.md` as the only spec naming the 20-block size and paging increments, and leave `product/specs/connection.md`'s `[[connections-tab]]` pointer unchanged. Do not edit the completed plans; they are historical records. Verify by reading the edited section, confirming `connections-tab.md` contains no "20", and running `npm run docs:build` to prove every wiki target resolves. No source, test, or user-documentation change is needed.


* Key connection-history blocks by their absolute position so loading an older page does not remount every existing block and collapse the reader's expanded entries.

Existing Issue: `web/src/plugins/connections/ConnectionHistory.tsx` keys each block by `${block.startedAt}:${index}` where `index` is relative to the current window, so prepending older blocks shifts every existing index, remounts every existing block in React, and discards any expanded thought or tool `<details>` and text selection even though `useConnectionHistoryScroll` preserves `scrollTop`. Severity: 3/10

Existing Risk: 3/10 - Paging older history silently closes entries the reader had opened and churns the whole history DOM on every page, and any later key change can make the scroll restoration depend on remount timing.

Proposal Risk: 1/10 - `window.offset + index` is stable for the same absolute block across prepends; only the key expression and one focused test change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "use absolute block positions as connection-history keys". In `web/src/plugins/connections/ConnectionHistory.tsx`, change the block key to `window.offset + index`; `window.offset` is the server-supplied zero-based absolute position of the first block in the window, so an existing block keeps its key when older blocks are prepended. Keep each block's entry keys relative within that block. Extend `web/src/plugins/connections/ConnectionTab.test.tsx` with a rerender from a window at `offset: 2` to `offset: 0` with two prepended blocks: expand a thought entry in an existing block before the rerender, assert it remains open afterward, and assert the rendered block order is the new oldest-to-newest order. The existing `useConnectionHistoryScroll.test.tsx` cases must keep passing unchanged; do not alter the scroll hook, the server window, or the spec. Run the focused client suite and `$janissary/scripts/run.mjs check-diff`.


* Correct the architecture guideline's reference to the removed `parseConnectionCommand` so it names the parser the branch actually ships.

Existing Issue: `ai/guidelines/architecture-principles.md` still cites `parseConnectionCommand` in its pure-parser examples, but the branch deletes `src/connection/parsing.ts` and moves the parser to `src/plugins/connections/parse.ts` as `parseConnectionsCommand`, leaving a current guideline pointing at a function and file that no longer exist. Severity: 2/10

Existing Risk: 2/10 - A contributor or reviewer following the guideline's parse/execute example searches for deleted code and may model a new parser on a name that no longer describes the shipped seam.

Proposal Risk: 1/10 - One prose correction; no code, behavior, test, or spec change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "update the architecture guideline's connection parser example". In `ai/guidelines/architecture-principles.md`, replace `parseConnectionCommand` with `parseConnectionsCommand` in the pure-parser sentence; leave the surrounding principle and the command-definition section untouched. Check current guidelines, specs, help pages, and user documentation for any other reference to `parseConnectionCommand` or `src/connection/parsing.ts` and update only a current doc that repeats it; historical plans under `product/plans/complete/` remain records and stay untouched. Run `$janissary/scripts/run.mjs check-diff` (a Markdown-only diff selects no source checks) and `git diff --check`.


* Remove the unused harness `onOpenConnection` intent or route the harness popup through it, so the popup has one implementation instead of a tested dead path.

Existing Issue: `web/src/harness/harness-tab-intents.ts` adds `onOpenConnection` to `AgentTabIntents` and its tests exercise it, but `web/src/harness/HarnessTab.tsx` never consumes it; `web/src/harness/HarnessTabLayer.tsx` calls the exported `openConnectionRow` helper directly, leaving two copies of the same record-id and tab-ACP-reference routing and a contract member no production path uses. Severity: 2/10

Existing Risk: 2/10 - A later correction to one copy can leave the other stale, while the tests keep exercising code the application never runs.

Proposal Risk: 1/10 - Removing the dead member and its direct assertions leaves the layer's helper as the only path and changes no user-visible behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "remove the unused harness open-connection intent". In `web/src/harness/harness-tab-intents.ts`, delete `onOpenConnection` from `AgentTabIntents` and from the returned intent object, keeping the exported `openConnectionRow` helper for `HarnessTabLayer`. In `web/src/harness/harness-tab-intents.test.ts`, remove the assertions that call `intents.onOpenConnection` but keep equivalent coverage by calling `openConnectionRow` directly with a record-id row, a tab-scoped ACP reference, and a monitor-scoped reference. Do not change `HarnessTabLayer`'s `onOpenRow` wiring, `StatusPanels`, or the editor path. Run the focused harness suites and `$janissary/scripts/run.mjs check-diff`; no spec or user-documentation change is needed because the visible behavior is unchanged.
