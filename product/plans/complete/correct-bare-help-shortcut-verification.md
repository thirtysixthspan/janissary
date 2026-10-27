# Correct bare-help shortcut verification

**Complexity: 2/10** — clarify one help-output expectation in the command spec and pin it in the existing help test. The application output does not change. The current PR body contains no D1 assertion about help, so do not add a new verification step or alter another step.

## Goal

Make the bare-help verification precise: `help` prints the command table, whose `queue` row includes `Ctrl+E`, while the separate `### Key Bindings` section appears only in `help keys`.

## Findings

`help/commands.md` includes `Ctrl+E` in the `queue` row. `src/commands.test.ts` already checks that bare help prints the command table without a separate `### Key Bindings` section, and that `help keys` includes `Ctrl+E`; it does not assert the queue row's shortcut reference. `product/specs/application-commands.md` says key bindings are not included in bare help, which needs to distinguish the separate reference from an inline command-row shortcut. The current pull request body has no help-output assertion to replace.

## Approach

Preserve the existing help output. Extend the current bare-help test to assert that the `queue` row contains `Ctrl+E`, and update the `help` section of the application-command spec to distinguish inline shortcut references from the separate key-bindings table. After the branch changes are pushed, re-read the PR body; edit it only if the named D1 assertion is present, replacing that assertion with the backlog's proposed wording and preserving every other paragraph.

## Implementation steps

1. Add an assertion to the existing bare-help output test that the `queue` row includes `Ctrl+E`, while retaining the command-table and no-separate-key-bindings checks.
2. Clarify the bare-help behavior in `product/specs/application-commands.md`.
3. Run the focused server test and `$janissary/scripts/run.mjs check-diff`.
4. Promote this plan, remove only this first backlog entry, and publish to the existing PR head branch.
5. After the push, inspect the PR body and replace only the named D1 help assertion if it is present. Otherwise leave the body untouched.

## Tests

One existing test is extended in `src/commands.test.ts` to assert that bare help contains the queue row's `Ctrl+E` reference and still omits the separate `### Key Bindings` section. The focused command test and the diff-scoped check gate verify the change.

## Spec

Update `product/specs/application-commands.md` to state that bare help may contain shortcut references in command descriptions, including `Ctrl+E` in the queue row, without including the separate key-bindings reference.

## Docs

No help or user-documentation update is needed. The command table already contains the correct queue-row reference, and the application output does not change.

## Out of scope

- Changing application output or command routing.
- Adding a new help-verification step to the PR body when the named assertion is absent.
- Changing any other PR-body text, the PR title, or any other backlog entry.
- Editing `product/backlog/issues.md`.
