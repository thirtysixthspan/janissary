# Name shell tabs from the agent-name pool

**Complexity: 4/10** — A plugin tab's label is minted from its declaration's `tabLabelPrefix` (`shell`, `shell-2`, …) and the strip shows the plugin's title (`shell`) above that label, so every shell tab reads `shell`. Agent tabs are named from the agent-name pool instead. The host needs a declared way for a plugin to ask for agent-style names, and the shell plugin needs to ask for it.

## Goal

A new shell tab is labeled and titled with a name drawn from the agent-name pool — one no open tab is using — exactly as an unnamed agent tab is, so shell tabs read as distinct names in the tab strip and can be addressed by them. When every name in the pool is taken, the tab falls back to the declaration's prefix label and the plugin's own title, as today.

## Approach

Add an optional `agentNamedTabs` flag to the tab-plugin declaration, beside the other static flags. When it is set, `addPluginTab` draws the label from the agent-name pool through the same `resolveAgentName` draw the agent launcher's pool uses, skipping every open tab's label case-insensitively, and uses that name as the tab's title as well, since the name is what the strip should show. The flag travels from the declaration through `openOrFocusTab` to the tab manager as a trailing optional argument, so every existing caller keeps its behavior. The shell manifest sets the flag.

Agent launches already refuse or move off a name an open tab holds, so a shell tab holding a pool name cannot collide with a later agent of the same name.

## Implementation

1. `src/plugins/api.ts`: add `agentNamedTabs?: boolean` to `TabPluginDeclaration`, documented beside `playable`.
2. `src/tab/unique-labels.ts`: add `unusedAgentName(tabs)`, returning a pool name no open tab holds, or nothing once the pool is exhausted.
3. `src/tab/creators.ts`: `addPluginTab` takes a trailing `agentNamed` flag; when set and a name is free, that name is both the label and the title.
4. `src/tab/openers.ts`, `src/tab/opening-state.ts`: pass the flag through `openPluginTab`.
5. `src/plugins/context.ts`: `openOrFocusTab` passes `declaration.agentNamedTabs === true`.
6. `src/plugins/shell/manifest.ts`: set `agentNamedTabs: true`.
7. Update the shell-tab and tab-plugins specs, the developer tab-plugin documentation's declaration field list, and the shell user guide where it names the tab.

## Tests

- `src/tab/creators.test.ts`: an agent-named plugin tab is labeled and titled with a pool name no open tab holds; it falls back to the prefix label and the plugin title once every pool name is taken; a plugin that does not ask keeps the prefix label.
- `src/plugins/shell/manifest` coverage: the shell declaration asks for agent-named tabs (in `activate.test.ts` or the declaration-validation test).

## Out of scope

- Renaming shell tabs that are already open.
- Checking a drawn name against saved agent sessions, which the agent launcher does for a process that will record one; a shell tab records no session.
