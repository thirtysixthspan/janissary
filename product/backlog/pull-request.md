<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's role validation so the no-enabled-model check uses the real model manager instead of throwing a TypeError

Existing Issue: `resolvePersonaRole` invokes the `isKnownModel` callback as a bare function, but both call sites pass `managers.models.isKnownModel` unbound, and that prototype method reads `this.modelsFor(...)` — so filtering a role's non-empty entries throws `TypeError: Cannot read properties of undefined` in real use. Severity: 9/10

Existing Risk: 9/10 - Every editor suggestion and monitor start with a valid role fails validation with a cryptic TypeError notification or error line, opens no ACP connection, and never produces the exact no-models message the plan promises.

Proposal Risk: 2/10 - With the callback bound to its manager the real entries filter runs normally; the remaining risk is an ordinary model-filtering edge case already covered by the existing model-manager tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "bind isKnownModel so persona role validation works at runtime". At both call sites — `editorSuggest` in `src/editor-suggest/handler.ts` and `start` in `src/monitor/manager.ts` — stop passing the bare method reference `managers.models.isKnownModel` / `this.managers.models.isKnownModel`; pass a bound wrapper such as `(harness, model) => managers.models.isKnownModel(harness, model)` so the call inside `resolvePersonaRole` in `src/acp/ask-role.ts` keeps its receiver (equivalently, have the helper accept the model manager and invoke the method on it). The three test files touched here (`src/acp/ask-role.test.ts`, `src/editor-suggest/handler.test.ts`, `src/monitor/manager.test.ts`) all inject plain `() => true`/`() => false` functions as `isKnownModel`, which is why they pass while production breaks; change at least one call-site test to use a receiver-dependent stub whose body reads `this`, matching `ModelCatalogManager.isKnownModel`, or add an integration test wired to the real `managers.models`, so the lost-binding regression is caught. Then re-verify the subplan's checks: a valid persona opens a connection with the named role, an unknown role returns the exact unknown-role string, and a role whose entries are all disabled returns `ACP: the <role> role lists no models.` with no session spawned.
