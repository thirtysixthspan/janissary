<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's promised test that the real bundled editor persona loads with the `ask` role.

Existing Issue: The loader tests assert the `ask` role on the two real bundled monitor personas but never load the real bundled editor persona, so the plan's named editor-persona coverage is absent. Severity: 4/10

Existing Risk: 4/10 - A malformed first-line conversion in the editor persona would ship undetected and break editor ACP suggestion requests at load time, with no test to catch the regression.

Proposal Risk: 1/10 - The work is a single test-only assertion with no production change, leaving only the residual risk of a brittle assertion on body content.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "add the missing real bundled editor persona load test". In `src/personas.test.ts`, add a test beside the existing real-file persona cases that calls `loadPersona('assistant', 'editor')` with the default project root and asserts `persona.role === 'ask'` plus a nonempty body, so the converted first line of `ai/personas/editor/assistant.md` is actually exercised. The existing real-file monitor tests and the `listPersonas` cases must keep passing untouched. Do not add a launcher-plugin reader test here: the plan assigns that to subplan 4, where `src/plugins/launcher/persona.ts` is actually changed. No production code changes are part of this work.
