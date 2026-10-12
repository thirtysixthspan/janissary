# Show the actual execution location in agent monitors

**Complexity: 2/10** — The run already owns the projection consumed by monitors; the fix supplies accurate metadata at its creation and verifies it through the command path.

## Goal

Show the host and workspace where each agent run executes, including remote runs, in the monitor's server-owned run view.

## Approach

Add optional execution host and workspace values to `AgentRunOptions`, and use them when constructing run metadata. Local launches supply their actual execution directory. Remote launches supply the established remote host and workspace while preserving the local caller context used by the command loop. The existing `AgentRunView` carries these values to the monitor without client-side derivation.

## Implementation steps

1. Extend run options and manager metadata construction with explicit host and workspace values, retaining local defaults for existing callers.
2. Pass the local execution directory for local runs and the resolved remote host and workspace for remote runs.
3. Add command tests asserting the server-owned run view contains the correct local and remote locations.
4. Update the agent-command behavior spec and remove this completed entry from the PR backlog.

## Tests

Cover local monitor metadata using the local execution directory and remote monitor metadata using the established remote host and workspace. Run the diff-scoped lint, typecheck, and related server and web tests.

## Out of scope

Do not change remote execution, workspace acquisition or release, caller command context, monitor rendering, or unrelated backlog entries.
