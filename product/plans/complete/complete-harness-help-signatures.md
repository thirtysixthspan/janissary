# Complete the harness help command signatures

Complexity: 2/10

## Goal

Make `help harness` show usable signatures for each form accepted by the harness command parser. The selected first entry has recorded severity 7/10; its eligibility cutoff is overridden for this recorded finding as requested.

## Approach

Replace the inaccurate optional-name and flag-only examples with the bare launch-dialog form, the named harness launch form, and separate capture and transcript subcommands. Document every launch clause from the parser, including that `with <prompt>` comes last, and name the harnesses that support auto-approve and auto-resume. Align the command signatures at the start of `product/specs/harness.md` with the parser while leaving implementation behavior unchanged. Use the parser tests, subcommand tests, and the canonical `product/plans/complete/help-command.md` as verification sources.

## Implementation steps

1. Update the Usage, Use cases, and Examples blocks in `help/harness.md` with the four valid command forms and representative launch clauses.
2. Update the command signatures and clause-order rule in `product/specs/harness.md` to match the parser and its documented supported-harness restrictions.
3. Run the parser and subcommand tests, compare the help signatures with those sources, and run `$janissary/scripts/run.mjs check-diff`.
4. Promote this plan to `product/plans/complete/` and remove only the resolved first entry from `product/backlog/pull-request.md`.

## Tests

- Run `src/harness/command-parse.test.ts` to verify launch clauses, supported-harness restrictions, and required harness names.
- Run `src/harness/subcommands.test.ts` alongside `src/harness/command-parse.test.ts` to verify the label-targeting subcommand behavior.
- No new tests are needed: this is a documentation correction, and the recorded finding specifies direct verification against the existing parser and subcommand tests.
- Run `$janissary/scripts/run.mjs check-diff` after each change.

## Out of scope

- Changing harness parsing, launching, capture, transcript behavior, or supported harnesses.
- Editing other help pages, plans, backlog entries, or the pull-request description.
