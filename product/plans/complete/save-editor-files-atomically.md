# Save editor files atomically

**Complexity: 4/10** — the profile work established the replacement primitive, leaving a localized extension for permission preservation plus editor integration and filesystem coverage.

## Goal

Saving an editor buffer must never truncate the existing source in place. The replacement must retain an existing file's permission bits, and tab, draft, watcher, and sync state must change only after the replacement succeeds.

## Approach

Extend the shared atomic-write helper to copy an existing target's permission mode onto its unique same-directory temporary sibling. Route editor writes through that helper; the existing state-update ordering already follows the write call and therefore remains transactional.

## Implementation steps

1. Extend `src/atomic-write.ts` to preserve existing target permission bits while retaining temporary cleanup and new-file behavior.
2. Replace the direct editor write in `src/editor/save.ts` with the shared atomic helper.
3. Add focused editor save tests for permission preservation and successful temporary-sibling cleanup, while retaining existing failed-save state coverage.
4. Update `product/specs/editor-tab.md` and the existing editor user documentation with the atomic-save guarantee.

## Tests

- Overwriting an existing editor file preserves its permission bits.
- A successful editor save installs the new content and leaves no temporary sibling.
- Existing failed-save coverage continues to prove draft state remains unchanged.
- Run `./scripts/run.mjs check-diff` after every implementation, test, spec, documentation, and backlog change.

## Out of scope

- Adding backup history or crash recovery beyond atomic filesystem replacement.
- Changing external-change conflict detection.
- Converting other persistence paths beyond the already shared profile helper.
