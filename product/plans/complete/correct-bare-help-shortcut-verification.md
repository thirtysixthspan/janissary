# Correct bare-help shortcut verification

**Complexity: 2/10** — clarify one help-output expectation in the command spec and pin it in the existing help test. The application output does not change. The current PR body contains no D1 assertion about help, so do not add a new verification step or alter another step.

## Goal

Make the bare-help verification precise: `help` prints the command table, whose `queue` row includes `Ctrl+E`, while the separate `### Key Bindings` section appears only in `help keys`.

## Findings

`help/commands.md` includes `Ctrl+E` in the `queue` row. `src/commands.test.ts` already checks that bare help prints the command table without a separate `### Key Bindings` section, and that `help keys` includes `Ctrl+E`; it does not assert the queue row's shortcut reference. `product/specs/application-commands.md` says key bindings are not included in bare help, which needs to distinguish the separate reference from an inline command-row shortcut. The current pull request body has no help-output assertion to replace.

## Approach

The existing help output was preserved. The bare-help test now asserts that the `queue` row contains `Ctrl+E`, and the `help` section of the application-command spec distinguishes inline shortcut references from the separate key-bindings table. The PR body was reviewed after publication; it contained no named D1 assertion, so no description change was made.

## Implementation steps

1. Add an assertion to the existing bare-help output test that the `queue` row includes `Ctrl+E`, while retaining the command-table and no-separate-key-bindings checks.
2. Clarify the bare-help behavior in `product/specs/application-commands.md`.
3. The focused server test and diff-scoped checks passed.
4. This plan was promoted, only this first backlog entry was removed, and the changes were published to the existing PR head branch.
5. After publication, the PR body was inspected. The named D1 help assertion was absent, so the body remained unchanged.

## Tests

One existing test in `src/commands.test.ts` asserts that bare help contains the queue row's `Ctrl+E` reference and still omits the separate `### Key Bindings` section. The focused command test and diff-scoped checks passed.

## Spec

Update `product/specs/application-commands.md` to state that bare help may contain shortcut references in command descriptions, including `Ctrl+E` in the queue row, without including the separate key-bindings reference.

## Docs

No help or user-documentation update is needed. The command table already contains the correct queue-row reference, and the application output does not change.

## Out of scope

- Changing application output or command routing.
- Adding a new help-verification step to the PR body when the named assertion is absent.
- Changing any other PR-body text, the PR title, or any other backlog entry.
- Editing `product/backlog/issues.md`.
