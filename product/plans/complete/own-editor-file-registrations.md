# Own editor file registrations

**Complexity: 6/10** — editor registrations cross open, dedupe, rename, file-navigator retarget, synced provisioning, and close paths, but every editor already carries the opaque URL that can serve as its ownership token. The fix extends the existing registry rather than introducing a new lifecycle system.

## Goal

Each open editor owns exactly one current `/open/<id>` registration. A registration created for a duplicate open is revoked immediately; renaming or retargeting replaces the prior registration; synced provisioning reuses its placeholder registration; and closing the editor revokes its final registration. Stale authenticated URLs must stop serving files once their editor no longer owns them.

## Approach

Add URL-aware `replace` and `release` operations to `FileRegistry`, keeping opaque-ID parsing in one place. Expose those operations through the tab-opening and tab-operation ports. Treat `EditorView.url` as the editor's current owned reference: release a speculative view URL when deduplication selects an existing tab, replace it during rename and retarget, keep it unchanged when synced provisioning completes for the same path, and release it during tab cleanup. Plugin references continue using their existing tracked ID list and backing map.

## Implementation steps

1. Extend `src/tab/file-registry.ts` with centralized release and replace operations for `/open/<id>` references, and expose them through `TabManager` and its structural ports.
2. Update `src/tab/openers.ts`, `src/tab/rename-editor.ts`, `src/tab/rename.ts`, `src/tab/operations.ts`, and `src/tab/manager.ts` so editor dedupe releases the unused registration and editor retargeting replaces the owned registration. Extract the cohesive retarget operation to `src/tab/retarget-editor.ts` if the added registry methods push `TabManager` over the 200-line limit.
3. Update `src/open-file-manager.ts` to retain the synced placeholder URL when provisioning finishes, and update `src/tab/cleanup.ts` to revoke an editor's current URL on close.
4. Add lifecycle regression tests in the existing tab-opening, tab-manager, cleanup, and synced-open test suites.
5. Record the editor URL lifetime in `product/specs/editor-tab.md`, remove the resolved backlog entry, and promote this plan after checks pass.

## Tests

- `src/tab/opening-state.test.ts`: opening an already-open file releases the speculative duplicate registration and retains the existing one.
- `src/tab/manager.test.ts`: rename and file-navigator retarget replace the prior registration so its URL no longer resolves.
- `src/tab/cleanup.test.ts`: closing an editor releases its current registration without touching unrelated references.
- `src/open-file-manager.test.ts`: completing synced provisioning reuses the placeholder URL and allocates no second registration.

## Out of scope

- Changing authentication or the HTTP `/open/<id>` route.
- Redesigning plugin resource ownership, which already tracks and releases registrations explicitly.
- Reusing numeric IDs or deduplicating registrations across separate live tabs.
- Changing editor content, rename, sync, or close behavior visible in the UI.
