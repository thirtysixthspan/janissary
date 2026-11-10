# Share one literal codex deny-all expectation across the internal-tools, launch, and manager-fallback tests

**Complexity: 1/10** — no production lines or files (the fixture is test-only), 4 requirements, 2 test scenarios (p=3.12)

## Goal

Subplan 4 (`product/plans/complete/deny-internal-tools-4-internal-tool-policy.md`) pinned the codex deny-all launch configuration in three test files, each with its own hand-written copy: `CODEX_FEATURES_OFF` and `CODEX_TOOLS_OFF` in `src/acp/internal-tools.test.ts`, `CODEX_DENY_ALL` in `src/acp/launch.test.ts`, and `CODEX_FEATURES` plus `CODEX_CONFIG` in `src/acp/manager-fallback.test.ts`. A future codex key change has to be made identically in all three, and an author who updates only one gets unrelated-looking failures in the others. Keep one literal copy that all three suites import.

## Design decisions

- Name the module `src/acp/internal-tools-test-fixture.ts`, following the project's existing `*-test-fixture.ts` convention (`src/tab/root-tab-test-fixture.ts`, `src/http-test-fixture.ts`, `src/websocket-test-fixture.ts`).
- The name matches none of the vitest include patterns (`src/**/*.test.{ts,tsx}` and the `.unsandboxed`, `.sandbox`, and `.browser` test variants), so vitest never collects it as a test file.
- It sits inside knip's `project` glob (`src/**/*.{ts,tsx}`) and is reached from the three test files, which knip's vitest plugin treats as entries, so it is not reported as an unused file. Every export is imported by at least one test file, so no export is reported as unused either. The existing `*-test-fixture.ts` modules work the same way.
- Export three constants: `CODEX_FEATURES_OFF` (the twelve feature names written out, each `false`), `CODEX_TOOLS_OFF` (`update_plan` and `experimental_request_user_input`, each `{ enabled: false }`), and `CODEX_DENY_ALL` (`web_search: 'disabled'`, `features: CODEX_FEATURES_OFF`, `tools: CODEX_TOOLS_OFF`).
- The fixture must not import from `src/acp/internal-tools.ts`. A two-line comment above the constants says the names are literal on purpose, so a key dropped from `CODEX_DISABLED_FEATURES` fails every suite that expects the deny-all configuration.
- Leave every assertion's expected value unchanged. `manager-fallback.test.ts` keeps its `CODEX_CONFIG` as `model`, `model_reasoning_effort`, and a spread of `CODEX_DENY_ALL`, which is the same object it builds today.

## Implementation steps

1. Add `src/acp/internal-tools-test-fixture.ts` with the comment and the three exported constants.
2. `src/acp/internal-tools.test.ts`: delete the local `CODEX_FEATURES_OFF` and `CODEX_TOOLS_OFF` and import both from `./internal-tools-test-fixture.js`.
3. `src/acp/launch.test.ts`: delete the local `CODEX_DENY_ALL` and import it from `./internal-tools-test-fixture.js`.
4. `src/acp/manager-fallback.test.ts`: delete `CODEX_FEATURES`, rebuild `CODEX_CONFIG` as `{ model: CODEX.model, model_reasoning_effort: 'high', ...CODEX_DENY_ALL }`, and import `CODEX_DENY_ALL` from `./internal-tools-test-fixture.js`.
5. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- No new test cases. The internal-tools, launch, and manager-fallback suites keep passing with the same assertions.
- Check by hand that the independent check still holds: delete one name from `CODEX_DISABLED_FEATURES` in `src/acp/internal-tools.ts`, run the three suites, confirm each one fails, and restore the name.

## Spec and docs updates

- None. The change is test-only and alters no user-visible behavior, so no spec, help page, or user documentation changes.

## Out of scope

- Any change to `src/acp/internal-tools.ts` or the codex configuration it produces.
- Sharing the opencode or claude expectations, which are not duplicated across files.
