# Give the SQL tab named typed actions

**Complexity: 5/10** — one SQL feature hook, typed action props through the tab and grid, and focused updates to existing component tests. The server protocol and user-visible behavior stay unchanged.

## Goal

Keep SQL intent names and payload construction in one feature adapter. The tab's components receive named operations with typed arguments rather than building protocol strings and forwarding `unknown` payloads.

## Approach

Add `web/src/plugins/sql/useSqlActions.ts` with typed methods for all sixteen SQL intents and a small factory that maps those methods to `TabPluginClientCapabilities.intent`. `SqlTab` creates the actions and passes them into `DataGrid` and the named callbacks into its switchers, export controls, and console. `DataGrid` owns its existing editing and dialog state, invokes its injected operations, and passes specific filter and paging callbacks into `Filters` and `Pager`.

## Implementation steps

1. Add the SQL action types and intent adapter, with a focused mapping test for the named methods and payloads.
2. Wire `SqlTab` and `DataGrid` to the named actions, removing their locally constructed intent names and `unknown` payload handlers.
3. Replace the generic callbacks in `Filters` and `Pager` with their specific typed operations and update the related component tests while preserving interaction coverage.

## Tests

- Add a focused action mapping test covering the named SQL operations and their payloads.
- Update and preserve the interaction assertions in `SqlTab.test.tsx`, `DataGrid.test.tsx`, `Pager.test.tsx`, and `SqlConsole.test.tsx` as the callback contracts change.
- Run `./scripts/run.mjs check-diff` after every change.

## Spec and documentation

No user-visible behavior changes. `product/specs/sql-database.md` and the public documentation already describe the SQL tab's actions; no spec or documentation change is needed.

## Out of scope

- Changing the server-side SQL intent contract or validation.
- Changing SQL tab behavior, layout, or actions.
- Moving grid editing, insertion, deletion, or filter state out of the components that own it.
