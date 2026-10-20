# Dispatch the shell plugin command from a shell command bar

**Complexity: 2/10** — the shared command dispatcher already resolves plugin commands; it only needs to distinguish the shell plugin launcher from the `!` command that deliberately falls through to zsh.

## Goal

Allow a shell command bar to dispatch `shell <arguments>` to the shell plugin, while keeping `!<command>` on the zsh path.

## Root cause

`CommandManager.dispatchLine()` returns `dispatched: false` for every application resolution named `shell`. This preserves fallback for the core `!` shell command, but the shell plugin's launcher command also resolves to `shell`. `useShellSubmit` treats `false` as a request to write the line to zsh, so a launcher such as `shell pr1760 -w` fails as a zsh command.

## Approach

Keep the existing unclaimed result for a `shell` resolution whose command begins with `!`. Let other `shell` resolutions continue to the matched command executor, which selects the shell plugin command. Pin both sides in the `CommandManager` regression tests and describe the behavior in the shell-tab spec.

## Implementation steps

1. Update `src/command/manager.ts` so the shell fallback applies to the `!` command and not to the shell plugin launcher.
2. Update `src/command/manager.test.ts` to assert that `shell pr1760 -w` dispatches through the shell plugin command and that `!printf probe` remains undispatched for zsh fallback.
3. Update `product/specs/shell-tab.md` to make the shell plugin launcher's command-bar routing explicit.

## Tests

- `src/command/manager.test.ts` verifies a shell plugin launcher dispatches and a leading-`!` command remains available to the terminal fallback.
- Run `$janissary/scripts/run.mjs check-diff` after the implementation and test changes.

## Docs

No public documentation edits are needed. `help.md` and `documentation/user-documentation/command-bar/shell.md` already describe `shell` as opening a shell tab from a command bar.

## Out of scope

- Changing the meaning of `!` or ordinary unclaimed command-bar input.
- Changing shell launcher parsing, workspace creation, or zsh execution.
