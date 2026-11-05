# Connections tab titles

Issue: Connections tab should be titled 'connections'. Connection tab should be titled 'acp:<tab name>'

Complexity rating: 2/10

## Goal

The connections list tab reads `Connections` in the tab strip, unlike its sibling list tabs (`sessions`, `schedules`, `conversations`), which are lowercase. Title it `connections`.

A record's connection tab currently takes the record's title (`ACP: <first line of its first prompt>` or `Agent: <task filename>`), so the strip fills with long prompt fragments that don't say which tab the session belongs to. Title the connection tab `<kind>:<owning tab name>` instead, which reads `acp:<tab name>` for a core ACP session and follows the `kind:name` form the live connection rows already use (`sqlite:<name>`, `acp:<model>`).

## Approach

Both titles are set on the server, in the connections plugin's tab factories.

- `src/plugins/connections/tabs.ts` sets the list title in `openList`. Change the literal to `connections`.
- `src/plugins/connections/record-tabs.ts` sets the record tab's title from `row.title` in three places: the initial `openOrFocusTab`, the post-load `updateTab`, and each notification refresh. Route all three through one exported pure helper, `recordTabTitle(row)`, returning `` `${row.kind}:${row.ownerName}` ``.

`ownerName` is the owning tab's display name captured when the record began, and record validation already requires it to be nonempty, so the title the host requires is never empty. Because a record keeps its captured owner name, the title stays stable after the owning tab is renamed or closed.

Agent run records carry kind `agent`, so their connection tab reads `agent:<tab name>`. The entry names only `acp:<tab name>`; using the record's kind keeps an agent run's tab distinguishable from an ACP session owned by the same tab rather than giving both the same title.

The record's own title is unchanged. It still names the row in the list's Connection Name column, heads the connection tab's metadata row, and is what `connections <title>` looks up.

## Implementation steps

1. In `src/plugins/connections/tabs.ts`, change the list title to `connections`.
2. In `src/plugins/connections/record-tabs.ts`, add and export `recordTabTitle(row: PluginRecord)`, and use it for the title in `open` (both the `openOrFocusTab` factory and the post-load `updateTab`) and in `update`.
3. Update the existing assertions that pin the old tab titles: `src/plugins/connections/activate.test.ts` and `src/plugins/connections/command.test.ts` (`Connections`, `ACP title`), plus `src/plugins/connections/lookup.test.ts` and `src/controller.test.ts`, whose title-lookup tests read the opened tab's title where they mean the matched record's title.

## Tests

- `src/plugins/connections/activate.test.ts`: the list factory returns title `connections`; opening an ACP record tab yields `acp:Owner` from both the initial factory and the post-load refresh; a notification refresh of an ACP record tab yields `acp:Owner`, and of an agent record tab yields `agent:Owner`.
- `src/plugins/connections/command.test.ts`: the UUID-open refresh asserts `acp:Owner`.
- `src/plugins/connections/lookup.test.ts`: a title lookup opens a tab titled `acp:Owner` whose record keeps its `ACP: …` title.
- `src/controller.test.ts`: the end-to-end multiword title lookup opens a tab titled `acp:<owning tab>` while the record payload keeps the generated `ACP: …` title.

## Out of scope

- Record titles (`ACP: …`, `Agent: …`) and their 60-character cap, the list's Connection Name column, the connection tab's metadata row, and title lookup.
- The agent monitor tab's `Agent: <task filename>` title, which belongs to the agent-monitor plugin.
- The remaining backlog entries (metadata row with refresh and split actions; row styling and keyboard interactions).

## Specs and docs

- `product/specs/connections-tab.md`: the list tab is titled `connections`; a connection tab is titled `acp:<tab name>` (`agent:<tab name>` for an agent run), while its row and metadata keep the record title.
- `documentation/user-documentation/command-bar/connections.md`: the list tab title updates to **connections**, and the connection tab title is stated where the page describes connection tabs.
- `help/connections.md` and `help/agent.md`: checked; update only text that states the tab titles.
