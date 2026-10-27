# Keep storage paths out of the roles command help

**Complexity: 2/10** — one description paragraph in a command help page needs wording correction; no executable behavior changes.

## Goal

The roles command help should describe the choices users can make without naming the file used to store them, as required by `product/plans/complete/help-command.md`'s user-facing content rule.

## Approach

Replace the description in `help/roles.md` with a concise account of the ordered harness, model, and effort choices assigned to each named role. Preserve the page's existing heading, Usage, Use cases, and Examples layout. Keep storage details in the roles spec and user guide, where they support readers who need them.

## Implementation steps

1. Update only the description paragraph in `help/roles.md`.
2. Remove this resolved item from `product/backlog/pull-request.md`, preserving the required empty-file comment and heading.

## Tests

No test pins help wording, and the behavior is unchanged. Verify the page still follows its fixed layout and that its description contains no storage path; run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing the roles command, roles tab, roles spec, or user documentation.
- Changing any other command help page or help layout.

## Verification

- Run `$janissary/scripts/run.mjs check-diff`.
- Confirm `help/roles.md` retains its fixed page layout and no longer names a storage path.
