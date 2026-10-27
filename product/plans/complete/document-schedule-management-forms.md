# Document tab and system schedule management forms

**Complexity: 2/10** — a help-page and one concise spec update, with no command behavior changes. The existing parser and command tests provide the grammar and behavior to verify against.

## Goal

Make `help schedule` a reliable reference for creating and managing tab-owned and project-owned system schedules, including supported tab targeting.

## Approach

Use `product/specs/scheduling.md`, `src/schedule/parsing.ts`, `src/schedule/index.ts`, `src/schedule/usage.ts`, and `src/commands/schedule.ts` as the sources of truth. Keep the existing help-page layout and examples, but expand the Usage block to show each supported tab and system creation form and every list, cancel, and clear form. Explain that `[in <tab>]` targets tab schedules and add examples for targeting and both owners' management commands. State the help-page coverage in `product/specs/application-commands.md` so its observable content remains specified.

## Implementation steps

1. Update `help/schedule.md` with all five tab schedule creation forms, all five system schedule creation forms, optional tab targeting for tab creation and management, and tab/system list, cancel, and clear syntax. Retain the current tab and system creation examples, then add accurate examples for targeted tab management and system management.
2. Update the `help` section in `product/specs/application-commands.md` to state that `help schedule` describes tab and system creation, tab targeting, and both owners' list, cancel, and clear forms.
3. Compare every signature and example directly with the scheduling spec, parser, schedule command, and existing schedule command tests.

## Tests

- Add no tests: this change only makes existing command syntax discoverable in help, and the help wording is verified directly against the parser, command implementation, spec, and existing command tests.
- Run `$janissary/scripts/run.mjs check-diff` after the implementation and spec update.

## Out of scope

- Changing schedule parsing, execution, persistence, or UI behavior.
- Changing the separate `schedules` aggregate tab or its New schedule dialog.
- Adding new schedule syntax or changing the scheduling spec's existing command grammar.
