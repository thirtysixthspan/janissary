# Pass captured-shell working directories as process options

## Complexity

5/10. The local spawn API and manager are the only behavior changes. Existing spawn and manager tests plus one real-process case cover the boundary; remote shell startup stays separate.

## Goal

A local captured shell starts in its validated working directory without turning that path into shell input.

## Approach

Add optional `cwd` to `ShellSpawnOptions` and pass it to Node's `spawn` options. `ShellManager` supplies its validated local directory, falling back to the launch directory when needed, and removes the initial generated `cd` command. Callers that omit `cwd`, including remote pipe shells, retain their current behavior.

## Implementation steps

1. Pass optional `cwd` through `spawnShell` and have local captured-shell startup use it.
2. Update spawn and manager tests for cwd propagation and the absence of generated stdin, including shell-sensitive path characters.
3. Add real-shell manager-startup coverage and update `product/specs/shell.md`.

## Tests

- `spawnShell` forwards cwd while preserving detached behavior and caller compatibility.
- Manager startup forwards the validated cwd unchanged and falls back to launch directory when invalid.
- A real captured shell starts in a path containing quotes, dollar signs, backticks, and a newline.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changes to interactive shell plugin startup, remote shell startup, shell environment, or command input framing.
