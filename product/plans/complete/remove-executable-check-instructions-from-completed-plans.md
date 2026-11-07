# Remove executable check instructions from completed plans

**Complexity: 2/10** — The repair changes verification prose in three completed plans and does not change application behavior. The recorded security finding severity is 7/10.

## Goal

Remove instructions that ask readers to execute project tooling from the three completed PDF find plans while keeping their verified coverage and outcomes clear.

## Approach

Replace each imperative `check-diff` instruction with a declarative account of the checks and behavior already verified. Keep the coverage and results stated in each plan. The verification section in this fix plan also reports results without telling readers to run tools.

## Implementation steps

1. Update the verification sections in `pdf-find-final-announcement-docs.md`, `pin-pdf-find-announcement-edge-cases.md`, and `pr-1958-empty-query-screen-reader-announcement.md`.
2. Confirm those sections contain no tool commands or instructions to execute tools and still describe their existing coverage accurately.
3. Record the completed repair in this plan and remove the resolved entry from `product/backlog/pull-request.md`, preserving the empty backlog skeleton.

## Tests and verification

The local diff-scoped check completed successfully without selecting lint, typechecking, or tests because this change touches only markdown plans. Manual review confirmed the three plans retain their existing test coverage and reported outcomes, and their verification sections contain no commands or instructions to execute tools. No application behavior or test code changed.

## Specs and documentation

No functional spec or user documentation changes apply. The repair changes only how completed plans report prior verification.

## Out of scope

- Changes to PDF find implementation or tests.
- Changes to the pull request description or other plans.
- Changes to other backlog entries.
