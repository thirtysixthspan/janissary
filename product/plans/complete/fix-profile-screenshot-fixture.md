# Fix profile screenshot fixture

**Complexity: 2/10** — replace an obsolete fixture layout with the current profile file format and regenerate two screenshots.

## Goal

Make the demo profile launch successfully during documentation captures.

## Approach

Provide `profiles/demo.json` with writer and editor agents in a shared group, replacing the obsolete per-agent fixture files.

## Implementation

1. Replace the obsolete fixture directory with a single demo profile.
2. Regenerate the tabs-groups and profile-group screenshots.
3. Remove the resolved backlog entry.

## Tests

- Run the two screenshot captures and `./scripts/run.mjs check-diff`.

## Out of scope

- Changing profile loading behavior.
