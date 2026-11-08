# Preserve the pull-request backlog heading when draining it
**Complexity: 2/10** — The repair workflow already requires the exact empty skeleton; this repair removes the final finding and restores that skeleton.

## Goal

Keep `product/backlog/pull-request.md` in its documented empty state after its sole entry is resolved: the introductory comment, a blank line, and `# pull-request`.

## Approach

Verify the issue matches the sole backlog entry. Confirm the repair workflow's empty-state instruction already preserves the comment and heading, so no workflow edit is needed. Remove the resolved entry and restore the exact skeleton.

## Implementation steps

1. Promote this plan through `ready/` to `complete/`.
2. Remove the sole resolved finding and leave the backlog as the exact empty skeleton.

## Tests

- Run `$janissary/scripts/run.mjs check-diff` after each change.
- Verify the backlog contains exactly the required comment, blank line, and heading.

## Out of scope

- No repair-workflow, runtime, spec, or notification behavior changes.
- No edits to unrelated files.
