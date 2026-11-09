# Refuse disabled commands for registry-accepted spellings the inventory matcher misses

**Complexity: 3/10** — one optional parameter and one lookup change in two small server modules, plus tests. The risk is only in proving the registry command name maps to an inventory row.

The dispatch policy decides a line is an application command with the registry's `match` functions, many of which are `/^name\b/i` regexes that also accept `ask:hello`, `ask-hello`, or `db.sqlite`. It then identifies the row to check with `resolveApplicationCommand`, which only accepts a form followed by a space or the end of the line. Such a line resolves to no row, is never refused, and runs the disabled command.

## Goal

A disabled command is refused for every input the command registry still routes to it, with `Command is disabled: <command>.`, while lines that match no registry entry keep the ordinary unknown reply, `!` lines stay excluded, and `help` handling is unchanged.

## Approach

1. In `src/native-commands/policy.ts`, give `disabledApplicationCommand` an optional `fallbackName`. When the line resolves to no row, resolve the fallback name instead; the same `effectiveCommandSetting` check then applies.
2. In `src/native-commands/dispatch-policy.ts`, find the first registry command whose `match` accepts the line, and pass its name as the fallback. The longest-fixed-form row still wins when it exists.

## Tests

- `src/native-commands/policy.test.ts`: the fallback refuses a punctuation-joined line, is not used when the row resolves directly, and does not refuse when the fallback row is enabled.
- `src/command/manager.test.ts`: with `ask` or `db` disabled, `ask:hello`, `ask-hello`, and `db.sqlite` are refused through `dispatchTo`, `dispatchLineWithOutput`, and `executeCommand`; `quit now` stays unrefused.

## Spec

`product/specs/application-commands.md`, Disabled command dispatch: registry-accepted looser spellings are refused as the matching command's row.

## Out of scope

Changing the inventory matcher, `help` parsing, and `!` shell lines.
