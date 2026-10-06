# Require every tab releaser in the close list

**Complexity: 3/10** — the manager registry already derives which managers declare `closeTab`; this adds the reverse type check and one assertion in the existing manager registry tests. Runtime cleanup behavior does not change.

## Goal

Make TypeScript fail when a manager with a `closeTab(label)` method is omitted from `MANAGER_TAB_RELEASE`, so adding a per-tab releaser cannot silently bypass the tab-close walk.

## Approach

Derive manager names that declare `closeTab` but are absent from `MANAGER_TAB_RELEASE`, then use the same `never`-guarded exported constant pattern as the dispose-order completeness check. Keep the existing typed-membership and duplicate-name checks.

## Implementation steps

1. In `src/managers.ts`, add the reverse completeness type and exported assertion beside `MANAGER_TAB_RELEASE_IS_TYPED`.
2. In `src/managers.test.ts`, import the assertion and verify it is `true`, retaining the existing duplicate-name test.

## Tests

- Run `./scripts/run.mjs check-diff` after each change. The manager tests assert the compile-time completeness marker; `src/tab/cleanup.test.ts` already verifies that the declared list drives the runtime walk and that its exceptions remain intact.

## Spec and documentation

No user-visible behavior changes. The existing close-tab contract in `product/specs/tabs.md` already describes releasing tab-associated resources; no spec or public documentation change is needed.

## Out of scope

- Changing the release list or its order.
- Changing tab-close runtime behavior or the remote-tab exception.
- Changing `MANAGER_DISPOSE_ORDER`.
