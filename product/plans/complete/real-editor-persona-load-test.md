# Test that the real bundled editor persona loads with the ask role

**Complexity: 1/10** — test-only change: 0 production lines edited, 0 production files, 0 behavioral requirements, 1 test scenario (p=1.834)

## Goal

Close the coverage gap left by the persona-role pipeline plans: the loader suite proves that the real bundled *monitor* personas carry the `ask` role, but never loads the real bundled *editor* persona, so a broken role-directive conversion in `ai/personas/editor/assistant.md` could ship undetected. Add one colocated test that exercises that real file through `loadPersona`.

## Approach

Place a new case beside the existing real-file persona cases in `src/personas.test.ts`. It calls `loadPersona('assistant', 'editor')` with no root argument so the default project root (`process.cwd()`) reads the actual bundled `ai/personas/editor/assistant.md`, then asserts the converted first line produced `role === 'ask'` and that the body is nonempty. Leave the existing real-file monitor tests, the `listPersonas` cases, and all production code untouched.

## Implementation steps

1. In `src/personas.test.ts`, add a new `describe` block for the editor assistant persona immediately after the existing `the assistant persona` block, mirroring its real-file style and comment convention.
2. Add one test that loads `loadPersona('assistant', 'editor')` with the default root and asserts `persona.role` is `'ask'` and `persona.body.length` is greater than zero.
3. Remove the resolved backlog entry from `product/backlog/pull-request.md`.

## Tests

Run `$janissary/scripts/run.mjs check-diff`. The new case in `src/personas.test.ts` is itself the test: it confirms the bundled editor persona's converted first line is parsed as the `ask` role and that the file has a prompt body. Confirm all existing real-file monitor tests and `listPersonas` cases still pass unchanged, and that the server test suite is green. Record the expected cross-subplan TypeScript errors in `src/monitor/acp.ts`, `src/acp/launch.ts`, and editor/launcher consumers (files owned by later subplans that still reference the retired `harness`/`tools` fields) and do not edit them.

## Out of scope

No production code changes. No launcher-plugin persona reader test (`src/plugins/launcher/persona.ts` is owned by subplan 4). No changes to the monitor real-file tests or the `listPersonas` cases. No spec or help/documentation changes — this adds test coverage only and changes no documented behavior. No PR description correction.
