# Route file navigator clipboard access through its paste hook

**Complexity: 3/10** — a localized client-side boundary cleanup in the file navigator. The paste hook already subscribes to the clipboard store; the change retains its snapshot, exposes cut/disarm actions, updates two callers, and adds focused tests. No new architecture or cross-feature changes.

## Goal

Keep file navigator components from reading or writing the clipboard store directly, while preserving live Paste-menu visibility, cut behavior, and Escape's selection-and-clipboard clearing behavior.

## Approach

`useFileNavigatorPaste` already subscribes with `useSyncExternalStore`, and already owns clipboard reads for paste and clipboard marks. Keep the subscribed snapshot and return `armed`, `cut(paths)`, and `disarm()` from the hook. The hook uses its existing remote-host argument when arming a cut. `FileNavigatorTab` delegates its cut chord to the hook, `FileNavigatorOverlays` uses `armed` to decide whether Paste appears, and `useFileNavigatorKeyDown` receives the hook result for Escape handling. The clipboard store remains a module-level singleton; replacing it with an app-edge injected instance is out of scope.

## Implementation steps

1. Extend `useFileNavigatorPaste` to retain the subscribed snapshot and return `armed`, `cut`, and `disarm`.
2. Update `FileNavigatorTab`, `FileNavigatorOverlays`, and `useFileNavigatorKeyDown` to use the hook API and remove their direct store imports.
3. Add hook tests for subscribed `armed` updates, host-aware `cut`, and `disarm`; update the overlays paste fixture and add a test that an open menu tracks `armed` changes through the hook.
4. Run `$janissary/scripts/run.mjs check-diff` after source changes and after tests.
5. Update `product/specs/file-navigator-tab.md` to state that Paste visibility tracks whether the clipboard is armed while the row menu is open. Check public documentation for an existing description of this behavior and update it only if this fix changes what it describes.
6. Remove only the resolved entry from `product/backlog/technical-debt.md` and promote this plan to `product/plans/complete/`.
7. Run `$janissary/scripts/run.mjs check-diff` and ship through `ai/tasks/workspace/merge-change-to-master.md`.

## Tests

- `web/src/file-navigator/useFileNavigatorPaste.test.ts`: `armed` starts false and updates when the store is armed or cleared; `cut` stores the paths and hook host; `disarm` clears the clipboard.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: an open row menu gains and loses Paste as the app-wide clipboard is armed and cleared.
- Keep the existing end-to-end cut, paste, and Escape tests passing.

## Out of scope

- Replacing the module-level clipboard store with an injected instance.
- Changing clipboard contents, cross-host behavior, paste routing, or keyboard behavior.
- Changing any backlog entry other than the resolved item.
