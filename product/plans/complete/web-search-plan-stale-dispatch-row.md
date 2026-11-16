# Correct the web-search plan's stale dispatch row

**Complexity: 1/10** — no production code changed, no production files edited, one routing statement (p=2.07).

## Goal

The "What already exists" table in `product/plans/complete/web-search.md` says a `runsOn: 'workspace'` command "runs on the host running the loop through `searchWebInTab`, as `file read` and `file glob` do". The feature does not route that way. The same plan's "Where an agent's search runs" decision says a granted search runs on the side that owns the tab. `searchWebInTab` picks the side from the tab's `remote` field through `localReadRoot`, and the far-side loop never calls it at all: `runWorkspace` in `src/remote/serve-acp-loop.ts` calls `webSearch` directly with the workspace tokens. A reader implementing from the table would put a local-fallback session's search on the local machine, which is the routing the plan and `product/specs/acp.md` rule out.

The fix replaces that one description cell with the delivered routing. Everything else in the plan, including the design decisions, stays as it is.

## Approach

Verify the routing in `src/acp/run-prompt.ts`, `src/web-search/tab-search.ts`, and `src/remote/serve-acp-loop.ts`, then rewrite the single table cell. `searchWebInTab` parses the line, calls `localReadRoot`, and takes the local branch with `getProjectTokens()` and the global `fetch` or the remote branch through `withRemoteTabPort`. The far-side loop parses the line and calls `webSearch` with the tokens its `RemoteAcp` holds.

Check the corrected sentence against `product/specs/acp.md` (the Web search section and the workspace-routing paragraph), `product/specs/web-search.md` (the Agent tool section), and `documentation/user-documentation/advanced-agents/acp-agent.md` (In a workspace or on another host). All three already state the same rule.

No code, test, spec, help page, or user documentation changes. The docs agree with the implementation; only the plan's table is stale.

## Design decisions

1. **Change the description, not the row.** The row names a real reuse target: the tool table's `runsOn: 'workspace'` designation and `runWorkspace` in `src/acp/run-prompt.ts`. Only the sentence describing where the command runs is wrong.

2. **Name both dispatch paths.** The local loop reaches the search through `searchWebInTab`, which can forward to the tab's remote host. The far-side loop reaches `webSearch` directly. A description that names only `searchWebInTab` would still imply the host running the loop, so the cell names both.

3. **Keep the rule, not a host name.** "Runs on the side that owns the tab" is the wording in the design decision, the two specs, and the user page. Reusing it keeps the table from drifting again when a path moves.

4. **No test surface.** No executable behavior changes. `$janissary/scripts/run.mjs check-diff` is the only gate, and the markdown lint must stay green.

## Implementation steps

1. Read the Workspace-side dispatch row in `product/plans/complete/web-search.md`.
2. Confirm the three code paths: `runWorkspace` in `src/acp/run-prompt.ts` calls `searchWebInTab` for a `web` line; `searchWebInTab` chooses local or remote from `localReadRoot`; `runWorkspace` in `src/remote/serve-acp-loop.ts` calls `webSearch` with the workspace tokens.
3. Replace the row's description with: a `runsOn: 'workspace'` command runs on the side that owns the tab, where `runWorkspace` in `src/acp/run-prompt.ts` calls `searchWebInTab` and `src/web-search/tab-search.ts` chooses a local search or the tab's remote port, while the far-side loop in `src/remote/serve-acp-loop.ts` calls `webSearch` directly with the workspace tokens.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Run `git diff` and confirm only the one table cell changed in the plan, and that every design decision and every other line is untouched.

## Tests

No automated tests. The change is prose in one plan file, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit; markdown changes are lint-only and the command must exit 0.

Manual verification: read the corrected row against the three code paths and the three documents named above. Diff the plan to confirm every other line, including all design decisions, is byte-for-byte unchanged.

## Out of scope

- Changing any other line of `product/plans/complete/web-search.md`.
- Changing code, tests, specs, help pages, or user documentation.
- Resolving the other entries in `product/backlog/pull-request.md`.
