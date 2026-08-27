# Gather the agent-tab client feature

**Complexity: 5/10** — this is a behavior-preserving move of four implementation modules and three colocated test files, plus four direct consumer import updates.

## Goal

Make `web/src/agent-tabs/` the single home for the agent-tab feature so its active and inactive bodies, metadata row, protocol intents, and tests are discoverable together without introducing a barrel module or changing behavior.

## Approach

Move the agent-tab cluster as one unit. Use relative imports within the new directory and parent-relative imports for shared app-shell, command-input, transcript, and status modules. Keep callers outside the feature on direct imports from the defining files.

## Implementation steps

1. Create `web/src/agent-tabs/` and move `AgentTabBody`, `AgentTabMeta`, `InactiveAgentTabBody`, and `agent-tab-intents` there with their colocated tests.
2. Update imports inside the moved modules to address sibling feature modules directly and shared modules through the parent directory.
3. Update `AppCenterActionArea`, `AppMain`, `HarnessTab`, and `ShellTab` to import the moved entry components directly from `agent-tabs/`.

## Tests

- Run the moved agent-tab tests through `./scripts/run.mjs check-diff`; the existing tests cover active/inactive rendering, metadata actions and flags, and protocol intent messages after their paths change.

## Specs

- No functional spec change is needed because file placement and imports change without altering user-visible behavior.

## Out of scope

- Changing agent-tab props, rendering, protocol messages, or status-window behavior.
- Moving shared transcript, command-input, status, icon, tab-handle, or client modules.
- Introducing a barrel file for the feature.
