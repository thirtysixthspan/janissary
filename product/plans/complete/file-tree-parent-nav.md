# Add ".." parent-directory navigation to the file tree

**Complexity: 4/10** — adds a new `fileTreeReroot` RPC, a `reroot` manager method, a virtual row in `buildRows`, and client-side handling for the ".." entry.

## Goal

Add a `..` row at the top of the file tree listing. When activated (double-click or Enter/Space), it moves the tree root up one directory. For example, from `/root/src` to `/root`.

## Background

The file tree tab is rooted at a specific directory and cannot currently change roots. Users must close and reopen with `files <parent>`. Adding a ".." entry provides intuitive directory navigation consistent with file managers and terminal `cd ..`.

## Approach

1. **Server**: Add a `fileTreeReroot` RPC. `buildRows()` prepends a virtual ".." row (depth 0, dir, no expanded). `FileTreeManager.reroot()` unwatches old dirs, resolves the parent, sets new root, rebuilds.
2. **Client**: `onRowDoubleClick` and keyboard `onActivate` check for `path === '..'` and send `fileTreeReroot` instead of `toggle`.
3. **No type changes** — the ".." row is detected by `path === '..'` convention.

## Implementation

1. **`src/protocol.ts`** (line 109): Add RPC:
   ```
   | { method: 'fileTreeReroot'; params: { index: number } }
   ```

2. **`src/controller.ts`** (line 160): Add:
   ```
   fileTreeReroot(index: number): void
   ```

3. **`src/index.ts`** (line 188): Add case branch.

4. **`src/file-tree-manager.ts`**: Add `reroot(label)` method: resolve parent with `path.resolve(state.root, '..')`, unwatch all dirs, set new root+expanded, rebuild, update tab cwd.

5. **`src/file-tree.ts`** (line 48): Before returning, prepend a ".." row when `path.dirname(root) !== root`:
   ```
   { path: '..', name: '..', depth: 0, dir: true }
   ```

6. **`web/src/FileTreeTab.tsx`**: 
   - In `onRowDoubleClick`: check `row.path === '..'` and call `reroot(row.path)` 
   - In `runAction`: handle `action.type === 'reroot'`
   - Add `reroot` helper: sends `{ method: 'fileTreeReroot', params: { index } }`

7. **`web/src/file-tree-keys.ts`**: In `onActivate`, check `row.path === '..'` and return `{ type: 'reroot', path: '..' }`.

8. **Tests**: Update file-tree.test.ts to test ".." row in buildRows; update file-tree-manager tests; add client test for ".." activation.

9. **`spec/file-tree-tab.md`**: Add ".." entry to mouse/keyboard interaction tables.

## Tests

- `src/file-tree.test.ts`: `buildRows` includes ".." row at depth 0 when root is not filesystem root.
- `web/src/FileTreeTab.test.tsx`: Double-click on ".." row sends `fileTreeReroot`.
- `web/src/file-tree-keys.test.ts`: Enter/Space on ".." row returns reroot action.

## Out of scope

- Animation/transition effects on re-root.
- History/navigation stack (back/forward).
- Any other file tree tab issues.
