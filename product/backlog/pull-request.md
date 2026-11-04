<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
