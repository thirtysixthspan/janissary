# Default a terminal spawned without argv to the shell itself

**Complexity: 2/10** — one `??`, one doc comment that was stating the opposite, one test.

**Goal.** Make `spawnTerminal({ cwd })` mean what it looks like. `TabPluginTerminalOptions.args` is optional, `TabManager.spawnTerminal` forwarded it as given, and `spawnPty` fell back to `shellCommandArgs` with the empty command it had been handed — producing an interactive shell whose one command is the empty string. The obvious call from a plugin author opened something that looked like a shell and behaved like one that had already finished.

**Approach.** Default at the resource boundary, not in `spawnPty`. An omitted `args` still means "run this command through the shell" down there, because that is what `spawnPty`'s own callers mean; only the plugin resource has no command to run. The type's comment said the opposite of the new behaviour, so it is corrected rather than added to.

## Implementation

1. In `src/tab/manager.ts`, pass `args: options.args ?? []`.
2. In `src/plugins/api.ts`, correct the `TabPluginTerminalOptions` comment to say that an omitted `args` runs the shell itself, and why there is no command-through-the-shell case for a plugin.
3. Say the same in the `spawnTerminal` changelog entry of `documentation/developer-documentation/tab-plugins.md`.

## Tests

In `src/tab/manager.test.ts`: a `spawnTerminal` naming no argv reaches `spawnPty` with an empty argv. The shell plugin's own explicit `args: []` and every existing `spawnPty` case keep passing untouched, which is what shows the fallback's meaning is unchanged.

## Out of scope

- `spawnPty`'s own fallback. Its callers pass a command and rely on it; changing it would alter every terminal in the application.
- Restricting `spawnTerminal` to shells. Naming an arbitrary program is the resource's purpose and is confined or not on the same terms as any shell.