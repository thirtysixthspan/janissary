# Separate file-link parsing and rendering

Complexity: 4/10

## Goal

Keep file-link parsing and dispatch framework-free so consumers that only classify or transform links do not depend on React.

## Approach

Keep segment types and parsing helpers in `file-link.ts`. Move `renderFileLinkSegments` into a colocated React module that imports the segment type and transcript intent type directly. Update the rendering composition and focused tests to import each responsibility from its defining module, with no compatibility re-export.

## Implementation steps

1. Move `renderFileLinkSegments` and its React and intent imports from `web/src/shared/transcript/file-link.ts` into `web/src/shared/transcript/file-link-render.tsx`.
2. Update `line-text.tsx` and `file-link.test.tsx` to import parsing and rendering from their respective modules.
3. Keep the existing parser, markdown linkification, URL-with-port, and rendered click-routing coverage passing; run `./scripts/run.mjs check-diff` after each implementation step.
4. Promote this plan to complete and remove only this item from `product/backlog/technical-debt.md`.

## Tests

- Preserve the file-link parser tests for paths, line and column suffixes, URLs with ports, and markdown conversion.
- Preserve renderer tests for file editing, URL opening, and plain text, plus `transcript-line.test.tsx` and `open-link.test.ts` behavior.
- Run `./scripts/run.mjs check-diff` after implementation, tests, and backlog edits.

## Out of scope

- Changing link detection, rendered markup, click routing, published plugin capabilities, or other transcript rendering boundaries.
