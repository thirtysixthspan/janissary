# Give path containment one neutral home

**Complexity: 6/10** — about twenty files change, but each change swaps a hand-written check for one of three helpers in a new module; the one behavior change is the `..notes` fix in the workspace-clone lookup.

## Goal

Every "is this path inside that root" decision on the server goes through one tested rule, with a strict variant for callers that exclude the root itself. A fix to the rule reaches every caller, and a child named `..notes` is never mistaken for an escape.

## Approach

`containedPath` and `containedAbsolute` live in `src/file-navigator/batch-paths.ts`, so remote code reaches into the file navigator for them, and everyone else writes the check inline under one of four rules. Move both verbatim into a new `src/path-containment.ts` and add `containedStrictly(root, absolute)`, which answers the same rule with the root itself excluded. Importers move to the new module directly, with no re-export from the old home, per `ai/guidelines/imports-and-barrel-files.md`.

`isInsideRoot` in `src/plugins/files.ts` stays, because plugins may import that module and nothing else of the host's, and it keeps its own answer for an empty root (false, where the shared rule treats an empty root as the process directory). It becomes a thin wrapper: the empty-root check, then `containedAbsolute`.

The inline versions each map to one helper:

- Root included (`containedAbsolute`): `contained` in `src/agent/skill-grants.ts`, `within` in `src/agent/task-resolution.ts`, the escape check in `governingNavigator` in `src/open/file-manager.ts`, `isSameOrDescendantAbsolute` in `src/file-navigator/paste.ts`, and `isSameOrDescendantPath` in `src/file-navigator/index.ts` (tree-relative paths; the helper resolves both sides the same way, so the comparison holds).
- Root excluded (`containedStrictly`): `selectedInstalledSkillDirs` in `src/agent/execute.ts` and the skill-directory filter in `src/sandbox/harness-spawn.ts` (the same strict rule written twice), `isRemoteCacheFile` and the per-workspace record sweep in `src/file-navigator/remote/file-cache.ts`, and `localCloneOf` in `src/plugins/origin-workspace-records.ts`, whose `relative.startsWith('..')` wrongly rejected a clone named `..notes`.

`isSameOrDescendantPath` and `isSameOrDescendantAbsolute` are deleted and their callers call the shared helper.

## Implementation steps

1. Create `src/path-containment.ts` with `containedPath`, `containedAbsolute`, and `containedStrictly`.
2. Remove the two from `src/file-navigator/batch-paths.ts` and point it and every importer (`batch.ts`, `filesystem-port.ts`, `filesystem.ts`, `navigation.ts`, `selection-action.ts`, `manager/item-operations.ts`, `remote/file-cache.ts`, `src/remote/filesystem/path-containment.ts`, `src/remote/filesystem/refusal.ts`, `src/remote/serve-file-navigator.ts`, `src/remote/serve-processes.ts`) at the new module.
3. Make `isInsideRoot` a wrapper over `containedAbsolute`.
4. Replace the inline versions listed above, deleting `isSameOrDescendantPath` and `isSameOrDescendantAbsolute`.

## Tests

- New `src/path-containment.test.ts` pinning, for each helper: the root itself, `..`, `../x`, a `/repo-evil` sibling beside `/repo`, a `..notes` child, an absolute relative path (for `containedPath`), and an empty root.
- `src/plugins/origin-workspace.test.ts`: `localCloneOf` answers a clone whose name starts with `..`.
- Move the `isSameOrDescendantPath` cases in `src/file-navigator/index.test.ts` onto the shared helper's file rather than deleting their coverage.
- Existing coverage stays green: `src/plugins/files.test.ts` (including the empty-root refusal), `src/file-navigator/batch.test.ts`, `src/remote/filesystem/operations.test.ts`, `src/file-navigator/remote-cwd.test.ts`, `src/open/file-manager.test.ts`, and the sandbox skill-directory case in `src/sandbox/harness-spawn.test.ts`, which now runs on every platform.

## Out of scope

- A lint rule against writing the check inline again.
- `path.relative` calls that compute a display or relative path rather than decide containment (`src/paths.ts`, `src/plugins/diff/display.ts`, `src/profile/save/entries.ts`, the sync-path computations in `src/open/file-manager.ts`).
