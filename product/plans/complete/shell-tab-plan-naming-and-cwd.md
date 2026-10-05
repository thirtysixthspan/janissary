# Reconcile the shell-tab plan's naming and cwd statements

**Complexity: 1/10** — two sentence-level corrections in one completed plan. No source, test, or spec file changes.

## Goal

Make `product/plans/complete/shell-tab.md` agree with itself, with `product/specs/shell-tab.md`, and with the code. A later agent reading the plan as the record of intent should not "fix" the naming back to `shell2` or drop cwd tracking from the metadata row.

## Approach

Two statements in the plan are stale.

The design decision "The tab is named `shell` and is opened by `zsh`" says each invocation creates a tab named `shell`, `shell2`, and so on. The plan's own summary, the spec's opening section and the code say otherwise. The shell manifest sets `agentNamedTabs: true`, so `addPluginTab` in `src/tab/creators.ts` takes a name from `unusedAgentName` in `src/tab/unique-labels.ts`. That function asks `checkLaunchName` for a pool name free of every open tab and every session row that could come back. Only when the pool is exhausted does `uniquePluginLabel` fall back to `shell`, then `shell-2`.

The "Declined during gap research" bullet "A tab name that follows `cd`" says the metadata row reports the directory where the shell started. The plan's own cwd decision, the spec's metadata-row section and the code all follow zsh's OSC 7 reports, so the row tracks the current directory. Only renaming the tab after a `cd` was declined.

## Implementation steps

1. In `product/plans/complete/shell-tab.md`, retitle the decision "The tab is named `shell` and is opened by `zsh`" and rewrite its body. It should say the plugin claims `zsh` because `shell` is a reserved core command. It should then say each invocation opens a distinct tab named from the agent-name pool by the same rule as an unnamed agent launch, falling back to `shell`, `shell-2`, and so on once the pool is exhausted.
2. In the same file, change the declined "A tab name that follows `cd`" bullet so it declines only renaming the tab. The tab keeps the name it opened with, while the metadata row follows zsh's current directory.

## Tests

None. Nothing under `src/` or `web/src/` changes, so there is no behavior for a test to cover.

## Out of scope

- Any code or spec change. The spec already describes pool naming and cwd tracking correctly.
- Other statements in the shell-tab plan that the backlog entry does not name.
- `help.md` and user documentation: no behavior changes.
