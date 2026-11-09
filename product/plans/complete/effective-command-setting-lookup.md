# Share one effective command setting lookup

**Complexity: 2/10**

## Goal

Dispatch policy, the ACP runner, and the ACP allow-list read a command's effective availability through one helper, so the rule that a missing snapshot or row means enabled lives in one place.

## Approach

Add `effectiveCommandSetting` to `src/native-commands/policy.ts`, taking the optional snapshot and a canonical row name and returning the effective enabled and agent-access values with enabled defaults. Replace the three independent row searches with it. Behavior does not change.

## Implementation steps

1. Add the helper and use it in `disabledApplicationCommand`.
2. Use it in `toolRunner` in `src/acp/tool-table.ts` and the `allowedCommands` filter in `src/acp/run-prompt.ts`.

## Tests

- A unit test for the missing-snapshot, missing-row, and listed-row results.
- The existing policy, tool-table, run-prompt, manager, and integration tests pass untouched.

## Out of scope

- Any change to the missing-row defaults, or to specs and documentation, since no behavior changes.
