# Local workspace search from shell plugin

## Complexity

2/10

## Goal

Keep the search plugin enabled and search the local clone when a user runs `search <phrase>` or chooses **Search for this** from a local workspaced shell.

## Approach

The workspace resolver recognizes local workspaces on plugin tabs, and the search session scopes scans using the request's origin tab. The browser reproduction exposed a payload validation failure while moving from `$root` to a local workspace: the payload included `host: undefined`, which is not JSON-compatible. Omit the optional host property when no remote host applies, then cover the shell-plugin origin and both reported search routes.

## Implementation steps

1. Add an `originWorkspace` test for a local shell plugin tab with a `workspaceDir`.
2. Ensure payload updates omit `host` when its value is undefined, preserving JSON compatibility when a search moves to a local workspace.
3. Add search activation coverage for a typed query and a default-menu selection originating from that local shell tab, verifying the clone is listed, the payload reports its workspace, and it passes JSON compatibility validation.

## Tests

- `src/plugins/origin-workspace.test.ts`: local shell plugin tab resolves to its tracked clone.
- `src/plugins/search/activate.test.ts`: typed search and **Search for this** from a local shell plugin tab search the clone and produce a JSON-compatible payload without an undefined `host` property.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after the tests.

## Spec and documentation

The existing search-tab spec already says searches from workspaced shell tabs use their workspace. Update it only if implementation changes that documented behavior.

## Out of scope

- Changing workspace lifecycle or search behavior for harness, remote, editor, navigator, or monitor tabs.
- Changing public documentation; the reported behavior is already covered by existing user documentation.
