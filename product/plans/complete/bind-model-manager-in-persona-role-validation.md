# Bind the model manager in persona role validation

**Complexity: 3/10** — ~4 added production lines across 2 call sites, 7 behavioral requirements and 7 test scenarios (p=4.63)

## Goal

Persona role validation filters a role's configured entries through the model manager's `isKnownModel` to decide whether any enabled model remains. Both call sites hand the prototype method `managers.models.isKnownModel` to `resolvePersonaRole` as a bare function reference; that method reads `this.modelsFor(...)`, so once a role has entries to filter, the call throws a `TypeError` instead of returning a boolean. This plan binds the method to its manager at both call sites so validation runs against the real catalog, while leaving the helper's behavior and exact error strings untouched.

## Requirements

1. "At both call sites — `editorSuggest` in `src/editor-suggest/handler.ts` and `start` in `src/monitor/manager.ts` — stop passing the bare method reference" — neither call site passes `managers.models.isKnownModel` / `this.managers.models.isKnownModel` directly as the callback argument.
2. "pass a bound wrapper such as `(harness, model) => managers.models.isKnownModel(harness, model)` so the call inside `resolvePersonaRole` ... keeps its receiver" — each call site passes a function that invokes `isKnownModel` as a method on the model-manager object, so `this` inside `isKnownModel` is that manager.
3. "Keep the helper's behavior and exact error strings" — `src/acp/ask-role.ts` is not modified; `resolvePersonaRole` keeps its callback signature and its two thrown messages.
4. "change at least one call-site test to use a receiver-dependent stub whose body reads `this`, matching `ModelCatalogManager.isKnownModel`, or add an integration test wired to the real `managers.models`, so the lost-binding regression is caught" — both call-site test files gain a regression test whose `isKnownModel` stub reads a property through `this`, a test that fails with the current unbound call and passes with the wrapper.

## Design decisions

- Fix the two call sites rather than the helper: the helper already calls its callback correctly as a bare function, and changing its signature would ripple through its direct unit tests and every caller (linked to Assumptions 1–3).
- Use an inline arrow wrapper at each call site instead of `Function.bind`, matching the suggestion in the recorded Proposal and keeping the change local (linked to Assumption 4).
- Keep the helper's exact error strings and behavior; no logic in `src/acp/ask-role.ts` changes (linked to Assumption 3).
- Add a receiver-dependent stub test at each call site so the regression is caught on both paths, not just one (linked to Assumption 5).
- No spec or help update: this is an internal bug fix that restores intended behavior, touches no command, flag, or key binding, and the recorded entry calls for no description correction (linked to Assumptions 6–7). User and developer documentation is owned by `update-documentation.md`.

## Preserved behavior

1. A valid persona opens a connection carrying the persona's named role, not a fallback or a crash — it must not notify an error or abort before the session is created. Pinned by `src/editor-suggest/handler.test.ts` ("passes the persona's role through to the connection path").
2. An unknown role returns `Unknown role "<role>" in persona "<name>".` and opens no connection — it must not produce any other message. Pinned by `src/editor-suggest/handler.test.ts` ("notifies the exact unknown-role error and opens no connection").
3. A role whose entries are all disabled returns `ACP: the <role> role lists no models.` with no session spawned — it must not surface a `TypeError` or any generic error. Pinned by `src/monitor/manager.test.ts` ("returns the no-models error and spawns no session").

## Assumptions

1. `resolvePersonaRole` calls its callback as a bare function — `src/acp/ask-role.ts:87` (`entries.filter((entry) => isKnownModel(entry.harness, entry.model))`).
2. The only two production call sites pass the method reference unbound — `src/editor-suggest/handler.ts:51` (`resolvePersonaRole(cwd, persona.role, persona.name, managers.models.isKnownModel);`) and `src/monitor/manager.ts:55` (`this.managers.tab.launchDir, persona.role, persona.name, this.managers.models.isKnownModel,`).
3. The helper's thrown strings are fixed and unchanged — `src/acp/ask-role.ts:85` (`Unknown role "${role}" in persona "${name}".`) and `src/acp/ask-role.ts:88` (`noRoleModels(role as AcpRole)`).
4. The method needs its receiver — `src/models/manager.ts:53` (`isKnownModel(harness: string, id: string): boolean {`) and `src/models/manager.ts:54` (`return this.modelsFor(harness).includes(id);`).
5. The existing call-site tests inject receiver-independent stubs, which is why they pass today — `src/editor-suggest/handler.test.ts:27` (`isKnownModel ... = () => true`) and `src/monitor/manager.test.ts:52` (`isKnownModel ... = () => true`).
6. No spec under `product/specs/` describes this binding defect, and no page under `help/` describes the internal callback.
7. The recorded backlog entry's Proposal asks for no correction to the pull request description.

## Existing functionality

1. The `resolvePersonaRole` helper that performs the validation — `src/acp/ask-role.ts:80` (`export function resolvePersonaRole`).
2. The `ModelCatalogManager.isKnownModel` method whose receiver must be preserved — `src/models/manager.ts:53` (`isKnownModel(harness: string, id: string): boolean {`).
3. The `editorSuggest` validation call site — `src/editor-suggest/handler.ts:51` (`resolvePersonaRole(cwd, persona.role, persona.name, managers.models.isKnownModel);`).
4. The `MonitorManager.start` validation call site — `src/monitor/manager.ts:54` (`resolvePersonaRole(`).
5. The call-site test suites that pin the three preserved behaviors — `src/editor-suggest/handler.test.ts:45` (`describe('editorSuggest'`) and `src/monitor/manager.test.ts:145` (`describe('MonitorManager'`).

## Implementation steps

1. In `src/editor-suggest/handler.ts`, replace the fourth argument to `resolvePersonaRole` at line 51 with an inline arrow that calls `managers.models.isKnownModel(harness, model)` as a method, preserving `cwd`, `persona.role`, `persona.name`, and the surrounding try/catch unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/manager.ts`, replace the fourth argument to `resolvePersonaRole` at lines 54–56 with an inline arrow that calls `this.managers.models.isKnownModel(harness, model)` as a method, preserving `this.managers.tab.launchDir`, `persona.role`, `persona.name`, and the surrounding try/catch unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Leave `src/acp/ask-role.ts` byte-for-byte unchanged, so the callback contract and the exact error strings stay as they are. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user-visible surface is added or changed. The repair keeps the existing notification and error text identical; no component, style, layout, or key binding is touched.

## Tests

1. `src/editor-suggest/handler.test.ts` — add a regression test for Requirement 4 with an `isKnownModel` stub whose body reads a property through `this` (mirroring `ModelCatalogManager.isKnownModel`), asserting that a valid persona still opens a session and posts no error notification; this fails with the current bare-method call and passes with the wrapper.
2. `src/monitor/manager.test.ts` — add a matching regression test for Requirement 4 with a receiver-dependent `isKnownModel` stub, asserting that `start` returns `null` and spawns a session; this fails with the current bare-method call and passes with the wrapper.
3. The existing tests named in Preserved behavior 1–3 keep passing unchanged, confirming the named-role, unknown-role, and no-models behavior after the fix.

## Out of scope

- No change to `src/acp/ask-role.ts` or its callback signature.
- No spec file update: the fix restores intended internal behavior rather than changing what the feature does. User and developer documentation is owned by `update-documentation.md`.
- No help page changes; no command, flag, or key binding is touched.
- No edits to `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No change to the pull request title or description.
- No other backlog entries.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete check against the running app: with a project whose roles file gives a persona a role with enabled models, trigger an editor suggestion for that persona and start a monitor with that persona; both must open their ACP sessions (the monitor's `start` returns `null`, the editor suggestion produces a reply) with no `TypeError` notification, while an unknown role still reports `Unknown role "<role>" in persona "<name>".` and an all-disabled role still reports `ACP: the <role> role lists no models.` without spawning a session. A `Cannot read properties of undefined` message in either path means the fix was not applied.
