# syncPaths accepts directory prefixes and wildcards

**Complexity: 3/10** — one matcher function replacing a straight `Array.includes` check, plus new unit tests. No architecture change; a single call site consumes it.

## Goal

`syncPaths` currently only matches a file whose project-relative path is an **exact** string in the list (`src/open-file-manager.ts:81-86`, `getConfig().syncPaths.includes(relative)`). A user who wants to sync everything under `product/backlog/` has to list every file individually, and adding a new file to that directory silently isn't synced until the config is edited again.

After this fix, a `syncPaths` entry can be:

- An **exact file path** (existing behavior, unchanged) — `docs/notes.md` matches only that file.
- A **directory prefix**, written with a trailing slash — `product/backlog/` matches every file whose relative path starts with `product/backlog/`, at any depth.
- A **wildcard pattern** containing `*` — `product/backlog/*` matches any single path segment in that position (no `/`), so `product/backlog/*` matches `product/backlog/bugs.md` but not `product/backlog/sub/bugs.md`; `product/plans/*/*` matches exactly two segments deep, e.g. `product/plans/draft/foo.md`.

## Approach

Extract the matching logic out of `open-file-manager.ts` into a small new module, `src/sync-path-match.ts`, so it can be unit tested directly without going through `OpenFileManager`'s file-system-touching call sites.

```ts
export function matchesSyncPath(relative: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return relative === pattern.slice(0, -1) || relative.startsWith(pattern);
  if (pattern.includes('*')) return globToRegExp(pattern).test(relative);
  return relative === pattern;
}

export function isSyncedPath(relative: string, syncPaths: string[]): boolean {
  return syncPaths.some((pattern) => matchesSyncPath(relative, pattern));
}
```

`globToRegExp` escapes regex metacharacters in the pattern, then replaces each `*` with `[^/]*` (a single-segment wildcard — matches within one path component, never across a `/`), and anchors the result with `^...$`.

`open-file-manager.ts:81-86` (`isSyncPath`) changes to call `isSyncedPath(relative, getConfig().syncPaths)` instead of `.includes(relative)`. No other call site touches `syncPaths` matching.

## Implementation steps

1. Create `src/sync-path-match.ts` exporting `isSyncedPath` and (module-private) `globToRegExp`.
2. Update `src/open-file-manager.ts:81-86` to import and call `isSyncedPath(relative, getConfig().syncPaths)`.
3. Run `./scripts/run.mjs check-diff`.

## Tests

New file `src/sync-path-match.test.ts`:

- Exact match: `docs/notes.md` matches pattern `docs/notes.md`; does not match `docs/notes2.md`.
- Directory prefix: `product/backlog/` matches `product/backlog/bugs.md` and `product/backlog/sub/deep.md`; does not match `product/backlog2/bugs.md`.
- Single-level wildcard: `product/backlog/*` matches `product/backlog/bugs.md`; does not match `product/backlog/sub/deep.md`.
- Two-level wildcard: `product/plans/*/*` matches `product/plans/draft/foo.md`; does not match `product/plans/foo.md` or `product/plans/draft/sub/foo.md`.
- `isSyncedPath` returns true if any pattern in the list matches, false if none do.

## Out of scope

- `**` recursive wildcards — not requested by the issue; the trailing-slash directory-prefix form already covers the "sync everything under this directory" case.
- Changing the default `syncPaths` value (separate backlog issue).
