# Fold the empty-relative-path-means-root rule into the shared containment helper

**Complexity: 4/10** — ~12 added lines across 4 production files, 5 behavioral requirements and 8 test scenarios, with one new helper function (p=4.92).

## Goal

`containedPath` in `src/path-containment.ts` deliberately refuses an empty path, so three file-navigator callers each restate an `empty ? root : containedPath(root, rel)` branch before resolving a client-supplied relative path: `absoluteDirectory` in `src/file-navigator/filesystem-port.ts`, `realDirectory` in `src/file-navigator/batch-paths.ts`, and the guard clauses in `src/file-navigator/navigation.ts` (`toggleDir`, `rerootTree`, `expandAndWatch`). A new caller that passes an empty relative path straight to `containedPath` silently refuses a valid operation on the tree root, and the scattered branches make it easy for one of them to treat `'.'` or `'..'` differently from the others. The rule belongs with the containment helper it complements.

## Approach

Add `containedPathOrRoot(root, relPath)` next to `containedPath`. It resolves `''` and `'.'` to the root itself (through `path.resolve(root)`, matching what the inline branches already do) and otherwise delegates to `containedPath`, so escape and absolute-path refusal stay in one place. `containedPath`'s contract does not change: it keeps refusing `''`, `'.'`, `'..'`, and absolute paths for callers that genuinely need the stricter helper. Replace the inline branches in the three named files with calls to the new helper, keeping `containedPath` imported where it is still used for non-root cases (the remote escape check in `rerootTree`, the ordinary path checks in `filesystem-port.ts`, and `commit`'s all-or-nothing resolution).

This is a pure refactor: the empty-path-means-root behavior already exists at each call site and is preserved by the helper, so nothing a user can observe changes and no spec, help, or documentation file needs an update.

## Implementation

1. Add `containedPathOrRoot(root: string, relPath: string): string | undefined` to `src/path-containment.ts`, returning `path.resolve(root)` for `''` and `'.'` and delegating to `containedPath(root, relPath)` otherwise, with a short comment stating why it exists and that `containedPath` stays strict.
2. In `src/file-navigator/filesystem-port.ts`, import `containedPathOrRoot` alongside `containedPath` and reduce `absoluteDirectory` to `return containedPathOrRoot(root, relPath);`. Leave the other `containedPath` call sites untouched.
3. In `src/file-navigator/batch-paths.ts`, import `containedPathOrRoot` in place of `containedPath` and reduce `realDirectory`'s first line to `const absolute = containedPathOrRoot(root, relPath);`.
4. In `src/file-navigator/navigation.ts`, import `containedPathOrRoot`, keep `containedPath` for the remote escape check, and replace the three branches: `toggleDir` and `expandAndWatch` resolve with `containedPathOrRoot(state.root, relPath)` instead of the truthiness ternary, and `rerootTree` keeps its `relPath === undefined ? path.resolve(state.root, '..')` case but resolves all other values through `containedPathOrRoot(state.root, relPath)`.
5. Check `src/file-navigator/manager/item-operations.ts` for the same `empty ? root : containedPath` shape; change it only if one is present.
6. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- **`src/path-containment.test.ts`**: add a `containedPathOrRoot` describe block, mirroring the existing `containedPath` style, covering `''` and `'.'` resolving to the root, a normal relative path resolving inside the root, `'..'` and an escaping path refusing, and an absolute path refusing even when it points inside the root. Keep the existing `containedPath` cases that assert `''`, `'.'`, `'..'`, and absolute paths are refused, so the strict helper's contract is pinned alongside the new one.
- `src/file-navigator/manager.test.ts` and `src/remote/serve-file-navigator.test.ts` must pass unchanged; both exercise operations addressed at the tree root, which is the behavior at stake.

## Out of scope

- Changing `containedPath`'s contract — the strict helper stays as it is for callers that must reject the root.
- Replacing every `containedPath` call in the codebase, only the three named files' empty-path branches.
- Any change to the remote escape check in `rerootTree` or to how absolute paths are refused.
- Splitting the wire protocol's full-world snapshot or any client-state refactor.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- A search for the `=== '' ? path.resolve(root)` / `relPath ? containedPath` idioms in the three named navigator files finds no remaining copies.
- The `''`, `'.'`, `'..'`, and absolute-path cases pass against both helpers with their distinct contracts.

## Documentation and specification impact

None. The empty-path-means-root behavior is unchanged; this consolidates its implementation into one shared helper, so no functional spec, `help/` file, or user documentation describes anything differently.
