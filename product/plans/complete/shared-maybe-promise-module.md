# Move the sync-or-async result helper into its own shared module

**Complexity: 2/10** — one new three-declaration module, one deletion, and an import rewrite across twelve modules. No behavior changes, no signature changes, and nothing crosses the wire differently.

`src/file-navigator/filesystem-port.ts` opens with `MaybePromise`, `mapMaybe`, and the private `mapPromise` that backs it, and then goes on to declare `WatchHandle`, `GitMetadata`, `ReplayResult`, the `FileSystemPort` interface, and the whole `LocalFileSystemPort` class — a module pulling in `node:fs`, `../git-status.js`, `./batch.js`, `./paste.js`, and a dozen more. Five modules outside the file navigator import from it purely to reach that three-line generic: `src/controller/file-navigator.ts`, `src/controller/editor-adapter.ts`, `src/editor/save.ts`, `src/remote/filesystem-operations.ts`, and `src/remote/serve-file-navigator.ts`. The editor's save path has no business naming a filesystem port implementation module to say "this value may or may not be a promise".

## Goal

`MaybePromise` and `mapMaybe` live in one top-level module of their own, `src/maybe-promise.ts`, and every consumer — inside the file navigator and outside it — imports them from there. `filesystem-port.ts` becomes a consumer of the type like everyone else, and keeps no re-export, so there is exactly one place the helper comes from.

## Design decisions

**A top-level module, not a nested one.** The helper is a general-purpose TypeScript utility with no relationship to any feature, which is precisely why five features reach for it. `src/` already keeps its cross-cutting one-concern modules flat at the root — `error-text.ts`, `github-url.ts`, `client-message.ts` — and this is one of them.

**No re-export left in `filesystem-port.ts`.** Leaving one would mean the type keeps two import paths and the existing sites never have to move, which defeats the point. Every import site is rewritten instead.

**The private `mapPromise` moves too.** It exists only to give `mapMaybe` an `async` body without making `mapMaybe` itself async; it is an implementation detail of the helper and belongs beside it, unexported.

**The union itself stays.** Narrowing `MaybePromise` away — making every caller await — is a much larger change to the port contract and both its implementations. This change moves the helper; it does not redesign it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The three declarations being moved | `src/file-navigator/filesystem-port.ts:19`–`:26` |
| Import sites inside the feature | `manager.ts`, `manager-batch.ts`, `manager-history.ts`, `manager-files.ts`, `manager-item-operations.ts`, `manager-mutations.ts` |
| Import sites outside the feature | `src/controller/file-navigator.ts`, `src/controller/editor-adapter.ts`, `src/editor/save.ts`, `src/remote/filesystem-operations.ts`, `src/remote/serve-file-navigator.ts` |
| Flat single-concern root modules to match | `src/error-text.ts`, `src/github-url.ts` |

## Implementation steps

1. **New module `src/maybe-promise.ts`.** Move `MaybePromise`, `mapMaybe`, and the unexported `mapPromise` across verbatim. The module imports nothing.

2. **`src/file-navigator/filesystem-port.ts`: delete and re-import.** Remove the three declarations and add `import type { MaybePromise } from '../maybe-promise.js';` — the file uses the type across the `FileSystemPort` interface and `LocalFileSystemPort`, but not `mapMaybe`, so a type-only import is what it needs. Leave no re-export.

3. **Rewrite the eleven other import sites.** In each, drop `MaybePromise`/`mapMaybe` from the `filesystem-port.js` import (deleting the import statement entirely where nothing else was taken from it) and add one from `maybe-promise.js`. `src/` is NodeNext, so every new relative import carries `.js`; keep `import type` where the site takes only the type, and a value import where it takes `mapMaybe`:

   - type only: `manager.ts`, `manager-mutations.ts`, `src/controller/editor-adapter.ts`, `src/editor/save.ts`, `src/remote/filesystem-operations.ts`, `src/remote/serve-file-navigator.ts`
   - value (`mapMaybe`, with the type alongside): `manager-batch.ts`, `manager-history.ts`, `manager-files.ts`, `manager-item-operations.ts`, `src/controller/file-navigator.ts`

## Tests

- **New `src/maybe-promise.test.ts`** — the helper has no direct coverage today, and giving it a home of its own is the moment to add it: `mapMaybe` applies the mapper synchronously and returns a non-promise when handed a plain value; it returns a promise resolving to the mapped value when handed a promise; it does not invoke the mapper before that promise settles; and a mapper that throws on a promised value rejects rather than throwing synchronously.
- **`src/file-navigator/filesystem.test.ts`, `src/remote/serve-file-navigator.test.ts`, `src/remote/file-navigator-refusal-contract.test.ts`** must pass unchanged — they drive both port implementations through this type, so a missed import path fails there. None of the three imports `MaybePromise` directly, so none needs editing.

## Out of scope

- **Splitting `LocalFileSystemPort` out of the module that declares the interface it implements.** That would finish the job on this file's responsibilities but reaches considerably more code; it is its own change.
- **Removing the sync-or-async union.** Every caller still routes through `mapMaybe` rather than awaiting, and the local port still throws at runtime when a history replay turns out to be asynchronous. Unchanged here.
- **Any behavior change, wire-format change, or spec-visible change.** This is an import-only move.
