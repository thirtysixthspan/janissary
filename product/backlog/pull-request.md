<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the obsolete harness and tools fields from monitor test persona fixtures after the persona type change.

Existing Issue: Three monitor test files still build `Persona` fixtures with the removed `harness`/`tools` shape and no `role`, so the fixtures describe a persona format the loader no longer accepts. Severity: 2/10

Existing Risk: 2/10 - A reader can infer that personas still carry a harness directive and tool allowlist, and the fixtures would fail to compile the moment test files joined the typecheck project.

Proposal Risk: 1/10 - The cleanup changes only test data, so the residual risk is a fixture that no longer carries a field a future test expects.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "clean stale persona fixtures in the monitor tests". In `src/monitor/info.test.ts`, `src/monitor/stop.test.ts`, and `src/monitor/session.test.ts`, reduce each `Persona` object literal to `name`, `role`, and `body`, adding a `role` where it is missing in `src/monitor/info.test.ts` and dropping the leftover `harness` and `tools` properties in all three. Keep every current assertion intact; no production code changes belong in this work. The real bundled persona tests in `src/personas.test.ts` and the launcher reader tests in `src/plugins/launcher/persona.test.ts` already cover the new format and must keep passing.
