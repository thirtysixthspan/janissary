# Retain editor watches after external file replacement

Complexity: 7/10

## Goal

Keep an open editor observing its pathname after external atomic replacement, including repeated replacement and deletion followed by recreation.

## Approach

Watch the containing directory and filter named events to the editor file's basename. Treat an unnamed event as a reason to re-check the path. Preserve the existing debounce and mtime baseline, and keep the watcher itself alive while the target file is absent so recreation is observed without a path retry timer. Handle watcher errors explicitly by closing and removing the failed watch state; `unwatch`, tab close, and manager disposal continue to cancel the debounce and close observation.

## Implementation steps

1. Replace the per-file watcher with a containing-directory watcher and filter events by target basename, allowing unnamed events through to the debounced path check.
2. Register an explicit watcher error handler that closes and removes the failed state without leaving pending callbacks.
3. Update watcher unit coverage for unrelated filenames, unnamed events, successive atomic replacements, deletion/recreation, watcher errors, and cancellation on close/dispose.
4. Extend the real editor observation case to verify multiple external atomic replacements followed by another edit and deletion/recreation.
5. Update the editor tab spec's live-reload behavior for atomic replacements and recreation; check help and public docs for existing descriptions that need correction.

## Tests

- `src/editor/watch-manager.test.ts`: event filtering, unnamed event checks, replacement-safe observation, deletion/recreation, error cleanup, and timer cancellation.
- `src/editor/save.test.ts`: real filesystem observation across successive external atomic replacements and recreation.
- Preserve `web/src/editor/useEditorWatchReload.test.ts` reload/conflict behavior and `src/editor/save-conflict.test.ts` stale-save protection.

## Out of scope

- Retrying unavailable containing directories or watcher errors.
- Changing the mtime-based reload contract or dirty-buffer conflict handling.
