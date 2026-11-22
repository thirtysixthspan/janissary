# Clean stale persona fixtures in the monitor tests

**Complexity: 1/10** — zero production-code counts (no production lines, files, requirements, scenarios, or units; tests excluded), p=1.58

## Goal

Bring the `Persona` object literals in the three monitor test files in line with the current `{ name, role, body }` type so the fixtures describe the format the loader now produces, without changing any assertion or any production code.

## Approach

The persona type change reducing `Persona` to `name`, `role`, and `body` left three monitor test files building fixtures with the removed `harness` and `tools` properties, and `info.test.ts` without a `role` at all. Remove the obsolete properties from every fixture and add a `role` to the `info.test.ts` helper. Keep every existing assertion and test body untouched — this is test-data hygiene only. The real bundled persona tests (`src/personas.test.ts`) and launcher reader tests (`src/plugins/launcher/persona.test.ts`) already cover the new format and must keep passing.

## Implementation steps

1. In `src/monitor/info.test.ts`, reduce the `persona` helper's returned object from `name`, `harness`, `body`, `tools` to `name`, `role`, `body`, adding `role: 'research'` to match the other monitor fixtures. Leave the helper signature and every assertion unchanged. Verify with `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/stop.test.ts`, reduce the inline `persona` fixture in `makeMonitor` to `name`, `role`, `body` by dropping `harness` and `tools` (its `role` is already present). Verify with `$janissary/scripts/run.mjs check-diff`.
3. In `src/monitor/session.test.ts`, reduce the `makePersona` fixture to `name`, `role`, `body` by dropping `tools` (its `role` is already present, and it has no `harness`). Verify with `$janissary/scripts/run.mjs check-diff`.
4. No spec, help-page, user-documentation, or PR-description change is needed: no user-visible behavior changes. Promote the plan, remove the resolved backlog entry (restoring the empty skeleton), and publish.

## Tests

- No new tests: this work only corrects existing test fixture data. Every current assertion in the three files stays intact.
- The three edited suites (`src/monitor/info.test.ts`, `src/monitor/stop.test.ts`, `src/monitor/session.test.ts`) must still pass.
- The real bundled persona tests (`src/personas.test.ts`) and launcher reader tests (`src/plugins/launcher/persona.test.ts`) must keep passing unchanged.

## Out of scope

- Any production code change.
- Changing any assertion, test case, or test helper signature beyond the fixture object literals.
- Editing specs, help pages, user documentation, or the PR description.
