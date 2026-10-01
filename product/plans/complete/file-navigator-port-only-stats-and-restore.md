# Read row stats and saved-view restores only through the tab's filesystem port

**Complexity: 4/10** — `markStats` (`src/file-navigator/stats.ts`) becomes cache-only, `restoreTreeView` (`src/file-navigator/restore.ts`) reads through the listing cache, and the synchronous branch of `fillStats` (`src/file-navigator/filesystem-cache.ts`) caches misses the way its async branch already did. No new architecture.

The navigator reads every tree through `FileSystemPort`, but two places still read the local disk directly. `markStats` `lstat`-ed `path.join(state.root, row.path)` for any row absent from the stat cache and cached the result — so on a remote tree a row whose stat was still in flight was described (and cached) from the local disk, and a failed remote batch left that local value in place for good, because `fillStats` skips cached paths. `restoreTreeView` used `statSync` and the default local `buildRows` reader to decide which saved directories to expand and which selection rows survive, so a profile `files` entry targeting a remote tab was judged against local directories.

## Goal

Only the port reads the filesystem. A row shows a detail once the port has supplied it; until then it shows none, and a failed batch leaves it uncached so the next rebuild asks again. A restored view's saved directories are checked against the tree's own listing — answered at once by the synchronous local port, so local behavior is unchanged; on an asynchronous port a directory whose parent listing is still loading is expanded on trust and pruned by the rebuild that listing's arrival triggers, the same rule `pruneCachedRows` applies on every rebuild.

## Approach

1. `markStats` reads `state.stats` only; `readRowStat` stays as the local port's stat primitive.
2. `fillStats`' synchronous branch writes `result[relPath] ?? null` for every requested path, matching the async branch (the removed local fallback had been masking that the sync branch never cached a miss).
3. `listingFor` is exported from `filesystem-cache.ts`; `restoreTreeView` uses it (with `onReady` → `port.rebuild(label)`) to judge each saved directory, and `buildCachedRows` for the surviving selection rows.

## Implementation steps

1. The three source changes above.
2. Tests below; `./scripts/run.mjs check-diff`; full `src/file-navigator` and `src/profile` server tests.
3. `product/specs/file-navigator-tab.md` (remote trees).

## Tests

- `src/file-navigator/stats.test.ts` rewritten: `markStats` attaches cached values per mode, leaves a cached miss and an uncached row without detail, and never touches disk or the cache for an uncached row; the disk cases (symlink, broken symlink, missing path) move to `readRowStat`.
- `src/file-navigator/filesystem-cache.test.ts`: a row with its stat in flight shows no detail and is not cached, and after a failed batch the next rebuild asks for it again. The existing "caches a row the batch says nothing about as null" (sync) now passes on `fillStats` itself.
- New `src/file-navigator/restore.test.ts` on an asynchronous port rooted at a real local directory with a same-named `src`: the restore asks the port for the parent listing, expands on trust while it loads, rebuilds when it arrives, and keeps no selection hint for an unlisted row.
- `src/file-navigator/manager.test.ts` `restoreView` cases (local) keep passing unchanged.

## Out of scope

- Re-applying a selection hint once a remote tree's rows arrive; a remote restore stays best effort, as the spec describes.
- `LocalFileSystemPort.readDirectory`/`statRows` containment behavior.
