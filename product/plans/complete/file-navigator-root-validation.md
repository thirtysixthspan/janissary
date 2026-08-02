# File navigator root validation

**Complexity: 7/10** — scalar filesystem operations and watcher setup had separate path flows,
including the intentional parent-navigation case.

## Goal

Keep client-supplied file-navigator paths inside the navigator root for filesystem mutations and
watchers.

## Implementation

- Reused `containedPath` for scalar move, rename, and delete operations.
- Applied the same containment check to directory expansion, rerooting, and restore-driven
  watcher setup; an omitted reroot path still means the parent directory.
- Added regression tests for escaping mutation, toggle, and reroot paths.

## Product behavior

The file navigator ignores an explicit path that escapes its current root. Existing `..` parent
navigation remains available through the navigation action that omits an explicit path.

## Verification

`npm run typecheck:diff`, `npm run lint:diff`, and `./scripts/run.mjs check-diff` pass.
