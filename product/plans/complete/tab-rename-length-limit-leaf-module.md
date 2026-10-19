# Move the tab rename limit to a leaf module

## Complexity

4/10. This is a localized constant extraction with four import changes and no behavior change.

## Goal

Keep the browser's runtime import of `TAB_RENAME_MAX_LENGTH` independent of the server config loader, so Node filesystem and path modules do not enter the web main chunk.

## Approach

Define the unchanged value in import-free `src/tab/rename-limits.ts`. Import it directly from that module in server code, and through `@shared/tab/rename-limits` in the web app. Do not re-export it from `src/config.ts`.

## Implementation steps

1. Add the constant to `src/tab/rename-limits.ts` and remove its definition and comment from `src/config.ts`.
2. Repoint `src/tab/operations.ts`, `src/editor/rename.ts`, `web/src/TabItem.tsx`, and `web/src/editor/EditorMetaName.tsx` to the new module.
3. Check `src/config.test.ts` and relevant rename tests for imports from config. Keep tests in their current locations unless any test imports the constant from config.
4. Remove only this item and its associated detail from the ready section of `product/backlog/technical-debt.md`.
5. Run `./scripts/run.mjs check-diff` and `npm run build:web`. Inspect production output to verify that `node:fs` and `node:path` do not appear in the main chunk.

## Tests

Run the diff-scoped checks, including existing `src/tab/operations.test.ts` and `src/editor/rename.test.ts` coverage. No new tests are needed because the change only relocates an unchanged constant and the existing tests cover both server rename paths. `src/config.test.ts` does not import the constant.

## Documentation and scope

This is a compile/bundle structure fix with no observable behavior change, so no functional spec, help, or public user documentation update is needed. Do not modify `ai/guidelines/architecture-principles.md`; the technical-debt workflow's changed-file restriction excludes it.
