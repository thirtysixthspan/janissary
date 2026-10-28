# Keep pickers out of the app-shell root

## Complexity

5/10 — move three focused helpers and their colocated tests, update two import sites, and add a client lint zone with test-file exemptions. The runtime logic stays unchanged.

## Goal

Keep the pickers feature and the published tab-plugin API from depending on app-shell root modules. Enforce the feature-to-root boundary in ESLint without blocking integration tests that intentionally compose features with the root `Sidebar`.

## Approach

Move the tab-navigation and queue key handlers into `web/src/pickers/`, and move recent-history selection and its tests beside the only picker consumer. Declare the tab-navigation entry shape in the picker module instead of importing the app-shell `TabEntry` type. The app-shell key dispatcher imports the picker handlers directly, while the plugin API publishes the existing shared picker handler from `shared/picker-keyboard`.

Add `notifications` to the client feature directory list and generate one feature-to-root zone per feature. The zones allow shared and feature directories, leaving sibling isolation to the existing feature-to-feature zones; the overlay-plugin layer remains covered by its dedicated restriction. Apply these root zones only to non-test source files; tests may import the app-shell `Sidebar` for integration coverage.

## Implementation steps

1. Move `handleTabNavKey` and `handleQueueKey` with their existing tests into focused picker modules and update `useWindowKeys` to import them there.
2. Move `getRecentHistory` and its tests into `web/src/pickers/`, update its sole consumer, and define `TabNavEntry` locally as `{ tab: TabView; index: number }`.
3. Change `web/src/plugins/api.ts` to publish `handlePickerKey` directly from `web/src/shared/picker-keyboard.ts` and remove the now-empty `web/src/keyboard-handlers.ts`.
4. Add the feature-to-root lint zones, include `notifications`, scope the new zones to non-test files, and add ESLint integration coverage for rejected root imports and intentional test imports.
5. Preserve all existing key-handler and history assertions in their new test locations.

## Tests

- Keep the existing picker-key and recent-history tests intact while splitting them beside their defining modules.
- Extend `src/eslint-feature-boundaries.test.ts` to prove that feature source files cannot import app-shell root modules, that notifications participates in the boundary, and that integration tests can still import the root `Sidebar`.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing picker behavior, keyboard bindings, or tab history semantics.
- Moving `web/src/tab-entries.ts`, which remains owned by the app shell and has multiple app-shell consumers.
- Reclassifying other app-shell root modules or changing tab-plugin API behavior.

## Documentation and specification impact

None. The refactor changes no observable behavior, so the keyboard-navigation and command-history specs remain accurate and no public documentation needs an update.
