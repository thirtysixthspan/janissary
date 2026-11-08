# Wrap notification capture icons

**Complexity: 2/10**

## Goal

Keep folded notification capture icons readable within narrow notification panes.

## Approach

Allow the existing icon group to wrap and shrink within its notification row while keeping adjacent icons together without gaps.

## Implementation steps

1. Bound the capture group to its container width and enable flex wrapping. Add a regression test covering the applied layout rules and existing icon interaction.
2. Update the notifications spec and the existing public description of repeated notification icons.
3. Complete the plan, remove the fixed backlog entry, verify, and merge.

## Tests

- Verify wrapping and width constraints from the stylesheet used by notification messages.
- Keep existing folded capture order and click tests passing through check-diff.

## Out of scope

- Notification folding, persistence, and toast behavior.
- Changes to capture generation or icon spacing.
