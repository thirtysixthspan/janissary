# Resolve Disabled-Command Policy from the Registry Match

**Complexity: 4/10** — one policy gate, three call-site arguments, three focused test cases, and one spec sentence; no new module or state.

## Goal

A disabled-command refusal must apply only when the input is a command the registry actually matched. Today `disabledCommandMessage` selects an inventory row by longest prefix independently of `resolveInTab`, so `quit now`, `clear all`, and `hist 5` are answered `Command is disabled: quit.`, `Command is disabled: clear.`, and `Command is disabled: hist.` when those commands are disabled, even though dispatch treats the lines as unknown. The refusal must follow the same command ownership the dispatcher uses while still refusing commands that are unavailable on the current tab, such as `ask` on a shell tab, and `help`.

## Approach

- Add the registry gate before the inventory lookup in `disabledCommandMessage`: ignore `Command.available`, find a command whose `match` accepts the command text, and allow the `help` row when `getOutput` recognizes help. Return `undefined` when neither matches.
- Keep `resolveApplicationCommand` for the canonical name and parent/child effective settings.
- Thread the raw input and command text through `refuseDisabledCommand` from `run` and `dispatchLine`; pass the supplied `name` and command text from `executeCommandWithContext` so direct callers keep the same policy gate.
- Preserve the explicit `!` shell escape.

## Implementation steps

1. `src/native-commands/dispatch-policy.ts`: change `disabledCommandMessage(managers, input, commandText)` to return `undefined` when `input` or `commandText` starts with `!`; otherwise require `commands.some((command) => command.match(commandText))` or `getOutput(commandText).kind === 'output'` before resolving the inventory row. Change `refuseDisabledCommand` to accept and forward the two strings.
2. `src/command/manager.ts`: pass `input` and `res.cmd` from `run`, `input` and `resolution.cmd` from `dispatchLine`, and `name` and `command` from `executeCommandWithContext`.
3. `product/specs/application-commands.md`: state that input matching no registered command keeps the unknown-command reply even when it begins with a disabled command name.

## Tests

- `src/command/manager.test.ts`: with `quit`, `clear`, and `hist` disabled, dispatching `quit now`, `clear all`, and `hist 5` records the ordinary unknown-command reply and no refusal.
- Same file: `ask hello` on the seeded shell tab with `ask` disabled still returns `Command is disabled: ask.` even though `ask` is unavailable there.
- Same file: the plugin alias `connection` with `connections` disabled returns `Command is disabled: connections.`
- Keep the existing alias, shared-owner, parent/child, help, queue, schedule, and notification tests passing.

## Out of scope

- The separate capture-contract test gap recorded in the second backlog entry.
- Changing `resolveApplicationCommand`'s inventory row selection or `resolveCommand`'s availability rules.
- Any new settings, notification, or inventory surface.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development.
