# Local workspace search from shell plugin

## Complexity

2/10

## Goal

Keep the search plugin enabled and search the local clone when a user runs `search <phrase>` or chooses **Search for this** from a local workspaced shell.

## Approach

The workspace resolver already recognizes local workspaces on plugin tabs, and the search session already scopes scans using the request's origin tab. Add regression coverage for the shell-plugin origin shape and the two reported search routes. Change implementation only if the regression tests expose a failure.

## Implementation steps

1. Add an `originWorkspace` test for a local shell plugin tab with a `workspaceDir`.
2. Add search activation coverage for a typed query and a default-menu selection originating from that local shell tab, verifying the clone is listed and the search payload reports its workspace.

## Tests

- `src/plugins/origin-workspace.test.ts`: local shell plugin tab resolves to its tracked clone.
- `src/plugins/search/activate.test.ts`: typed search and **Search for this** from a local shell plugin tab search the clone and complete without disabling the plugin.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after the tests.

## Spec and documentation

The existing search-tab spec already says searches from workspaced shell tabs use their workspace. Update it only if implementation changes that documented behavior.

## Out of scope

- Changing workspace lifecycle or search behavior for harness, remote, editor, navigator, or monitor tabs.
- Changing public documentation; the reported behavior is already covered by existing user documentation.
