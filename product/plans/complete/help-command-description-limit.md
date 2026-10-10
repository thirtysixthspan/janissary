# Limit command help descriptions

**Complexity: 2/10** — shorten a handful of help entries, add a table length regression test, and clarify the command spec. No architecture changes.

## Goal

Keep every description in the `help.md` Commands table at or below 200 characters so command help stays scannable.

## Approach

Shorten descriptions that exceed the limit while preserving each command's main purpose and commonly needed syntax. Add a test that parses the descriptions returned by `help commands` and enforces the limit. Update the application-command spec to make the cap part of the behavior.

## Implementation steps

1. Shorten command descriptions in `help.md` so each is at most 200 characters.
2. Add a regression test for the command description limit in `src/commands.test.ts`.
3. Update `product/specs/application-commands.md` to document the limit.

## Tests

- Assert every description row returned by `help commands` is at most 200 characters.

## Out of scope

- Key binding descriptions and the longer detailed shell command syntax beyond the command table summary.
- User documentation, which does not change behavior it already documents.
