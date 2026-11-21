# Guard the published plugin API against missing named exports

**Complexity: 1/10** — 0 production lines and 0 production files edited (the change is a test module and one spec sentence), 2 requirements and 5 test scenarios (p=3.014); a focused regression guard that closes a test gap without touching production code.

The connections plugin has been reported failing at activation with `Tab plugin "connections" disabled: The requested module '../api.js' does not provide an export named 'isEmptyIntent'.` A bundled plugin's activation module imports shared values from the published plugin API (`src/plugins/api.ts`); if that API stops exporting one of those names, the dynamic import that loads the plugin throws before `activate()` runs and the failure boundary disables the plugin for the process. The shared intent guards were published in #2139, so the current source loads cleanly and the report does not reproduce here. What is missing is a check on the contract itself: a future edit that drops a re-export would reintroduce the same user-visible failure, and the existing loader test would only catch it as an opaque module-load error.

## Goal

Every named runtime value a bundled plugin imports from the published plugin API is actually exported by that API, verified by a test in the normal server suite. A dropped re-export fails a test with a message naming the plugin file and symbol, instead of disabling a plugin in a running application.

## Design decisions

**Scan the source rather than keep a hand-maintained list.** The contract is defined by what the plugin modules import, so the test reads those imports directly. A list of expected exports would drift the moment a plugin starts using a new published helper, and would miss a plugin that imports a name no one remembered to add.

**Check the module namespace at runtime, not the TypeScript types.** A missing named export is a runtime ESM error, not a type error; asserting against the imported module object catches exactly the failure the user saw. Type-only imports are skipped, because they are erased before the module is loaded and cannot cause this error.

**Pin the reported case explicitly.** The test asserts that the connections activation module's import set includes `isEmptyIntent` and that the three shared intent guards (`isEmptyIntent`, `isIdIntent`, `isRefreshIntent`) are callable exports. That keeps the guard tied to the original report even if the plugin later stops importing one of them.

## Implementation steps

1. Add `src/plugins/api-contract.test.ts`. It enumerates every `*.ts` file under `src/plugins/` (excluding `*.test.ts`), extracts named value imports from `../api.js`, and asserts each imported name is present on the imported `./api.js` namespace module. It also asserts the connections activation module imports `isEmptyIntent` and that the three shared guards are callable functions. Keep the helpers small and the file under 200 lines.
2. Run `$janissary/scripts/run.mjs check-diff` and fix any lint, type, or test failure before continuing.

## Tests

The new module carries five scenarios:

- The scanner reads `isEmptyIntent` out of `src/plugins/connections/activate.ts` (guards against a vacuous pass if the extractor breaks).
- Every value imported from `../api.js` by any bundled plugin source file is a key on the published API namespace.
- `isEmptyIntent`, `isIdIntent`, and `isRefreshIntent` are each callable exports.

The existing `src/plugins/loaders.test.ts` suite stays green and continues to verify that every activation module loads; the new test explains a failure there in terms of the missing export.

## Spec

Update `product/specs/tab-plugins.md` in the paragraph that describes the shared intent guards: state that all bundled plugins apply the same published guard definitions from the plugin API, so a plugin cannot silently use a different rule from the rest.

## Out of scope

- No change to the guard definitions, the plugin API exports, or `TAB_PLUGIN_API_VERSION`; current source already publishes them.
- No change to how a failed import is reported or to the failure-boundary wording.
- No change to client plugin chunks; no web plugin imports these guards.
- No new documentation under `help/` or `documentation/user-documentation/`; behavior users see is unchanged.
