# Narrow the patch change builder's view dependency

**Complexity: 3/10** — about 7 added lines across 2 production files, 3 requirements and 2 fixture scenarios (p=3.90).

## Goal

`buildPatchChanges` in `src/file-patch/changes.ts` should declare only the read surface it uses, so its type records the two methods it actually calls instead of the full mutable `PatchView`. The two inline view fixtures in `src/file-patch/sections.test.ts` should conform to that same declared contract instead of omitting required members that no compiler currently checks.

## Approach

Add a read-only `PatchViewReads` interface to `src/file-patch/view.ts` with `places(): readonly PatchPlace[]` and `plannedFolders(): readonly string[]`. Make `PatchView` extend it, so the concrete view created by `createPatchView` still satisfies the full mutation contract while readers depend only on the narrow one.

Change `buildPatchChanges` to accept `PatchViewReads`. Every real caller still passes a `PatchView`, which remains assignable to the narrowed type, so no production behavior changes. The patch record's deletes, writes, moves, and folders are computed exactly as before.

Update the two inline fixtures in `sections.test.ts` — `indexes removed locations once when deriving many writes` and `tracks and reports many moves without repeatedly scanning chains` — to declare `PatchViewReads` and keep only `places` and `plannedFolders`. The fixtures never call `contents`, `resolve`, `resolveLink`, or `setExists`, and the narrowed function type now prevents `buildPatchChanges` from calling them at all, which makes the old throwing `resolve` stub unnecessary. Both performance assertions stay untouched: exactly 1000 `location` reads in the first test and fewer than 40,000 chain reads in the second. Every other section test stays unchanged.

`tsconfig.json` still excludes `**/*.test.*`, so the build does not typecheck the fixtures today. The annotations are still the correct contract documentation and become compiler-enforced if test typechecking is ever enabled. Enabling it is outside this debt payment.

## Implementation steps

1. In `src/file-patch/view.ts`, export `PatchViewReads` with `places()` and `plannedFolders()`, and have `PatchView extends PatchViewReads` while retaining its mutation members.
2. In `src/file-patch/changes.ts`, import `PatchViewReads` instead of `PatchView` and change `buildPatchChanges`'s first parameter to it.
3. In `src/file-patch/sections.test.ts`, import the type and annotate both inline view fixtures as `PatchViewReads`, dropping their unused `contents` and `resolve` members.
4. Run `$janissary/scripts/run.mjs check-diff` after the change.

## Tests

No new test cases. This is a type-only refactor with no behavior change; the existing `sections.test.ts` cases cover patch change assembly, including the two performance fixtures being updated. The production typecheck proves `PatchView` is assignable where `PatchViewReads` is accepted. Run `$janissary/scripts/run.mjs check-diff` to confirm the server suite still passes.

## Out of scope

- Enabling typechecking for test files by changing `tsconfig.json`.
- Changing patch change assembly, folder derivation, delete/write/move selection, or either performance assertion.
- Spec or help updates, because no user-visible behavior changes.
