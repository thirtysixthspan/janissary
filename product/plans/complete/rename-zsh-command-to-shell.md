# Rename the shell tab command from `zsh` to `shell`

**Complexity: 5/10** — the shell tab already runs as a plugin command, but `shell` is also a special route for captured shell execution. Remove that route so the plugin can claim the public `shell` command; retain shell execution through the existing `!` prefix.

## Goal

Open shell tabs with `shell [name] [options]`, rather than `zsh [name] [options]`. Keep direct shell execution available through `!<command>`, and update profile restore, sibling-shell creation, help, specs, and user documentation to use the new command.

## Approach

The `shell` route exists only as a leading-keyword shortcut in `resolveCommand`. The same resolver already recognizes `!` as a shell execution route. Removing the keyword route lets the bundled shell plugin claim `shell` through the existing command registry, preserving the single command definition and execution path. The plugin's current argument parser and workspace behavior remain unchanged apart from the usage name.

## Implementation steps

1. Remove `shell` from plugin command route reservations and remove the special `shell <command>` classification from `resolveCommand`; keep `!` classification intact. Update resolver tests to pin the plugin command classification and `!` execution behavior.
2. Rename the bundled shell plugin's command and profile command to `shell`, update usage text and targeted fixtures for command-origin values, and retain `zsh` wording only where it names the actual shell program.
3. Update the shell tab and plugin functional specs, `help.md`, and the shell user guide to describe `shell [name] [options]` and `!<command>`.
4. Remove the matching backlog issue after implementation and move this plan to `complete/`.

## Tests

- `src/commands/resolve.test.ts`: `shell` and `shell <name>` resolve to the plugin command; `!<command>` still resolves to shell execution.
- `src/plugins/adapters.test.ts`: the shell plugin command claim is accepted after `shell` is removed from reserved routes.
- `src/plugins/shell/parse-argument.test.ts`: the usage line names `shell`.
- Update existing shell command fixtures to use `shell` as the command origin and keep tests that refer to the actual zsh executable unchanged.

## Specs and documentation

- Update `product/specs/shell-tab.md` and `product/specs/tab-plugins.md` for the command rename and route behavior.
- Update `help.md` and `documentation/user-documentation/command-bar/shell.md` where they document the shell tab command.

## Out of scope

- Renaming zsh as the shell executable, its startup hooks, process names, or file extensions.
- Changing the shell tab's workspace, remote, queue, profile, or naming behavior.
- Changing the existing `!` shell execution shortcut.
