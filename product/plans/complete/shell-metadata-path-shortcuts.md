# Show path shortcuts in the shell metadata row

**Complexity: 6/10** — The shell plugin owns its metadata row and currently receives only a raw cwd, while the host's other metadata rows use `$root` and `$workspace` display shortcuts. The shell needs the real paths for actions and a separate display form that updates with zsh's cwd.

## Goal

Render the shell metadata directory with `$root` for paths inside the project and `$workspace/<name>` for paths inside the shell's workspace clone, while keeping absolute paths in the payload for process and file actions.

## Approach

Extend the origin-tab view with the project root and include the workspace clone path in the shell payload. Add a pure shell display formatter that prefers the workspace shortcut when cwd is inside the clone, folds the root's `.janissary` state directory into `$root`, and otherwise leaves the cwd unchanged. Render the formatted value in the shell metadata row as cwd changes.

## Implementation

1. Carry root and workspace directory metadata from the origin tab into the shell payload and validate it in the shared payload guard.
2. Format the display path on the client without changing the actual cwd and add focused path and metadata tests.
3. Update the shell functional spec and user documentation, then run the diff-scoped checks.

## Out of scope

- Changing path display in agent, editor, or file-navigator metadata rows.
- Rewriting paths used by shell actions or shell command output.
