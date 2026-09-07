# Remove stale documentation screenshots

**Complexity: 2/10** — this is a focused documentation and capture-manifest cleanup with no product behavior change.

## Goal

Remove the six misleading screenshots from the public documentation and prevent the screenshot pipeline from recreating them.

## Approach

- Delete the six requested PNG assets.
- Remove their manifest entries so full documentation captures do not restore the files.
- Remove each corresponding Markdown image embed while retaining the surrounding user guidance.

## Implementation

1. Delete the browser, connections, shell output, tab completion, tab navigator, and transcript file-link PNGs.
2. Remove those six named entries from the documentation screenshot manifest.
3. Remove the six image references from their command-bar and tabs documentation pages.

## Tests

- Run `./scripts/run.mjs check-diff` to verify the documentation and manifest diff passes repository checks.
- Search the repository for removed screenshot names to confirm no stale source declarations or user-documentation embeds remain.

## Out of scope

- Replacing the removed visuals, changing command behavior, or altering functional specifications. This cleanup does not change user-visible product behavior.
