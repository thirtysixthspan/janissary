# Resolve and validate a persona's role before opening an ACP connection

**Complexity: 3/10** — ~30 added lines across 3 files (helper plus two call sites), 3 requirements and 7 failure/resolution scenarios (p=4.68)

## Goal

A persona now names a role, but nothing yet checks that the role exists or can run a model. This subplan adds those checks at the two connection-opening call sites, the editor query handler and the monitor start path, so an unknown role or a role with no enabled model fails the persona load with the exact error and opens no connection. `loadPersona` remains a pure file parser; the checks live in the execution layer where the model catalog is available.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md`.

## Requirements

1. "When the persona is used, the role must be used in the acp connection" — the role named by the loaded persona is the one resolved and handed to the connection path at both call sites.
2. "Fail persona load with an error" — an unknown role throws `Unknown role "<role>" in persona "<name>".` and no ACP connection is opened.
3. "Fail the persona load" — a role whose entries are empty or all disabled throws `ACP: the <role> role lists no models.` before any connection is attempted; the message is produced by the existing `noRoleModels` helper.
4. "Reuse the core refusal" — this subplan only establishes that the role reaches the connection path; the refusal behaviour itself is delivered in subplan 4 on the core pipeline.

## Design decisions

- Role resolution uses `knownRoleSettings`, which returns `undefined` for a name that is neither in the roles file in effect nor in the built-in defaults; `readRoleSettings` is deliberately not used for this decision because it falls back to defaults and would hide an unknown name (linked to Assumption 1).
- The no-enabled-model check uses `managers.models.isKnownModel(harness, model)` over the resolved role's ordered entries. It happens at the call sites, not inside `loadPersona`, so the parser stays pure (linked to Assumption 2).
- A model disabled *after* a persona load is handled by the core pipeline's own fallback at prompt time; there is no revalidation on every query here.
- Both call sites share one small pure resolution helper rather than duplicating the two checks: `resolvePersonaRole(root, role, personaName, isKnownModel, home?)` lives in `src/acp/ask-role.ts` beside the role readers and returns the resolved settings or throws the exact error strings (linked to Assumption 3). Passing the persona name separately is what makes `Unknown role "<role>" in persona "<name>".` exact. Duplicate error strings at two call sites would trip `sonarjs/no-duplicate-string`.
- No signature change is needed in `EditorAcpManager`, `spawnMonitorSession` or the monitor session helpers: subplan 1 already put the role on `Persona`, so the existing `persona.role` value reaches the spawner unchanged. The only new call sites for the helper are `editorSuggest` and `MonitorManager.start`.
- The helper is invoked before any session or connection is requested at either call site; throwing is the failure contract, and the existing caller-level error handling renders the throw as a notification/transcript line (linked to Assumption 4).

## Preserved behavior

None found. The query-line interaction and status-pill behaviors are unchanged by this subplan and are carried and pinned in subplan 4.

## Assumptions

1. `knownRoleSettings` in `src/acp/ask-role.ts:67` returns `AcpRoleSettings | undefined` and distinguishes unknown names from defaults — `src/acp/ask-role.ts:71` (`return known ? settings : undefined`).
2. `isKnownModel` in `src/models/manager.ts:53` answers whether a harness/model pair is currently enabled — `src/models/manager.ts:54` (`return this.modelsFor(harness).includes(id)`).
3. `noRoleModels` in `src/acp/ask-role.ts:14` already formats `ACP: the <role> role lists no models.` — `src/acp/ask-role.ts:15` (`ACP: the ${role} role lists no models.`).
4. `editorSuggest` reports failures through `notify` with a `<persona>: <message>` prefix — `src/editor-suggest/handler.ts:52` (`notify(managers, 'editor-suggest', label, \`${persona.name}: ${failureMessage}\`)`).
5. `MonitorManager.start` catches a persona-load throw and returns its text via `errorText` — `src/monitor/manager.ts:51-55` (`try { persona = loadPersona(...) } catch (error) { return errorText(error); }`).
6. Role entries carry `harness`, `model` and optional `effort` — `src/plugins/roles/shared.ts` (`RoleEntry`), used by `AcpRoleSettings` at `src/acp/ask-role.ts:20`.

## Existing functionality

1. `knownRoleSettings` resolves a named role without creating a roles file — `src/acp/ask-role.ts:67` (`export function knownRoleSettings`).
2. `noRoleModels` produces the no-enabled-models string — `src/acp/ask-role.ts:14` (`export function noRoleModels`).
3. `managers.models.isKnownModel` filters disabled catalog entries — `src/models/manager.ts:53` (`isKnownModel(harness: string, id: string): boolean`).
4. `AcpRoleSettings.entries` holds the ordered attempts for a role — `src/acp/ask-role.ts:20` (`export type AcpRoleSettings = { name: string; entries: RoleEntry[]; commands: string[] }`).
5. The monitor start path's existing `try/catch` around persona load already turns a thrown error into a returned message — `src/monitor/manager.ts:51`.

## Implementation steps

1. In `src/acp/ask-role.ts`, add the pure `resolvePersonaRole(root, role, personaName, isKnownModel, home?)` helper. It calls `knownRoleSettings(root, role, home)`, throws `Unknown role "${role}" in persona "${personaName}".` when that returns `undefined`, then filters the settings' entries with `isKnownModel(harness, model)`, and throws `noRoleModels(role)` when the filtered list is empty. Return the settings (with the filtered entries) to the caller. Keep the existing readers untouched and do not change any exported signature they rely on. Because the helper filters entries only for the caller's decision, return the original `entries` as well as the filtered list rather than mutating shared settings. All relative imports in this file keep their `.js` extensions.
2. In `src/editor-suggest/handler.ts`, wrap `loadPersona` and the helper call in one `try/catch`: on a throw, call `notify(managers, 'editor-suggest', label, \`${params.persona}: ${errorText(error)}\`)` and `callback({ hunks: [] })`, then return. On success, continue with the unchanged `EditorAcpManager.session` path; `persona.role` already reaches `spawnMonitorSession` through the `Persona` value from subplan 1, so no spawner signature changes here. Import `errorText` from `../error-text.js`. No session or connection may be requested before validation succeeds. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/monitor/manager.ts`, inside `start`, call the same helper immediately after `loadPersona` succeeds and before `createMonitorSession`/`primeMonitorSession`. Pass `this.managers.tab.launchDir`, `persona.role`, `persona.name` and `this.managers.models.isKnownModel`. Because `start` already wraps persona loading in `try/catch` at `src/monitor/manager.ts:51-55`, the helper's throw surfaces as the returned error string without further plumbing. Do not open a session before resolution succeeds, and do not change the `spawn` constructor parameter or any `MonitorSub` field here. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add tests (see Tests). Build command for every step: `$janissary/scripts/run.mjs check-diff`; every step leaves the tree green.

## UI design

1. No new surface. A failed persona request keeps the existing editor notification wording and the existing monitor error line; the pill and query line are untouched.
2. No connection row changes: rows still come from the current editor-persona and monitor paths until subplans 4 to 6 replace them.

## Tests

1. `src/editor-suggest/handler.test.ts` covers Requirement 1 (the named role reaches the connection path), Requirement 2 (unknown role throws the exact string and `spawnMonitorSession` is not invoked) and Requirement 3 (a role whose entries are all disabled throws `noRoleModels` before a session is opened).
2. `src/monitor/manager.test.ts` covers Requirements 2 and 3 for the monitor start path: an unknown role and an all-disabled role return the exact error and no session is spawned.
3. A colocated `src/acp/ask-role.test.ts` case (or the existing file if the helper's tests live there) pins the helper itself: unknown name throws the persona-worded string, empty entries throw the no-models string, and an entry list with one enabled model resolves. These pin Requirement 3's exact message without going through a UI path.

## Out of scope

- The core refusal, custom role typing and generic close are subplan 3 and later; this subplan does not widen any role type.
- Moving either consumer onto `AcpManager.promptResult` is subplans 4 and 5. The role validation added here must be carried forward unchanged into those subplans.
- No documentation page is written; the prose-page candidate remains a follow-up.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete end-to-end check against the running app, start a monitor with a persona whose first line names a role absent from the roles file and confirm the command returns `Unknown role "<role>" in persona "<name>".` with no monitor tab and no ACP connection created; then temporarily point a shipped persona at a role whose entries are all disabled and confirm `ACP: the <role> role lists no models.` appears instead of a connection. Restore the persona file afterwards.
