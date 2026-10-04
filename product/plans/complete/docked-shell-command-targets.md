# Target docked shell actions at their tab

**Complexity: 7/10.** Shell command bars can be focused in sidebars while app-level close handling and server commands traditionally use the center tab, so both client and command dispatch must preserve the source tab identity.

## Goal

Make bare `close`, Cmd+W, and `agent` commands issued from a docked shell act on or originate from that shell tab.

## Approach

Track the plugin tab whose command bar has focus. Use its label for bare-close classification and resolve it to the current tab index for Cmd+W. Preserve named `close <name>` matching. Pass `CommandManager.dispatchLine`'s existing `{ label, index }` context through the agent command and use the source tab's cwd and group when creating the new agent.

## Implementation

1. Track shell command-bar focus and use it as the target for bare close and Cmd+W.
2. Preserve named close behavior and the existing modal/picker guards.
3. Pass command context through `commands/agent.ts` and `ProfileManager.newAgent` into agent creation.
4. Add client and server coverage for docked targets and update the shell tab spec.
5. Run diff checks and remove the resolved PR backlog entry.

## Tests

`./scripts/run.mjs check-diff` passes. Coverage includes focused-tab reporting, bare-close save-guard routing, Cmd+W routing, and agent cwd/group selection from the source tab.

## Out of scope

Changing the behavior of named `close <name>` or commands issued from non-plugin command bars.
