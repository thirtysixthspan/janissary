# Correct the open-command help signatures

**Complexity: 1/10** — the command grammar already exists and is covered by parser tests; only the help page needs correction.

## Goal

Make `help/open.md` describe only forms supported by the `open` parser. The current `open external [application] <path|url>` signature suggests that a user can choose an application on the command line, but `open` treats the remaining text as its target.

## Verified grammar

`product/specs/open.md` says the command accepts optional `external` and `page` keywords before a target. `parseOpen` in `src/commands/open.ts` consumes those two whole-word modifiers in either order and treats everything left as the target. It has no application-name argument. The tests in `src/commands/open.test.ts` cover file targets, direct web URLs, bare addresses preceded by `page`, external web opens, and both modifier orders.

## Approach

Replace the unsupported application placeholder with the actual inline and external forms. Show `page` on web-address forms, including external web opens, and make the examples demonstrate those signatures. Leave command behavior unchanged.

## Implementation steps

1. Update the Usage block, use cases, and examples in `help/open.md` to describe inline files, direct web URLs, bare web addresses with `page`, external files, and external web addresses.
2. Run `src/commands/open.test.ts` to verify the documented forms against the parser, then run `$janissary/scripts/run.mjs check-diff`.
3. Promote this plan to complete and remove only the resolved entry from `product/backlog/pull-request.md`.

## Tests

No new test is needed because this change corrects documentation without changing behavior or adding a help-text contract. Run the existing parser tests in `src/commands/open.test.ts` and the required diff-scoped checks.

## Spec and documentation

`product/specs/open.md` already describes the supported grammar and needs no change. `documentation/user-documentation/tab-types/opening-files.md` already documents the correct forms and needs no change.

## Out of scope

- Changing `open` parsing or execution.
- Adding an application selector to the command.
- Changing the behavior spec or user documentation, which already match the parser.
