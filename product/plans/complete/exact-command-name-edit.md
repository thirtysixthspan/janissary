# Require exact name matching in the command settings edit path

**Complexity: 2/10**

## Goal

A name passed to the settings manager edit or the `commands` topic `set` action must equal a canonical name, alias, or fixed form exactly, so trailing words never change a setting the caller did not name.

## Approach

Add an exact-resolution helper beside `resolveApplicationCommand` that accepts the resolved row only when the normalized input equals its name, an alias, or a matched fixed form. Use it in the manager `edit` and in the topic `set` action before the native-command check.

## Implementation steps

1. Add `resolveExactApplicationCommand` to `src/application-commands.ts`.
2. Use it in `src/native-commands/manager.ts` and `src/plugins/commands-topic.ts`.
3. Update the application-commands spec.

## Tests

- Manager: a trailing-word name is refused without writing a file; an alias with odd case and spacing still edits.
- Topic: trailing-word names are refused as unknown for both settings.

## Out of scope

- The `commands` command parser, which already matches exactly.
