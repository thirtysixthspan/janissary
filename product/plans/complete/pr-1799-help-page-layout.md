# PR 1799 — restore the fixed command help page layout

Complexity: 2/10

## Goal

Make `help/browser.md`, `help/files.md`, `help/schedule.md`, and `help/ssh.md` follow the fixed layout in `product/plans/complete/help-command.md` without losing any factual guidance.

## Approach

Each page keeps its command heading and one opening description, followed by **Usage**, **Use cases**, and **Examples** in that order. Move explanatory prose after Usage or Use cases into the opening description or the relevant labelled block. Update the command spec to record the fixed page structure. No command behavior or runtime code changes.

## Implementation steps

1. Reorganize the four named help pages, preserving their signatures, use cases, examples, and explanatory details.
2. Update `product/specs/application-commands.md` to specify the single description and ordered blocks.

## Tests and verification

- Inspect all four pages against the canonical layout: one opening description, then Usage, Use cases, and Examples, with no free-standing prose outside those blocks.
- Confirm each explanatory fact from the original pages remains represented in the revised pages.
- Run `$janissary/scripts/run.mjs check-diff` and `git diff --check`.
- No automated layout test is added; the canonical feature plan explicitly leaves layout enforcement to review.

## Out of scope

- Runtime behavior, command signatures, and factual command guidance.
- Other help pages or documentation pages.
- A layout snapshot or automated page-structure test.
