# Declare which managers release resources when a tab closes

## Complexity

5/10 — a new compile-checked list beside the existing dispose-order declaration, a rewrite of the tab-close walk that drops a double type assertion and a runtime probe, and three test files touched; all behavior-preserving.

## Goal

The tab-close walk in `src/tab/cleanup.ts` iterates the whole dispose order and calls `(managers[name] as unknown as TabReleasingManager | undefined)?.closeTab?.(label)`, so membership is decided by a double type assertion plus two optional chains at runtime, and the comment above `closeTabResources` was truncated mid-sentence in an earlier edit. A manager that renames or drops its per-tab release is silently skipped forever rather than failing to compile. Declare the participants.

## Approach

**In `src/managers.ts`,** beside `MANAGER_DISPOSE_ORDER` and its completeness check, add an explicit `MANAGER_TAB_RELEASE` list of the manager keys whose `closeTab(label: string)` the walk invokes — today `shell`, `schedule`, `pty`, `editorAcp`, `editorWatch`, `fileNavigator`, `acp`, `browser`, `questions`, `remote`, and `database` (confirmed against the source: `src/remote/manager.ts` declares `closeTab(label)`, so it belongs; the walk keeps its conditional guard). Type it so each named manager must actually declare `closeTab(label: string): void`: a mapped type over `ManagerRegistry` collects the managers whose type extends `{ closeTab(label: string): void }`, and a completeness constant in the shape of the existing `MANAGER_DISPOSE_ORDER_IS_COMPLETE` fails to compile naming any listed manager that does not qualify. The optional `TabReleasingManager` type is retired — the walk no longer needs it.

**In `src/tab/cleanup.ts`,** rewrite the loop to walk `MANAGER_TAB_RELEASE` instead of `MANAGER_DISPOSE_ORDER` with its two `name === …` skips, dropping the `as unknown as` assertion and the `?.closeTab?.` probe; keep the `remote` guard (`if (name === 'remote' && !tab.remote) continue`), the deferred `workspace` release, and the end-of-walk `database.closeAll()` exactly where they are. Repair the truncated comment above `closeTabResources` so it states which managers the walk covers and why `workspace`, `tab`, and `database`'s close-all are handled outside it.

**Tests:**
- `src/tab/cleanup.test.ts`'s "walks exactly the registry managers that define closeTab" case hard-codes the expected order; rewrite it to derive both the visited setup and the expectation from `MANAGER_TAB_RELEASE` (filtering `remote`, which the guard skips for a non-remote tab) rather than repeating the list. It keeps blanking the non-participating managers to `undefined`, which now proves the walk never touches them.
- `src/managers.test.ts` pins the dispose order's shape; give the new list the equivalent duplicate-entry assertion.

## Implementation

1. Add `MANAGER_TAB_RELEASE` and its type check to `src/managers.ts`; retire `TabReleasingManager`.
2. Rewrite the walk in `src/tab/cleanup.ts` and repair the comment.
3. Update `src/tab/cleanup.test.ts` and `src/managers.test.ts`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/managers.test.ts`: the new list has no duplicate entries and names only registered managers.
- `src/tab/cleanup.test.ts`: the walk case derives its expectation from the declared list; every other case keeps passing unchanged.

## Out of scope

- Changing which managers participate or what their `closeTab` does.
- The deferred workspace release, the last-tab `database.closeAll()`, or any other teardown behavior.
