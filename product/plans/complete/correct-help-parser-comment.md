# Correct the stale help parser comment

**Complexity: 1/10** — one comment-only edit; behavior and tests stay unchanged.

## Goal

Describe the query parsed by `parseHelpCommand` as a help-page name, while keeping clear that `helper` is not the `help` command.

## Approach

`helpText` passes a named query to `readHelpPage` and defaults bare `help` to the `commands` page. Existing cases in `src/commands.test.ts` cover named pages, missing pages, and `helper` remaining unknown. The functional spec already describes page lookup, so no behavior documentation needs to change.

## Implementation steps

1. Replace only the comment above `parseHelpCommand` in `src/commands.ts` with wording that describes an optional page query and the distinction from `helper`.

## Tests

No test change is needed for this comment-only correction. Run `$janissary/scripts/run.mjs check-diff` to verify the changed files and existing help-query cases.

## Spec

None — the existing `product/specs/application-commands.md` already describes help-page lookup, and no behavior changes.

## Out of scope

- Changing `parseHelpCommand`, `helpText`, or any command behavior.
- Changing tests, specs, or user documentation.
