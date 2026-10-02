# Remove the unused route exports and the unread terminal ref

**Complexity: 1/10** — two deletions and nothing else. No behavior depends on either symbol, so
there is nothing to test beyond confirming nothing imports them.

`src/plugins/core-route-claims.ts` exports `pluginCoreRoutes` and `coreRouteOwner`, which nothing
imports: the host resolves its own map from the declarations it was constructed with, which is what
makes a fixture catalog authoritative in its tests. And `useReplayTerminal` keeps a `live` ref it
assigns once and never reads, left over from when the copy chord reached the terminal through it.

Both are the kind of thing that reads as an entry point. `pluginCoreRoutes` in particular looks like
the supported way to resolve a route and would be a reasonable second call site beside the one the host
actually uses — and the module's own comment describes it that way. The dead-code check in the human's
end-of-work gate reports them too.

## Implementation steps

1. Delete `pluginCoreRoutes` and `coreRouteOwner` from `src/plugins/core-route-claims.ts`, leaving
   `resolveCoreRoutes` as its single export, and adjust the module comment so it describes the
   function the host calls rather than a map nobody reads.
2. Delete the `live` ref and its assignment from `web/src/plugins/replay/useReplayTerminal.ts`.
3. Grep for both symbols across `src/` and `web/src/` before deleting, and again after, so the removal
   is known rather than assumed.

## Tests

None needed: nothing reads either symbol, so no behavior can change. The existing suites covering both
files — `src/plugins/host.test.ts` for route resolution and `web/src/plugins/replay/ReplayTab.test.tsx`
for the tab — must keep passing untouched, and are the check that the removal was complete.

## Out of scope

- Any change to route resolution, to the copy chord, or to the terminal's setup.
- Re-exporting anything for convenience.