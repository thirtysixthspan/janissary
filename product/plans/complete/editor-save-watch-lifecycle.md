# Re-arm editor watchers after atomic saves

**Complexity: 3/10.** A localized watcher lifecycle change with filesystem regression coverage.

## Goal

Continue detecting external edits after an editor save replaces the watched file, without reporting the save itself as an external edit.

## Approach

Make `markSaved` replace the existing watcher and establish the supplied saved timestamp as its baseline. Keep first-save registration and external-change detection during `refresh` intact. Update the existing lifecycle comments to explain re-arming after replacement.

## Implementation steps

1. Update `src/editor/watch-manager.ts` and the save-path comment in `src/editor/save.ts`. Run check-diff.
2. Extend `src/editor/watch-manager.test.ts` to exercise `saveFile` with mocked watch handles. Add real-filesystem save-then-external-edit coverage in `src/editor/save.test.ts`. Run check-diff and the existing client reload and conflict tests.
3. Update `product/specs/editor-tab.md` and the existing editor user documentation, promote this plan, and remove the resolved backlog entry. Run check-diff and ship through the merge workflow.

## Tests

Assert atomic save replaces the old handle, cancels pending checks, suppresses self-events, detects the next external edit, and closes the replacement on disposal. Verify real filesystem notifications on macOS after two successive saves, with bounded waits and cleanup. Retain first-save and refresh coverage.

## Out of scope

Directory watching, recovery from independently replaced external files, timestamp resolution changes, and client reload or conflict redesign.
