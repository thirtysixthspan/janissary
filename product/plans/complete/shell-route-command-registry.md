# Move the `!` shell route into the command registry

Complexity: 3/10

## Goal

Route explicit `!` shell commands through the same command registry and execution path used by every other registered command.

## Approach

Add a registry command whose matcher claims every `!`-prefixed input and whose runner passes the text after `!` to `managers.shell.run`. Register it before other core commands so the explicit shell prefix retains route priority. Remove the shell resolution variant and `CommandManager`'s direct shell branch. Keep `dispatchLine`'s existing behavior: shell routes are not application commands, so plugin-facing dispatch reports them as not dispatched.

## Implementation steps

1. Add the shell command module and register it first in `coreCommands`.
2. Remove `shell` from `Resolution` and let the ordered registry resolve `!` inputs.
3. Remove `runShell` and the shell branch from `CommandManager.run`.
4. Update resolver, priority, and dispatch tests to cover routing priority, registry execution, command text passed to the shell manager, and plugin-facing non-dispatched behavior.
5. Update the shell functional spec and remove only this ready item from the technical-debt backlog.

## Tests

- `src/commands/resolve.test.ts`: `!` cases resolve to the registered shell command, including empty and whitespace-prefixed bodies; existing built-in and unknown-command routes remain intact.
- `src/commands.test.ts`: declared shell samples are resolved to the shell entry and command priority remains conflict-free.
- `src/command/manager.test.ts`: typed shell dispatch reaches `managers.shell.run` with the body after `!`; plugin-facing dispatch still reports a shell line as not dispatched.

## Out of scope

- `ai/guidelines/architecture-principles.md` requested by the proposal is outside the task's allowed changed-file scope and will not be edited. Its stale `ROUTE_NAMES` reference remains uncorrected in this work.
- `help.md` and public user documentation need no update unless they describe behavior that changes; this migration preserves the documented `!` behavior.
