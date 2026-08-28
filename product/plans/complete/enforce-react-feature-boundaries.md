# Enforce React feature boundaries

**Complexity: 6/10** — the runtime change is path-only, but it relocates two cohesive directory trees, lifts one shared component, updates imports across the app shell and tests, and adds a mechanically verified ESLint boundary matrix.

## Goal

Remove every current cross-feature import in `web/src/` and make a future import between sibling feature directories fail lint. Shared UI remains importable by any feature, while the shared layer itself cannot import a feature.

## Approach

Treat the transcript as shared UI because both agent tabs and the notifications view render it. Move the whole directory to `web/src/shared/transcript/` so its internal modules and tests stay together. Lift `AgentTabMeta` and its test to `web/src/shared/` because agent, harness, and shell tabs all render it.

Treat command input as part of the agent-tab capability. Its only runtime component consumers are the two agent-tab bodies, while the app shell imports its submit hook to compose that feature. Move the directory intact to `web/src/agent-tabs/command-input/`.

Add `import-x/no-restricted-paths` zones for the current ordinary feature directories: `agent-tabs`, `editor`, `file-navigator`, `harness`, `QuitDialog`, and `SaveChangesDialog`. Each feature may import itself, root-level shared/app contracts, and `shared`, but not a sibling feature. A separate zone prevents `shared` from importing any feature. The plugin tree keeps its stricter existing plugin-specific rules and is not folded into this matrix.

## Implementation steps

1. Move `AgentTabMeta.tsx` and its test from `agent-tabs/` to `shared/`, then repoint agent, harness, and shell consumers.
2. Move the complete `transcript/` directory to `shared/transcript/`, adjust its root-relative imports, and repoint `App.tsx`, `NotificationsTab.tsx`, and both agent-tab bodies.
3. Move the complete `command-input/` directory to `agent-tabs/command-input/`, adjust its root-relative imports, and repoint `App.tsx` and both agent-tab bodies.
4. Add generated pairwise `import-x/no-restricted-paths` zones to `eslint.config.mjs`, including the shared-to-feature restriction.
5. Add an ESLint integration test that proves a harness-to-agent import is rejected while imports from the same feature and from `shared` remain allowed.

## Tests

- Existing colocated metadata, transcript, command-input, agent-tab, harness, shell, notifications, and app tests move or run with import-only changes and must pass unchanged.
- `src/eslint-feature-boundaries.test.ts` invokes the repository ESLint config against in-memory imports and asserts the new rule rejects a sibling feature path without rejecting same-feature or shared paths.
- Run `./scripts/run.mjs check-diff` after each relocation and after enabling the rule.

## Out of scope

- Reclassifying every flat `web/src/` module into explicit shared and app-shell directories.
- Applying the ordinary feature matrix to `web/src/plugins/`, whose stricter lazy-loading and host/plugin rules already have dedicated enforcement.
- Moving picker overlays; that is the next separate technical-debt item and will add `pickers` to the feature list when it creates that directory.
- Renaming `AgentTabMeta` or changing metadata, transcript, command-input, CSS, specs, help, or public behavior.
