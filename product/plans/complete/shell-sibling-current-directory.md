# Start a sibling shell in the shell's current directory

**Complexity: 4/10** — The metadata row's **new shell here** button and `Cmd+T` both dispatch `zsh` from the shell tab, and the new shell starts in that tab's recorded working directory. A `cd` in zsh updates only the payload directory the metadata row displays, so the recorded directory stays where the shell started. The fix records zsh's reported directory on the tab as well, through one additive capability.

## Goal

A shell opened from an existing shell tab, by the metadata button or `Cmd+T`, starts in the directory zsh is currently in rather than the directory the first shell started in.

## Approach

Add a declaration-gated `recordCwd(cwd)` line capability that sets the answering tab's recorded working directory, the same record `originTab` reads and the host's own tabs keep. The shell plugin's existing `cwd` intent calls it alongside the payload update. Because a terminal may only start inside the project root, `openShellTab` falls back to the workspace clone, or the project root, when the recorded directory has moved outside it.

## Implementation

1. Add `recordCwd` to the capability union, the capability table, the server capability type, and `lineCapabilities`; declare it in the shell manifest.
2. Call `recordCwd` from the shell `cwd` intent.
3. In `openShellTab`, start in the origin directory when it is inside the project root or the origin's workspace clone, and otherwise in the workspace clone or the project root.
4. Update the shell-tab spec, the shell user documentation, and the tab-plugin developer reference and its capability count.

## Tests

- Server: `recordCwd` sets the answering tab's directory, does nothing once the plugin is disabled, and is refused when undeclared.
- Server: the `cwd` intent records the directory as well as updating the payload.
- Server: a shell opened from a tab whose directory is outside the project root starts in the workspace clone or the root.

## Out of scope

- The file navigator button, which reads the same recorded directory and is a separate backlog entry.
- Persisting a shell tab's directory; plugin tabs are never persisted.
