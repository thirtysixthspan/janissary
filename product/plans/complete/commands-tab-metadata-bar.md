# Add a metadata bar to the Commands tab

**Complexity: 2/10** — one small client component, one server intent, CSS, tests and spec text.

## Goal

Give the Commands tab the same metadata bar the Models tab has, with Refresh and split-tab icons at the right, and move the existing configuration-file line into that bar, floated left.

## Approach

1. Add `CommandsHeader` in `web/src/plugins/commands/`, built on `PluginActionsHeader` like the Models tab. It holds the source line (floated left) and a Refresh button plus `capabilities.splitAction`. When the tab is docked, the header portals only into the dock's actions slot, so the source line renders as its own row instead.
2. Replace the inline source line in `CommandsTab.tsx` with the header. The overridden-restrictions note, problem line and refusal stay beneath it.
3. Add a `refresh` intent to the Commands activation that sends the existing `refresh` topic action, with an empty-payload guard `isRefreshIntent` in the shared module.
4. Style the bar in `commands.css` to match the Models header, keeping every selector scoped to `.commands-`.
5. Update the Commands tab spec and user documentation page to describe the bar.

## Tests

- `activate.test.ts`: the `refresh` intent sends the topic refresh action and returns null; a payload with fields is rejected.
- `CommandsTab.test.tsx`: the source line sits in the metadata bar; clicking Refresh sends the `refresh` intent.

## Out of scope

- A refreshing spinner state; the topic publishes no refreshing flag.
- Any change to the payload shape or schema version.
