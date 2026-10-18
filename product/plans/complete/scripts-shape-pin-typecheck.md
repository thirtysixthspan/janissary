# Scripts shape pin under the typecheck

**Complexity: 3/10.** One type-only pin moves into a host module the typecheck already compiles, one vacuous test case is replaced, and nothing changes at runtime or in config.

## Goal

The scripts plugin keeps its own copy of the runscript row and payload types, because its shared contract imports nothing. The copy is guarded by a type-level pin, but that pin sits in `src/plugins/scripts/shared.test.ts`, and no command compiles that file. The root tsconfig excludes `src/**/*.test.*`, the web tsconfig covers only `web/src` and `vite.config.ts`, and vitest runs no typecheck. So a host change to a runscript row field passes every gate, and the notify guard then drops every delivery without a sound. This plan moves the compile-time pin to the host module that builds those rows, which the root typecheck does compile, and leaves `shared.ts` import-free.

## Design decisions

The pin goes in `src/schedule/system/runscript-rows.ts`. That file produces the rows whenever the host changes their shape, so it is the place a drift has to fail. It is a non-test file under `src/`, so the root tsconfig includes it and `npm run typecheck:diff` compiles it. Core already imports a plugin's shared module at runtime (`src/harness/manager.ts` imports `SHELL_PROGRAM` from `../plugins/shell/shared.js`), so a type-only import from core into a plugin's shared contract is an accepted pattern here. The import is erased before anything runs.

Rejected: importing the host type into `shared.ts`. `ai/guidelines/plugins-tabs.md` says a plugin's `shared.ts` imports nothing, not even a type, and the entry's Proposal would break that rule.

Rejected: re-exporting the view through `src/plugins/api.ts`. The plugin's server files cannot import `../protocol.js` past the boundary lint, and re-exporting through the api does not give `shared.ts` a compile-time link either, since `shared.ts` still cannot import it.

Rejected: a root tsconfig change so the test file compiles. The root config excludes tests on purpose, and a single-file exception would be a config change when a producer file can host the pin without one. The repo prefers no config change.

Rejected: `satisfies` on the producer's return value. It checks only host-to-plugin. The original test pin checked both directions, and the mutual check keeps that.

The local copy stays. `ai/guidelines/plugins.md` (pre-ship checklist) says to confirm no wire type is redeclared locally, while `plugins-tabs.md` says the shared contract imports nothing. The more specific rule wins, so the copy stays and the pin is the mitigation. The tension is recorded here so a later reader does not reopen it as an oversight.

## Implementation

1. In `src/schedule/system/runscript-rows.ts`, add `import type { RunscriptRow } from '../../plugins/scripts/shared.js';` between the managers and protocol imports. In `readRunscriptRows`, bind the builder's result to `const rows: RunscriptRow[] = buildRunscriptRows(...)` and return `{ rows }`. The annotation checks the host rows against the plugin's copy, and returning them as `RunscriptsView` checks the copy against the host. Add one comment above the binding saying why the annotation is there. No emitted code changes.
2. In `src/plugins/scripts/shared.test.ts`, remove the `RunscriptRowView` and `RunscriptsView` import and the four pin constants (`asWireRow`, `asPluginRow`, `asWirePayload`, `asPluginPayload`). Replace the case `re-declares the runscript row and payload exactly`, which only compared those constants with themselves, with `accepts the rows the host builds` (see Tests). The guard cases below it stay byte-identical.
3. `src/plugins/scripts/shared.ts` does not change. It keeps its local types and its guards, and it keeps no import.

## Tests

- `accepts the rows the host builds`, in `src/plugins/scripts/shared.test.ts`, replaces the vacuous `re-declares` case. It passes `{ rows: buildRunscriptRows(['deploy'], () => 1, () => true) }` through `isScriptsPayload` and expects `true`. This is the runtime half of the drift check: a host builder that renames or drops a field makes the guard reject its output, and the test fails.
- The guard cases in the same file (complete payload, malformed payloads, name intent, create intent) are unchanged.
- The compile-time half has no runtime test. Its check is the typecheck of `src/schedule/system/runscript-rows.ts`, which runs in `check-diff` and in `npm run typecheck`.

## Verification

Run `./scripts/run.mjs check-diff`. It typechecks the root project, which now compiles the pin.

By reading, the root tsconfig includes `src/**/*.ts` and excludes `src/**/*.test.*`, so `src/schedule/system/runscript-rows.ts` is compiled and `shared.test.ts` is not. The `typecheck:diff` script runs `tsc -p tsconfig.json`, so the producer's pin is inside that check.

By reasoning, not by mutation: a rename or removal of a field in `RunscriptRowView`, or a retype such as `schedules: string`, makes `RunscriptRowView[]` unassignable to `RunscriptRow[]`, because a required property is missing or mistyped. The annotation fails the compile. A required field added to the plugin's copy and absent from the host fails the same direction. An optional field added on the host side passes, which is correct, because the guard does not read it. A narrowing or widening on the plugin side fails the return against `RunscriptsView`.

Confirm by reading that `src/plugins/scripts/shared.ts` still has no import line, and that `activate.ts` and `manifest.ts` are unchanged.

## Out of scope

`src/plugins/schedules/shared.test.ts` carries the same uncompiled type pin for `AggregatedScheduleView`, and `src/plugins/schedules/shared.ts` keeps the same local copy. Both are pre-existing debt and are not part of this fix.

No spec changes. The fix changes no behavior, and the guard's accepted and rejected shapes are the same.

The root tsconfig keeps excluding test files, and no tsconfig changes.
